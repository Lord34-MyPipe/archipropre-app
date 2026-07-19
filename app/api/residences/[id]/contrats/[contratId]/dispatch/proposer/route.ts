import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { type DispatchJour, reglesDispatchPrompt, sanitiserDispatch } from '@/lib/dispatchSemaine'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic()
// P2-8 : modèle configurable via variable d'env, sans redéploiement code.
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

type Params = Promise<{ id: string; contratId: string }>

interface Creneau {
  jours: string[]
  heure_debut: string
  heure_fin: string
}

// ── Auth manager + ownership résidence + contrat (même pattern que les autres routes contrat) ──

async function resolveAndCheck(params: Params) {
  const { id: residenceId, contratId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const admin = await createAdminClient()

  const { data: residence } = await admin.from('residences')
    .select('id')
    .eq('id', residenceId)
    .eq('manager_id', user.id)
    .single()
  if (!residence) return { error: NextResponse.json({ error: 'Résidence introuvable ou non autorisée' }, { status: 403 }) }

  const { data: contrat } = await admin.from('contrats_residences')
    .select('id, creneaux_acceptes, jours_ramassage_containers')
    .eq('id', contratId)
    .eq('residence_id', residenceId)
    .single()
  if (!contrat) return { error: NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 }) }

  return { admin, residenceId, contratId, contrat }
}

// ── Prompt système — réutilise les règles R1-R5 partagées, sans réanalyser le contrat ──

function buildSystemPrompt(): string {
  return `Tu es un expert en planification de tournées de nettoyage pour Archipropre Services (société de nettoyage professionnel, Montpellier). On te fournit la structure bâtiments/zones déjà en place pour une résidence (elle ne change pas), le planning de passage actuel de l'agent, et éventuellement les jours de ramassage containers. Ta seule mission : produire une répartition semaine (dispatch_semaine) — quel bâtiment complet passe quel jour, quelles tournées transverses, et les mouvements containers.

RÈGLES DE SORTIE — ABSOLUES :
1. Réponds UNIQUEMENT avec un objet JSON valide de la forme { "dispatch_semaine": [...], "alertes": [...] }. Aucun texte avant ou après, aucun bloc markdown \`\`\`json, aucun préambule.
2. "alertes" est un tableau de chaînes (peut être vide) — utilise-le pour tout conflit ou dépassement détecté (cf règles R4/R5 ci-dessous).
3. Ne modifie, n'invente et ne supprime AUCUN bâtiment ni AUCUNE zone : utilise EXACTEMENT les noms fournis en contexte.

${reglesDispatchPrompt()}`
}

function buildUserMessage(params: {
  batiments: { nom: string; zones: string[] }[]
  joursPassage: string[]
  creneaux: Creneau[]
  joursRamassageContainers: string[]
  zonesBiHebdo: string[]
  enveloppeMinutesHebdo?: number
}): string {
  const { batiments, joursPassage, creneaux, joursRamassageContainers, zonesBiHebdo, enveloppeMinutesHebdo } = params
  const batimentsStr = batiments
    .map(b => `- ${b.nom} : ${b.zones.join(', ') || '(aucune zone nommée)'}`)
    .join('\n')
  const creneauxStr = creneaux
    .map(c => `${c.jours.join(', ')} de ${c.heure_debut} à ${c.heure_fin}`)
    .join(' ; ')
  const ramassageStr = joursRamassageContainers.length > 0
    ? joursRamassageContainers.join(', ')
    : 'non concerné — ne produis aucune entrée containers dans dispatch_semaine'

  // Zones bi-hebdomadaires (R3) : détectées côté serveur (≥2 tâches hebdo sur la
  // même zone en base — cf taches_template), pas devinées par le nom de la zone.
  // Noms fournis EXACTEMENT sous la forme "Bâtiment/Zone" attendue par R3 pour
  // tournees_transverses.zones — à reprendre tels quels, jamais reformulés.
  const zonesBiHebdoStr = zonesBiHebdo.length > 0
    ? `

ZONES EN PRESTATION BI-HEBDOMADAIRE (2×/semaine, R3)
Ces zones précises nécessitent 2 passages/semaine : le 1er fait partie du
nettoyage complet du bâtiment (batiments_complets), le 2e est une tournée
transverse (tournees_transverses) un autre jour, espacé d'au moins 2 jours.
Reprends EXACTEMENT ces noms "Bâtiment/Zone" dans tournees_transverses.zones :
${zonesBiHebdo.join('\n')}
Toute zone qui n'est PAS dans cette liste est hebdomadaire simple (1×/semaine, aucune tournée transverse à créer pour elle).`
    : ''

  // Enveloppe simulée (item 2, chantier "simulation taux rentable") : remplace
  // toute notion de temps réel actuel — n'est utilisée QUE si explicitement fournie
  // (rétrocompatibilité stricte du mode par défaut).
  const enveloppeStr = enveloppeMinutesHebdo != null
    ? `

ENVELOPPE DE TEMPS DISPONIBLE (simulation — remplace le temps réel actuel)
${Math.round(enveloppeMinutesHebdo)} min/semaine au total. Cette enveloppe remplace toute estimation du temps actuellement passé : vise à répartir les bâtiments et tournées de façon à ce que la SOMME de duree_totale_estimee_minutes sur toute la semaine se rapproche le plus possible de cette enveloppe, sans la dépasser significativement. Pour t'en approcher, tu peux réduire le nombre de jours de passage effectivement utilisés (parmi les jours de passage listés ci-dessus) en regroupant plusieurs bâtiments sur un même jour — tout en respectant strictement R1 (bâtiment entier, jamais réparti), R2 (répartition équitable sur les jours RETENUS), R3 et R4. N'invente, ne modifie et ne supprime AUCUN bâtiment ni AUCUNE zone réel(le) : tous doivent rester couverts sur la semaine, même si tu resserres le nombre de jours utilisés.`
    : ''

  return `BÂTIMENTS ET ZONES DE LA RÉSIDENCE (structure existante, ne pas modifier)
${batimentsStr || '(aucun bâtiment)'}

PLANNING ACTUEL DE L'AGENT (imposé — jamais un jour hors de cette liste)
Jours de passage : ${joursPassage.join(', ') || '(aucun)'}
Créneaux : ${creneauxStr || '(aucun)'}

JOURS DE RAMASSAGE CONTAINERS (agglo)
${ramassageStr}${zonesBiHebdoStr}${enveloppeStr}

Produis dispatch_semaine en respectant R1-R5.`
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const ctx = await resolveAndCheck(params)
  if ('error' in ctx) return ctx.error
  const { admin, contratId, contrat } = ctx

  const body = await req.json().catch(() => ({}))
  const joursRamassageContainers: string[] = Array.isArray(body?.joursRamassageContainers)
    ? body.joursRamassageContainers
    : (contrat.jours_ramassage_containers ?? [])
  // Simulation "au taux rentable" (item 2) — optionnel, absent = comportement inchangé.
  const enveloppeMinutesHebdo: number | undefined =
    typeof body?.enveloppeMinutesHebdo === 'number' && Number.isFinite(body.enveloppeMinutesHebdo) && body.enveloppeMinutesHebdo > 0
      ? body.enveloppeMinutesHebdo
      : undefined

  const creneaux: Creneau[] = Array.isArray(contrat.creneaux_acceptes) ? contrat.creneaux_acceptes : []
  const joursPassage = [...new Set(creneaux.flatMap(c => c.jours ?? []))]

  if (joursPassage.length === 0)
    return NextResponse.json({ error: "Ce contrat n'a aucun créneau de passage configuré." }, { status: 400 })

  // ── Structure existante — lecture seule, ne restructure rien (contrairement au mode "Analyser / restructurer") ──
  const { data: zones } = await admin.from('zones_residence')
    .select('id, nom, batiment')
    .eq('contrat_id', contratId)

  if (!zones?.length)
    return NextResponse.json({ error: 'Aucune zone configurée pour ce contrat.' }, { status: 400 })

  // Zones bi-hebdomadaires (R3) — détection GÉNÉRIQUE (pas propre à une
  // résidence) : une zone avec ≥2 tâches hebdo distinctes en base nécessite
  // 2 passages/semaine (mode simplifié = normalement 1 tâche/zone ; une 2e
  // tâche hebdo signale explicitement un 2e passage — cf correctif PRIEURE
  // halls). Absence totale de 2e tâche nulle part = comportement inchangé.
  const zoneIds = zones.map(z => z.id)
  const { data: tachesHebdo } = await admin.from('taches_template')
    .select('zone_id')
    .in('zone_id', zoneIds)
    .eq('frequence_type', 'hebdo')
  const nbTachesParZone = new Map<string, number>()
  for (const t of tachesHebdo ?? []) {
    if (!t.zone_id) continue
    nbTachesParZone.set(t.zone_id, (nbTachesParZone.get(t.zone_id) ?? 0) + 1)
  }

  const parBatiment = new Map<string, string[]>()
  const zonesBiHebdo: string[] = []
  for (const z of zones) {
    const nomBatiment = z.batiment?.trim() || '(mono-bâtiment)'
    const arr = parBatiment.get(nomBatiment) ?? []
    if (z.nom?.trim()) arr.push(z.nom.trim())
    parBatiment.set(nomBatiment, arr)
    if ((nbTachesParZone.get(z.id) ?? 0) >= 2 && z.nom?.trim()) {
      zonesBiHebdo.push(`${nomBatiment}/${z.nom.trim()}`)
    }
  }
  const batiments = [...parBatiment.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }))
    .map(([nom, zonesNoms]) => ({ nom, zones: zonesNoms }))

  const systemPrompt = buildSystemPrompt()
  const userMessage   = buildUserMessage({ batiments, joursPassage, creneaux, joursRamassageContainers, zonesBiHebdo, enveloppeMinutesHebdo })

  let rawText: string
  try {
    const response = await anthropic.messages.create({
      model:       MODEL,
      max_tokens:  8000,
      temperature: 0.3,
      system:      systemPrompt,
      messages:    [{ role: 'user', content: userMessage }],
    })
    if (response.stop_reason === 'max_tokens') {
      return NextResponse.json({
        error: 'La proposition est trop volumineuse pour cette résidence en un seul appel. Réessayez ou contactez le support.',
      }, { status: 422 })
    }
    rawText = response.content.filter(b => b.type === 'text').map(b => b.type === 'text' ? b.text : '').join('')
  } catch (e) {
    console.error('[dispatch/proposer] Appel Anthropic échoué:', e)
    return NextResponse.json({ error: "La proposition IA est temporairement indisponible. Réessayez dans un instant." }, { status: 503 })
  }

  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsedRaw: any
  try {
    parsedRaw = JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end   = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start)
      return NextResponse.json({ error: 'Proposition illisible, réessayez.' }, { status: 422 })
    try {
      parsedRaw = JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      return NextResponse.json({ error: 'Proposition illisible, réessayez.' }, { status: 422 })
    }
  }

  if (!parsedRaw || typeof parsedRaw !== 'object')
    return NextResponse.json({ error: 'Proposition illisible, réessayez.' }, { status: 422 })

  const dispatch: DispatchJour[] = sanitiserDispatch(parsedRaw.dispatch_semaine)
  const alertes: string[] = Array.isArray(parsedRaw.alertes)
    ? (parsedRaw.alertes as unknown[]).filter((a): a is string => typeof a === 'string')
    : []

  return NextResponse.json({ dispatch_semaine: dispatch, alertes, joursRamassageContainers, enveloppeMinutesHebdo })
}
