import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { volumeHebdoMinutes } from '@/lib/prorata'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic()
// P2-8 : modèle configurable via variable d'env, sans redéploiement code.
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

const JOURS_VALIDES = new Set(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])

// ── Types de sortie (mêmes clés que AnalyseContratWizard.tsx — lot 1, étape 3) ──

interface AnalyseTache {
  libelle: string
  frequence: 'hebdo' | 'mensuel' | 'trimestriel' | 'semestriel' | 'annuel'
  jours_proposes: string[]
  duree_minutes_estimee: number
}
interface AnalyseZone {
  nom: string
  taches: AnalyseTache[]
}
interface AnalyseBatiment {
  nom: string
  zones: AnalyseZone[]
}
interface CreneauPropose {
  jours: string[]
  heure_debut: string
  heure_fin: string
}
interface RepartitionJour {
  jour: string
  duree_totale_minutes: number
  batiments: string[]
  resume: string
}
interface HorsPlanning {
  libelle: string
  frequence: string
  note: string
}
interface AnalyseIA {
  batiments: AnalyseBatiment[]
  creneaux_proposes: CreneauPropose[]
  jours_interdits_detectes: string[]
  repartition_hebdo: RepartitionJour[]
  totaux: { minutes_hebdo_estimees: number; minutes_hebdo_vendues: number; verdict: 'ok' | 'depassement' | 'marge_confortable' }
  hors_planning_hebdo: HorsPlanning[]
  alertes: string[]
}

interface IdentiteInput {
  libelle: string
  type_contrat: string
  date_debut: string
  date_fin: string
  montant_mensuel: number | null
  taux_mode: 'base' | 'specifique'
  taux_specifique: number | null
  taux_base: number
}

// Organisation actuelle (lot 2, principe 1) — jours/horaires RÉELS de l'agent,
// saisis à l'étape 1. L'IA structure le contenu mais ne décide jamais des
// jours/horaires : elle les reçoit en entrée et doit les respecter.
interface PlanningActuelInput {
  jours: string[]
  creneaux: { jours: string[]; heure_debut: string; heure_fin: string }[]
  minutesHebdo: number
}

// ── Auth manager + ownership résidence (même esprit que resolveAndCheck des routes contrats) ──

async function resolveAndCheck(residenceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }

  const admin = await createAdminClient()
  const { data: residence } = await admin.from('residences')
    .select('id')
    .eq('id', residenceId)
    .eq('manager_id', user.id)
    .single()
  if (!residence) return { error: NextResponse.json({ error: 'Résidence introuvable ou non autorisée' }, { status: 403 }) }

  return { admin, user, residenceId }
}

// ── Prompt système ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `Tu es un expert en structuration de contrats de nettoyage pour Archipropre Services (société de nettoyage professionnel, Montpellier). Ta mission : lire un texte de contrat ou une description de prestation, et produire une proposition structurée bâtiments → zones → tâches hebdomadaires qui tienne dans l'enveloppe de temps vendue.

RÈGLES DE SORTIE — ABSOLUES :
1. Réponds UNIQUEMENT avec un objet JSON valide. Aucun texte avant ou après, aucun bloc markdown \`\`\`json, aucun préambule, aucun commentaire, aucune explication hors JSON.
2. Respecte EXACTEMENT cette structure (les clés sont obligatoires, adapte le contenu à la situation réelle) :
{
  "batiments": [
    { "nom": "Bât A", "zones": [
      { "nom": "Hall", "taches": [
        { "libelle": "Aspiration et lavage sols", "frequence": "hebdo", "jours_proposes": ["lundi","jeudi"], "duree_minutes_estimee": 15 }
      ] }
    ] }
  ],
  "creneaux_proposes": [ { "jours": ["lundi","jeudi"], "heure_debut": "08:00", "heure_fin": "12:00" } ],
  "jours_interdits_detectes": [],
  "repartition_hebdo": [ { "jour": "jeudi", "duree_totale_minutes": 33, "batiments": ["Bât A"], "resume": "Hall + containers" } ],
  "totaux": { "minutes_hebdo_estimees": 33, "minutes_hebdo_vendues": 33, "verdict": "ok" },
  "hors_planning_hebdo": [ { "libelle": "Lessivage complet cage escalier", "frequence": "trimestriel", "note": "à planifier en ponctuel" } ],
  "alertes": [ "Le contrat mentionne une sortie containers le dimanche soir — hors créneaux proposés" ]
}

RÈGLES MÉTIER :
- Protocole des « 5 doigts » : dans chaque zone, ordonne les tâches du haut vers le bas et du propre vers le sale. Référence usuelle pour une zone de parties communes (à adapter, ne recopie que ce qui est pertinent au texte) : toiles d'araignées, dépoussiérage, vitres/traces, poubelle/prospectus, sol.
- L'arbre "batiments → zones → taches" ne contient QUE des tâches HEBDOMADAIRES : frequence="hebdo" ET au moins un jour dans jours_proposes. Toute tâche dont la fréquence réelle n'est pas hebdomadaire (mensuelle, trimestrielle, semestrielle, annuelle, ou sur passage externe) NE DOIT JAMAIS apparaître dans cet arbre ni être convertie en hebdomadaire pour "rentrer dans les clous" : elle va UNIQUEMENT dans hors_planning_hebdo, avec sa fréquence réelle et une note expliquant comment la traiter (ex. "à planifier en ponctuel").
- N'invente JAMAIS de bâtiment, de zone ou de tâche non mentionné(e) ou non raisonnablement déductible du texte. Si le texte est pauvre ou vague sur un point, produis une structure minimale plausible et explique ce choix dans alertes.
- JOURS IMPOSÉS (règle absolue, principe 1) : tu reçois ci-dessous le PLANNING ACTUEL réel de l'agent (jours et créneaux horaires déjà décidés par le manager, pas par toi). Tu NE DÉCIDES JAMAIS des jours ou horaires : pour CHAQUE tâche hebdomadaire, jours_proposes DOIT être un sous-ensemble strict des jours du planning actuel — jamais un jour hors de cette liste. Si une prestation mentionnée dans le texte ne peut raisonnablement être casée dans les créneaux actuels (volume trop important, jour incompatible explicitement mentionné dans le texte comme le dimanche pour des containers, etc.), NE l'ajoute PAS dans l'arbre hebdo : place-la dans hors_planning_hebdo ET ajoute une alerte explicite le signalant.
- creneaux_proposes : recopie simplement les créneaux du planning actuel fourni (champ informatif, non décisionnel — les horaires viennent de l'utilisateur, pas de toi).
- jours_interdits_detectes liste les jours que le texte exclut explicitement (ex. "jamais le mercredi").
- repartition_hebdo : un objet par jour de la semaine réellement actif, avec la somme des durées des tâches hebdo ce jour-là, les bâtiments concernés, et un court résumé.
- totaux.minutes_hebdo_estimees et totaux.verdict seront recalculés et corrigés côté serveur à partir de ton propre arbre — indique tout de même ta meilleure estimation, cohérente avec la somme des tâches.
- Toute contrainte exprimée dans le texte du contrat ou dans les contraintes particulières qui n'est PAS satisfaite par ta proposition doit donner lieu à une entrée claire dans alertes (cite la contrainte et explique pourquoi).
- Si l'enveloppe de temps vendue transmise est nulle (contrat offert), signale-le explicitement dans alertes et précise la charge de travail réelle que représente ta proposition, en minutes/semaine, pour matérialiser la perte cachée.
- Si la charge que tu proposes dépasse l'enveloppe vendue, chiffre le dépassement dans alertes (ex. "Dépassement estimé de 24 min/semaine par rapport à l'enveloppe vendue de 196 min/semaine").
- Les jours sont toujours en minuscules, parmi : lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche.
- Les durées (duree_minutes_estimee) sont des minutes entières positives, réalistes pour un passage professionnel de nettoyage (typiquement 5 à 60 min par tâche selon sa nature).`
}

function buildUserMessage(params: {
  identite: IdentiteInput
  tauxEffectif: number
  volumeHebdoMin: number
  planningActuel: PlanningActuelInput
  texteContrat: string
  contraintesLibres?: string
}): string {
  const { identite, tauxEffectif, volumeHebdoMin, planningActuel, texteContrat, contraintesLibres } = params
  const envelopeStr = volumeHebdoMin > 0
    ? `${Math.round(volumeHebdoMin)} min/semaine (≈ ${(volumeHebdoMin / 60).toFixed(1)} h/semaine, ≈ ${Math.round(volumeHebdoMin * 4.33 / 60)} h/mois)`
    : 'AUCUNE (contrat offert — montant nul ou taux nul). Calcule la charge proposée et signale la perte cachée dans alertes.'

  const creneauxStr = planningActuel.creneaux
    .map(c => `${c.jours.join(', ')} de ${c.heure_debut} à ${c.heure_fin}`)
    .join(' ; ')

  return `IDENTITÉ DU CONTRAT
Libellé : ${identite.libelle || '(non précisé)'}
Type : ${identite.type_contrat}
Période : du ${identite.date_debut} au ${identite.date_fin}
Montant mensuel : ${identite.montant_mensuel != null ? `${identite.montant_mensuel} € HT` : 'non précisé'}
Taux horaire effectif : ${tauxEffectif} €/h

ENVELOPPE DE TEMPS VENDUE
${envelopeStr}

PLANNING ACTUEL DE L'AGENT (imposé — jamais un jour hors de cette liste)
Jours de passage : ${planningActuel.jours.join(', ') || '(aucun)'}
Créneaux : ${creneauxStr || '(aucun)'}
Temps hebdomadaire réel de cette organisation : ${Math.round(planningActuel.minutesHebdo)} min/semaine

TEXTE DU CONTRAT / DESCRIPTION DE LA PRESTATION
"""
${texteContrat.trim()}
"""

CONTRAINTES PARTICULIÈRES
${contraintesLibres?.trim() || 'Aucune contrainte particulière mentionnée.'}`
}

// ── Recalcul déterministe des totaux (ne pas faire confiance à l'arithmétique du modèle) ──

function sommeMinutesHebdo(batiments: AnalyseBatiment[]): number {
  let total = 0
  for (const b of batiments) {
    for (const z of b.zones) {
      for (const t of z.taches) {
        total += t.duree_minutes_estimee * t.jours_proposes.length
      }
    }
  }
  return total
}

function calcVerdict(estimees: number, vendues: number): AnalyseIA['totaux']['verdict'] {
  if (vendues <= 0) return estimees > 0 ? 'depassement' : 'ok'
  if (estimees > vendues) return 'depassement'
  if (estimees <= vendues * 0.8) return 'marge_confortable'
  return 'ok'
}

// Nettoie et sécurise le JSON retourné par le modèle : coerce les types, applique
// la règle "l'arbre ne contient que du hebdo" même si le modèle ne l'a pas
// respectée (bascule alors la tâche vers hors_planning_hebdo), et ignore
// silencieusement les entrées mal formées plutôt que de planter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitiserAnalyse(raw: any): AnalyseIA {
  const horsPlanning: HorsPlanning[] = Array.isArray(raw?.hors_planning_hebdo)
    ? raw.hors_planning_hebdo
        .filter((h: unknown) => h && typeof h === 'object')
        .map((h: Record<string, unknown>) => ({
          libelle:   typeof h.libelle === 'string' ? h.libelle : '(sans libellé)',
          frequence: typeof h.frequence === 'string' ? h.frequence : 'non précisée',
          note:      typeof h.note === 'string' ? h.note : '',
        }))
    : []

  const batiments: AnalyseBatiment[] = (Array.isArray(raw?.batiments) ? raw.batiments : [])
    .filter((b: unknown) => b && typeof b === 'object')
    .map((b: Record<string, unknown>) => {
      const nomBatiment = typeof b.nom === 'string' && b.nom.trim() ? b.nom.trim() : 'Bâtiment'
      const zones: AnalyseZone[] = (Array.isArray(b.zones) ? b.zones : [])
        .filter((z: unknown) => z && typeof z === 'object')
        .map((z: Record<string, unknown>) => {
          const nomZone = typeof z.nom === 'string' && z.nom.trim() ? z.nom.trim() : 'Zone'
          const taches: AnalyseTache[] = []
          for (const t of (Array.isArray(z.taches) ? z.taches : []) as Record<string, unknown>[]) {
            if (!t || typeof t !== 'object') continue
            const libelle = typeof t.libelle === 'string' ? t.libelle.trim() : ''
            if (!libelle) continue
            const frequence = typeof t.frequence === 'string' ? t.frequence : 'hebdo'
            const jours = Array.isArray(t.jours_proposes)
              ? (t.jours_proposes as unknown[]).filter((j): j is string => typeof j === 'string' && JOURS_VALIDES.has(j))
              : []
            const duree = Math.max(0, Math.round(Number(t.duree_minutes_estimee) || 0))

            // Règle stricte (jamais dérogeable) : l'arbre ne garde que le hebdo
            // avec au moins un jour. Tout le reste bascule en hors_planning_hebdo,
            // même si le modèle ne l'a pas appliqué correctement.
            if (frequence === 'hebdo' && jours.length > 0) {
              taches.push({ libelle, frequence: 'hebdo', jours_proposes: jours, duree_minutes_estimee: duree })
            } else {
              horsPlanning.push({
                libelle,
                frequence: frequence || 'non précisée',
                note: `Zone "${nomZone}"${nomBatiment !== 'Bâtiment' ? ` (${nomBatiment})` : ''} — non hebdomadaire, à planifier hors cycle.`,
              })
            }
          }
          return { nom: nomZone, taches }
        })
      return { nom: nomBatiment, zones }
    })

  const creneaux: CreneauPropose[] = (Array.isArray(raw?.creneaux_proposes) ? raw.creneaux_proposes : [])
    .filter((c: unknown) => c && typeof c === 'object')
    .map((c: Record<string, unknown>) => ({
      jours: Array.isArray(c.jours) ? (c.jours as unknown[]).filter((j): j is string => typeof j === 'string' && JOURS_VALIDES.has(j)) : [],
      heure_debut: typeof c.heure_debut === 'string' ? c.heure_debut : '08:00',
      heure_fin:   typeof c.heure_fin === 'string' ? c.heure_fin : '18:00',
    }))

  const joursInterdits = Array.isArray(raw?.jours_interdits_detectes)
    ? (raw.jours_interdits_detectes as unknown[]).filter((j): j is string => typeof j === 'string' && JOURS_VALIDES.has(j))
    : []

  const repartition: RepartitionJour[] = (Array.isArray(raw?.repartition_hebdo) ? raw.repartition_hebdo : [])
    .filter((r: unknown) => r && typeof r === 'object')
    .map((r: Record<string, unknown>) => ({
      jour: typeof r.jour === 'string' ? r.jour : '',
      duree_totale_minutes: Math.max(0, Math.round(Number(r.duree_totale_minutes) || 0)),
      batiments: Array.isArray(r.batiments) ? (r.batiments as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      resume: typeof r.resume === 'string' ? r.resume : '',
    }))

  const alertes = Array.isArray(raw?.alertes)
    ? (raw.alertes as unknown[]).filter((a): a is string => typeof a === 'string')
    : []

  return {
    batiments,
    creneaux_proposes: creneaux,
    jours_interdits_detectes: joursInterdits,
    repartition_hebdo: repartition,
    totaux: { minutes_hebdo_estimees: 0, minutes_hebdo_vendues: 0, verdict: 'ok' }, // recalculé juste après (sommeMinutesHebdo)
    hors_planning_hebdo: horsPlanning,
    alertes,
  }
}

// ── Route ────────────────────────────────────────────────────────────────────
// Ne touche AUCUNE table : analyse en lecture/proposition seule (lot 1).
// L'écriture en base (création réelle du contrat/zones/tâches) est le lot 2.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })

  const { residenceId, identite, planningActuel, texteContrat, contraintesLibres } = body as {
    residenceId?: string
    identite?: IdentiteInput
    planningActuel?: PlanningActuelInput
    texteContrat?: string
    contraintesLibres?: string
  }

  if (!residenceId) return NextResponse.json({ error: 'residenceId manquant.' }, { status: 400 })

  const ctx = await resolveAndCheck(residenceId)
  if ('error' in ctx) return ctx.error

  if (!identite || !identite.libelle || !identite.date_debut || !identite.date_fin)
    return NextResponse.json({ error: 'Identité du contrat incomplète (libellé et dates obligatoires).' }, { status: 400 })

  if (!planningActuel || !Array.isArray(planningActuel.jours) || planningActuel.jours.length === 0)
    return NextResponse.json({ error: "L'organisation actuelle (jours et créneaux de passage) est obligatoire." }, { status: 400 })

  if (!texteContrat || !texteContrat.trim())
    return NextResponse.json({ error: 'Le texte du contrat est obligatoire.' }, { status: 400 })

  const tauxEffectif = identite.taux_mode === 'specifique' && identite.taux_specifique
    ? identite.taux_specifique
    : identite.taux_base

  const volumeHebdoMin = volumeHebdoMinutes(identite.montant_mensuel ?? null, tauxEffectif)

  const systemPrompt = buildSystemPrompt()
  const userMessage   = buildUserMessage({ identite, tauxEffectif, volumeHebdoMin, planningActuel, texteContrat, contraintesLibres })

  let rawText: string
  try {
    const response = await anthropic.messages.create({
      model:       MODEL,
      max_tokens:  8192,
      temperature: 0.3,
      system:      systemPrompt,
      messages:    [{ role: 'user', content: userMessage }],
    })
    rawText = response.content.filter(b => b.type === 'text').map(b => b.type === 'text' ? b.text : '').join('')
  } catch (e) {
    console.error('[analyse-contrat] Appel Anthropic échoué:', e)
    return NextResponse.json({ error: "L'analyse IA est temporairement indisponible. Réessayez dans un instant." }, { status: 503 })
  }

  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsedRaw: any
  try {
    parsedRaw = JSON.parse(cleaned)
  } catch {
    // Repli : le modèle a peut-être ajouté du texte autour du JSON malgré la consigne.
    const start = cleaned.indexOf('{')
    const end   = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      return NextResponse.json({ error: 'Analyse illisible, réessayez ou reformulez.' }, { status: 422 })
    }
    try {
      parsedRaw = JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      return NextResponse.json({ error: 'Analyse illisible, réessayez ou reformulez.' }, { status: 422 })
    }
  }

  if (!parsedRaw || typeof parsedRaw !== 'object')
    return NextResponse.json({ error: 'Analyse illisible, réessayez ou reformulez.' }, { status: 422 })

  const analyse = sanitiserAnalyse(parsedRaw)
  const minutesEstimees = sommeMinutesHebdo(analyse.batiments)
  analyse.totaux = {
    minutes_hebdo_estimees: Math.round(minutesEstimees),
    minutes_hebdo_vendues:  Math.round(volumeHebdoMin),
    verdict:                calcVerdict(minutesEstimees, volumeHebdoMin),
  }

  return NextResponse.json({ analyse, volumeHebdoMin: Math.round(volumeHebdoMin), tauxEffectif })
}
