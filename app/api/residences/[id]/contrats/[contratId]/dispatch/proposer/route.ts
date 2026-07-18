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
}): string {
  const { batiments, joursPassage, creneaux, joursRamassageContainers } = params
  const batimentsStr = batiments
    .map(b => `- ${b.nom} : ${b.zones.join(', ') || '(aucune zone nommée)'}`)
    .join('\n')
  const creneauxStr = creneaux
    .map(c => `${c.jours.join(', ')} de ${c.heure_debut} à ${c.heure_fin}`)
    .join(' ; ')
  const ramassageStr = joursRamassageContainers.length > 0
    ? joursRamassageContainers.join(', ')
    : 'non concerné — ne produis aucune entrée containers dans dispatch_semaine'

  return `BÂTIMENTS ET ZONES DE LA RÉSIDENCE (structure existante, ne pas modifier)
${batimentsStr || '(aucun bâtiment)'}

PLANNING ACTUEL DE L'AGENT (imposé — jamais un jour hors de cette liste)
Jours de passage : ${joursPassage.join(', ') || '(aucun)'}
Créneaux : ${creneauxStr || '(aucun)'}

JOURS DE RAMASSAGE CONTAINERS (agglo)
${ramassageStr}

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

  const creneaux: Creneau[] = Array.isArray(contrat.creneaux_acceptes) ? contrat.creneaux_acceptes : []
  const joursPassage = [...new Set(creneaux.flatMap(c => c.jours ?? []))]

  if (joursPassage.length === 0)
    return NextResponse.json({ error: "Ce contrat n'a aucun créneau de passage configuré." }, { status: 400 })

  // ── Structure existante — lecture seule, ne restructure rien (contrairement au mode "Analyser / restructurer") ──
  const { data: zones } = await admin.from('zones_residence')
    .select('nom, batiment')
    .eq('contrat_id', contratId)

  if (!zones?.length)
    return NextResponse.json({ error: 'Aucune zone configurée pour ce contrat.' }, { status: 400 })

  const parBatiment = new Map<string, string[]>()
  for (const z of zones) {
    const nomBatiment = z.batiment?.trim() || '(mono-bâtiment)'
    const arr = parBatiment.get(nomBatiment) ?? []
    if (z.nom?.trim()) arr.push(z.nom.trim())
    parBatiment.set(nomBatiment, arr)
  }
  const batiments = [...parBatiment.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }))
    .map(([nom, zonesNoms]) => ({ nom, zones: zonesNoms }))

  const systemPrompt = buildSystemPrompt()
  const userMessage   = buildUserMessage({ batiments, joursPassage, creneaux, joursRamassageContainers })

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

  return NextResponse.json({ dispatch_semaine: dispatch, alertes, joursRamassageContainers })
}
