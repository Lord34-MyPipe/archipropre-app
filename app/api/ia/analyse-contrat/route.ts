import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { volumeHebdoMinutes } from '@/lib/prorata'
import { type DispatchJour, reglesDispatchPrompt, sanitiserDispatch } from '@/lib/dispatchSemaine'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic()
// P2-8 : modèle configurable via variable d'env, sans redéploiement code.
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

const JOURS_VALIDES = new Set(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])

// ── Types de sortie (mêmes clés que AnalyseContratWizard.tsx — lot 1, étape 3) ──
// Refonte top-down (21/07) : plus de duree_minutes_estimee, plus de totaux/
// verdict — l'IA ne compare plus jamais un temps proposé à une enveloppe.
// Les tâches basse fréquence (mensuel/trimestriel/semestriel/annuel) restent
// dans l'arbre bâtiments→zones→taches, positionnées (semaine_du_mois /
// mois_de_annee), alignées sur les colonnes déjà existantes de
// taches_template — hors_planning_hebdo devient un filet défensif résiduel
// (entrées vraiment non positionnables), plus une destination normale.

interface AnalyseTache {
  libelle: string
  frequence_type: 'hebdo' | 'mensuel' | 'trimestriel' | 'semestriel' | 'annuel'
  jours_semaine: string[]           // hebdo : 1+ jours. Basse fréquence : exactement 1 jour (le jour du passage positionné).
  semaine_du_mois: number[] | null  // mensuel uniquement : [1..5] (5 = dernière semaine du mois)
  mois_de_annee: number[] | null    // trimestriel/semestriel/annuel uniquement : mois 1-12 concernés
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
interface HorsPlanning {
  libelle: string
  frequence: string
  note: string
}
interface AnalyseIA {
  batiments: AnalyseBatiment[]
  creneaux_proposes: CreneauPropose[]
  jours_interdits_detectes: string[]
  hors_planning_hebdo: HorsPlanning[]
  alertes: string[]
  dispatch_semaine: DispatchJour[]
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
  return `Tu es un expert en structuration de contrats de nettoyage pour Archipropre Services (société de nettoyage professionnel, Montpellier). Ta mission : lire un texte de contrat ou une description de prestation, et identifier QUELLES tâches existent et à QUELLE FRÉQUENCE, réparties dans les jours de passage déjà fixés — TU N'ESTIMES JAMAIS DE DURÉE. Le temps disponible chaque jour est une contrainte physique fixe (le créneau réel de l'agent), pas un budget que tu dois respecter en dosant des minutes : ton rôle s'arrête à identifier et positionner, jamais à chiffrer.

RÈGLES DE SORTIE — ABSOLUES :
1. Réponds UNIQUEMENT avec un objet JSON valide. Aucun texte avant ou après, aucun bloc markdown \`\`\`json, aucun préambule, aucun commentaire, aucune explication hors JSON.
2. Respecte EXACTEMENT cette structure (les clés sont obligatoires, adapte le contenu à la situation réelle) :
{
  "batiments": [
    { "nom": "Bât A", "zones": [
      { "nom": "Hall", "taches": [
        { "libelle": "Aspiration et lavage sols", "frequence_type": "hebdo", "jours_semaine": ["lundi","jeudi"], "semaine_du_mois": null, "mois_de_annee": null },
        { "libelle": "Vitres hall d'entrée", "frequence_type": "mensuel", "jours_semaine": ["mardi"], "semaine_du_mois": [2], "mois_de_annee": null },
        { "libelle": "Lessivage complet cage escalier", "frequence_type": "trimestriel", "jours_semaine": ["vendredi"], "semaine_du_mois": null, "mois_de_annee": [1,4,7,10] }
      ] }
    ] }
  ],
  "creneaux_proposes": [ { "jours": ["lundi","jeudi"], "heure_debut": "08:00", "heure_fin": "12:00" } ],
  "jours_interdits_detectes": [],
  "hors_planning_hebdo": [],
  "alertes": [ "Le contrat mentionne une sortie containers le dimanche soir — hors créneaux proposés" ],
  "dispatch_semaine": [ { "jour": "lundi", "batiments_complets": ["Bât A"], "tournees_transverses": [], "containers": null, "duree_totale_estimee_minutes": 33 } ]
}

${reglesDispatchPrompt()}

RÈGLES MÉTIER — RÉPARTITION TOP-DOWN (le temps de présence de chaque jour est une donnée d'entrée fixe, jamais une estimation de ta part) :
- Protocole des « 5 doigts » : dans chaque zone, ordonne les tâches du haut vers le bas et du propre vers le sale. Référence usuelle pour une zone de parties communes (à adapter, ne recopie que ce qui est pertinent au texte) : toiles d'araignées, dépoussiérage, vitres/traces, poubelle/prospectus, sol.
- JOURS IMPOSÉS (règle absolue, principe 1) : tu reçois ci-dessous le PLANNING ACTUEL réel de l'agent (jours et créneaux horaires déjà décidés par le manager, pas par toi), avec la durée de présence de chaque jour. Tu NE DÉCIDES JAMAIS des jours ou horaires : pour CHAQUE tâche, quelle que soit sa fréquence, jours_semaine DOIT être un sous-ensemble strict des jours du planning actuel — jamais un jour hors de cette liste.
- TÂCHES HEBDOMADAIRES (frequence_type="hebdo") : jours_semaine peut contenir PLUSIEURS jours — la tâche revient chaque semaine, ces jours-là.
- TÂCHES BASSE FRÉQUENCE (frequence_type="mensuel"/"trimestriel"/"semestriel"/"annuel") : restent DANS l'arbre bâtiments→zones→taches, avec un POSITIONNEMENT CONCRET et modifiable ensuite par le manager — ne les mets JAMAIS dans hors_planning_hebdo par défaut :
  - jours_semaine : EXACTEMENT UN jour parmi les jours de passage (le jour où ce passage basse fréquence a lieu).
  - "mensuel" : semaine_du_mois DOIT être renseigné, un tableau à UN SEUL élément parmi [1,2,3,4,5] (1 = 1ère semaine du mois, ..., 5 = dernière semaine). Choisis la semaine la plus plausible d'après le texte, sinon 1.
  - "trimestriel"/"semestriel"/"annuel" : mois_de_annee DOIT être renseigné (tableau des mois 1-12 concernés — ex. trimestriel typique [1,4,7,10]). Choisis les mois les plus plausibles d'après le texte, sinon un cycle régulier démarrant en janvier.
  - Une tâche basse fréquence positionnée sur un jour donné fait mécaniquement partie de la charge de ce jour précis (occurrence différente d'un jour ordinaire) — tu n'as RIEN à chiffrer sur ce point, c'est un effet de la répartition, jamais une durée à produire.
- hors_planning_hebdo reste RÉSERVÉ aux cas rares où tu ne peux vraiment déterminer ni fréquence ni jour plausible depuis le texte — décris alors la tâche et pourquoi, avec une alerte associée. Ne l'utilise jamais comme solution de facilité pour une tâche basse fréquence normale : celles-ci doivent être positionnées dans l'arbre.
- N'invente JAMAIS de bâtiment, de zone ou de tâche non mentionné(e) ou non raisonnablement déductible du texte. Si le texte est pauvre ou vague sur un point, produis une structure minimale plausible et explique ce choix dans alertes.
- creneaux_proposes : recopie simplement les créneaux du planning actuel fourni (champ informatif, non décisionnel — les horaires viennent de l'utilisateur, pas de toi).
- jours_interdits_detectes liste les jours que le texte exclut explicitement (ex. "jamais le mercredi").
- dispatch_semaine[].duree_totale_estimee_minutes (règles ci-dessus) reste une estimation informative de la durée totale du jour (bâtiments complets + tournées + containers) — INDÉPENDANTE des tâches détaillées ci-dessus (qui n'ont plus de durée). Minutes entières positives réalistes, jamais 0 sauf jour sans aucune activité.
- Toute contrainte exprimée dans le texte du contrat ou dans les contraintes particulières qui n'est PAS satisfaite par ta proposition doit donner lieu à une entrée claire dans alertes (cite la contrainte et explique pourquoi).
- Les jours sont toujours en minuscules, parmi : lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche.`
}

function dureeCreneauMinutes(c: { heure_debut: string; heure_fin: string }): number {
  const [h1, m1] = c.heure_debut.split(':').map(Number)
  const [h2, m2] = c.heure_fin.split(':').map(Number)
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
}

function buildUserMessage(params: {
  identite: IdentiteInput
  planningActuel: PlanningActuelInput
  joursRamassageContainers?: string[]
  texteContrat: string
  contraintesLibres?: string
}): string {
  const { identite, planningActuel, joursRamassageContainers, texteContrat, contraintesLibres } = params

  // Répartition top-down (21/07) : plus d'enveloppe hebdo transmise — le temps
  // de présence de CHAQUE jour (créneau réel) est la seule donnée fixe utile,
  // l'IA n'a plus à comparer un total à un budget global.
  const creneauxStr = planningActuel.creneaux
    .map(c => `${c.jours.join(', ')} de ${c.heure_debut} à ${c.heure_fin} (${dureeCreneauMinutes(c)} min de présence)`)
    .join(' ; ')

  const contratOffertStr = identite.montant_mensuel == null || identite.montant_mensuel === 0
    ? "\nCONTRAT OFFERT — montant nul. Ne calcule rien à ce sujet : structure la prestation normalement, l'application connaît déjà le temps de présence réel pour matérialiser la perte cachée."
    : ''

  const ramassageStr = joursRamassageContainers && joursRamassageContainers.length > 0
    ? joursRamassageContainers.join(', ')
    : 'non concerné — ne produis aucune entrée containers dans dispatch_semaine'

  return `IDENTITÉ DU CONTRAT
Libellé : ${identite.libelle || '(non précisé)'}
Type : ${identite.type_contrat}
Période : du ${identite.date_debut} au ${identite.date_fin}

PLANNING ACTUEL DE L'AGENT (imposé — jamais un jour hors de cette liste). Le temps de présence de chaque jour est une contrainte FIXE : tu ne dois JAMAIS estimer si le travail "rentre" dedans, seulement identifier et positionner les tâches.
Jours de passage : ${planningActuel.jours.join(', ') || '(aucun)'}
Créneaux : ${creneauxStr || '(aucun)'}${contratOffertStr}

JOURS DE RAMASSAGE CONTAINERS (agglo)
${ramassageStr}

TEXTE DU CONTRAT / DESCRIPTION DE LA PRESTATION
"""
${texteContrat.trim()}
"""

CONTRAINTES PARTICULIÈRES
${contraintesLibres?.trim() || 'Aucune contrainte particulière mentionnée.'}`
}

const FREQUENCES_VALIDES = new Set(['hebdo', 'mensuel', 'trimestriel', 'semestriel', 'annuel'])
const SEMAINES_MOIS_DEFAUT = [1]           // mensuel sans semaine_du_mois exploitable → 1ère semaine
const MOIS_ANNEE_DEFAUT: Record<string, number[]> = {
  trimestriel: [1, 4, 7, 10],
  semestriel:  [1, 7],
  annuel:      [1],
}

// Nettoie et sécurise le JSON retourné par le modèle : coerce les types, POSITIONNE
// les tâches basse fréquence (défaut transparent si le modèle a omis
// semaine_du_mois/mois_de_annee — jamais un blocage, toujours modifiable ensuite
// par le manager), et ignore silencieusement les entrées mal formées plutôt que
// de planter. hors_planning_hebdo n'est plus qu'un filet défensif résiduel
// (entrées vraiment non positionnables : fréquence ou jour illisibles).
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
            const frequenceRaw = typeof t.frequence_type === 'string' ? t.frequence_type : 'hebdo'
            const frequence = FREQUENCES_VALIDES.has(frequenceRaw) ? frequenceRaw as AnalyseTache['frequence_type'] : ''
            const joursRaw = Array.isArray(t.jours_semaine)
              ? (t.jours_semaine as unknown[]).filter((j): j is string => typeof j === 'string' && JOURS_VALIDES.has(j))
              : []

            if (!frequence || joursRaw.length === 0) {
              // Fréquence ou jour illisible : seul cas résiduel qui bascule en
              // hors_planning_hebdo (jamais une tâche basse fréquence normale).
              horsPlanning.push({
                libelle,
                frequence: frequenceRaw || 'non précisée',
                note: `Zone "${nomZone}"${nomBatiment !== 'Bâtiment' ? ` (${nomBatiment})` : ''} — fréquence ou jour non déterminable depuis le texte.`,
              })
              continue
            }

            if (frequence === 'hebdo') {
              taches.push({ libelle, frequence_type: 'hebdo', jours_semaine: joursRaw, semaine_du_mois: null, mois_de_annee: null })
              continue
            }

            // Basse fréquence : positionnée sur UN seul jour, avec un défaut
            // transparent si le modèle a omis semaine_du_mois/mois_de_annee.
            const jourUnique = [joursRaw[0]]
            if (frequence === 'mensuel') {
              const semaines = Array.isArray(t.semaine_du_mois)
                ? (t.semaine_du_mois as unknown[]).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 5)
                : []
              taches.push({
                libelle, frequence_type: 'mensuel', jours_semaine: jourUnique,
                semaine_du_mois: semaines.length > 0 ? [semaines[0]] : SEMAINES_MOIS_DEFAUT,
                mois_de_annee: null,
              })
            } else {
              const mois = Array.isArray(t.mois_de_annee)
                ? (t.mois_de_annee as unknown[]).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12)
                : []
              taches.push({
                libelle, frequence_type: frequence, jours_semaine: jourUnique,
                semaine_du_mois: null,
                mois_de_annee: mois.length > 0 ? mois : MOIS_ANNEE_DEFAUT[frequence],
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

  const alertes = Array.isArray(raw?.alertes)
    ? (raw.alertes as unknown[]).filter((a): a is string => typeof a === 'string')
    : []

  return {
    batiments,
    creneaux_proposes: creneaux,
    jours_interdits_detectes: joursInterdits,
    hors_planning_hebdo: horsPlanning,
    alertes,
    dispatch_semaine: sanitiserDispatch(raw?.dispatch_semaine),
  }
}

// ── Route ────────────────────────────────────────────────────────────────────
// Ne touche AUCUNE table : analyse en lecture/proposition seule (lot 1).
// L'écriture en base (création réelle du contrat/zones/tâches) est le lot 2.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })

  const { residenceId, identite, planningActuel, joursRamassageContainers, texteContrat, contraintesLibres } = body as {
    residenceId?: string
    identite?: IdentiteInput
    planningActuel?: PlanningActuelInput
    joursRamassageContainers?: string[]
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
  const userMessage   = buildUserMessage({ identite, planningActuel, joursRamassageContainers, texteContrat, contraintesLibres })

  let rawText: string
  try {
    const response = await anthropic.messages.create({
      model:       MODEL,
      // Résidences multi-bâtiments (ex. 9 bâtiments × ~6 zones × 5 tâches ≈ 270
      // tâches) génèrent un JSON volumineux — 8192 tokens tronquait la réponse
      // en plein milieu (JSON invalide, 422 systématique). Constaté sur PRIEURE.
      max_tokens:  16000,
      temperature: 0.3,
      system:      systemPrompt,
      messages:    [{ role: 'user', content: userMessage }],
    })
    if (response.stop_reason === 'max_tokens') {
      console.error('[analyse-contrat] Réponse tronquée (max_tokens atteint) — texte trop volumineux pour une seule analyse.')
      return NextResponse.json({
        error: 'Le contrat est trop volumineux pour être analysé en une fois. Essayez de le scinder (ex. par groupe de bâtiments) ou reformulez plus succinctement.',
      }, { status: 422 })
    }
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

  return NextResponse.json({ analyse, volumeHebdoMin: Math.round(volumeHebdoMin), tauxEffectif })
}
