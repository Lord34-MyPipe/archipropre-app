import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { sanitiserBatiments, type AnalyseBatiment } from '@/lib/analyseContratShared'

// ── Ajustement ciblé d'une structure existante (chantier "alertes actionnables",
// sous-étape 4/5, 21/07) ──────────────────────────────────────────────────────
// Endpoint DÉDIÉ et volontairement étroit, distinct de /api/ia/analyse-contrat
// (qui repart de zéro depuis un texte de contrat brut, avec un system prompt
// volumineux — règles R1-R5, protocole 5 doigts, tout le vocabulaire top-down).
// Ici, l'IA ne reçoit QUE l'arbre bâtiments→zones→taches déjà édité par le
// manager + la question posée + sa réponse libre : elle ajuste, ne réanalyse
// rien d'autre. Prompt court = plus rapide, moins cher, plus prévisible qu'une
// réanalyse complète à chaque réponse.

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic()
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

interface PlanningActuelInput {
  jours: string[]
  creneaux: { jours: string[]; heure_debut: string; heure_fin: string }[]
}
interface AlerteContexte {
  sujet: string
  message: string
}

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

function buildSystemPrompt(): string {
  return `Tu ajustes une structure de contrat de nettoyage bâtiments→zones→tâches DÉJÀ ÉTABLIE, suite à la réponse d'un manager sur UNE question précise qui lui a été posée. Tu ne réanalyses RIEN d'autre que ce que cette réponse implique.

RÈGLES ABSOLUES :
1. Réponds UNIQUEMENT avec un objet JSON valide de la forme { "batiments": [...] } — aucun texte avant/après, aucun bloc markdown, aucun commentaire. Même format exact que la structure fournie en entrée : chaque tâche a "libelle", "frequence_type" ("hebdo"/"mensuel"/"trimestriel"/"semestriel"/"annuel"), "jours_semaine" (tableau, 1+ jours si hebdo, exactement 1 jour sinon), "semaine_du_mois" (mensuel uniquement, tableau à 1 élément 1-5, sinon null), "mois_de_annee" (trimestriel/semestriel/annuel uniquement, tableau de mois 1-12, sinon null).
2. Modifie UNIQUEMENT ce que la réponse du manager implique pour LA QUESTION POSÉE ci-dessous — recopie TOUT LE RESTE de la structure fournie EXACTEMENT À L'IDENTIQUE (mêmes bâtiments, zones, tâches, positions), même si tu penses qu'autre chose pourrait être amélioré : ce n'est pas ta mission ici, ne touche à rien d'autre.
3. JOURS IMPOSÉS : toute tâche reste positionnée uniquement sur un jour parmi le planning actuel fourni (jours de passage réels de l'agent) — jamais un jour hors de cette liste, même si la réponse du manager semble le suggérer. Si la réponse implique un jour hors planning, applique le changement praticable le plus proche dans les jours existants et n'invente jamais un jour supplémentaire.
4. TU N'ESTIMES JAMAIS DE DURÉE — ce concept n'existe pas dans cette structure (temps de présence de chaque jour fixé ailleurs, hors de ta portée ici).
5. Si la réponse du manager est trop vague ou hors sujet pour en tirer une action concrète, NE MODIFIE RIEN : renvoie la structure fournie strictement telle quelle.
6. N'invente JAMAIS de bâtiment, de zone ou de tâche non présent dans la structure fournie ou non raisonnablement déductible de la réponse du manager pour LA question posée.`
}

function buildUserMessage(params: {
  alerte: AlerteContexte
  reponseLibre: string
  planningActuel: PlanningActuelInput
  batiments: AnalyseBatiment[]
}): string {
  const { alerte, reponseLibre, planningActuel, batiments } = params
  const creneauxStr = planningActuel.creneaux.map(c => `${c.jours.join(', ')} de ${c.heure_debut} à ${c.heure_fin}`).join(' ; ')

  return `QUESTION POSÉE AU MANAGER
Sujet : ${alerte.sujet}
${alerte.message}

RÉPONSE DU MANAGER
"""
${reponseLibre.trim()}
"""

PLANNING ACTUEL DE L'AGENT (jours imposés — jamais un jour hors de cette liste)
Jours de passage : ${planningActuel.jours.join(', ') || '(aucun)'}
Créneaux : ${creneauxStr || '(aucun)'}

STRUCTURE ACTUELLE (bâtiments→zones→tâches) — à ajuster selon la réponse ci-dessus UNIQUEMENT, recopier le reste à l'identique
${JSON.stringify({ batiments })}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })

  const { residenceId, structureActuelle, planningActuel, alerte, reponseLibre } = body as {
    residenceId?: string
    structureActuelle?: unknown
    planningActuel?: PlanningActuelInput
    alerte?: AlerteContexte
    reponseLibre?: string
  }

  if (!residenceId) return NextResponse.json({ error: 'residenceId manquant.' }, { status: 400 })

  const ctx = await resolveAndCheck(residenceId)
  if ('error' in ctx) return ctx.error

  if (!planningActuel || !Array.isArray(planningActuel.jours) || planningActuel.jours.length === 0)
    return NextResponse.json({ error: "L'organisation actuelle (jours et créneaux de passage) est obligatoire." }, { status: 400 })

  if (!alerte || !alerte.message)
    return NextResponse.json({ error: "L'alerte concernée est obligatoire." }, { status: 400 })

  if (!reponseLibre || !reponseLibre.trim())
    return NextResponse.json({ error: 'La réponse est obligatoire.' }, { status: 400 })

  // La structure actuelle vient du client (arbre déjà édité, décisions rapides
  // déjà appliquées) — sanitisée en entrée exactement comme en sortie, jamais
  // de confiance aveugle même sur nos propres données déjà persistées côté
  // client uniquement (état React, pas la base).
  const batimentsEntree = sanitiserBatiments(structureActuelle && typeof structureActuelle === 'object'
    ? (structureActuelle as { batiments?: unknown }).batiments
    : [])

  const systemPrompt = buildSystemPrompt()
  const userMessage   = buildUserMessage({ alerte, reponseLibre, planningActuel, batiments: batimentsEntree })

  let rawText: string
  try {
    const response = await anthropic.messages.create({
      model:       MODEL,
      max_tokens:  8000,
      temperature: 0.2,
      system:      systemPrompt,
      messages:    [{ role: 'user', content: userMessage }],
    })
    if (response.stop_reason === 'max_tokens') {
      return NextResponse.json({ error: 'La structure est trop volumineuse pour être ajustée en une fois.' }, { status: 422 })
    }
    rawText = response.content.filter(b => b.type === 'text').map(b => b.type === 'text' ? b.text : '').join('')
  } catch (e) {
    console.error('[analyse-contrat/ajuster] Appel Anthropic échoué:', e)
    return NextResponse.json({ error: "L'ajustement IA est temporairement indisponible. Réessayez dans un instant." }, { status: 503 })
  }

  const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsedRaw: any
  try {
    parsedRaw = JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end   = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      return NextResponse.json({ error: 'Ajustement illisible, réessayez ou reformulez votre réponse.' }, { status: 422 })
    }
    try {
      parsedRaw = JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      return NextResponse.json({ error: 'Ajustement illisible, réessayez ou reformulez votre réponse.' }, { status: 422 })
    }
  }

  if (!parsedRaw || typeof parsedRaw !== 'object')
    return NextResponse.json({ error: 'Ajustement illisible, réessayez ou reformulez votre réponse.' }, { status: 422 })

  const batiments = sanitiserBatiments(parsedRaw.batiments)

  return NextResponse.json({ batiments })
}
