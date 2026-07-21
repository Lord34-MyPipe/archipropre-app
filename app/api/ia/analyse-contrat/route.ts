import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { volumeHebdoMinutes } from '@/lib/prorata'
import { reglesDispatchPrompt } from '@/lib/dispatchSemaine'
import { sanitiserAnalyse } from '@/lib/analyseContratShared'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic()
// P2-8 : modèle configurable via variable d'env, sans redéploiement code.
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'

// Types de sortie + sanitisation : voir lib/analyseContratShared.ts (partagé
// avec /api/ia/analyse-contrat/ajuster depuis le 21/07, sous-étape 4 du
// chantier "alertes actionnables" — un seul endroit de validation, jamais de
// divergence entre les deux routes).

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
  "alertes": [
    {
      "type": "question",
      "sujet": "Fréquence des vitres du hall",
      "message": "Le texte mentionne un nettoyage des vitres du hall « régulier » sans préciser la fréquence exacte. Positionné en mensuel, 2e mardi, à valider ou ajuster.",
      "options": [
        { "libelle": "Garder mensuel, 2e mardi", "effet": "none", "cible": null, "valeur": null },
        { "libelle": "Passer en hebdomadaire", "effet": "move_task_day", "cible": { "batiment": "Bât A", "zone": "Hall", "libelle": "Vitres hall d'entrée" }, "valeur": "mardi" },
        { "libelle": "Retirer cette tâche", "effet": "remove_task", "cible": { "batiment": "Bât A", "zone": "Hall", "libelle": "Vitres hall d'entrée" }, "valeur": null }
      ]
    },
    {
      "type": "info",
      "sujet": "Sortie containers hors créneaux",
      "message": "Le contrat mentionne une sortie containers le dimanche soir, hors créneaux de passage proposés — signalé pour information, aucune action requise ici.",
      "options": []
    }
  ],
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
- Les jours sont toujours en minuscules, parmi : lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche.

RÈGLES ALERTES — CHAQUE ALERTE EST UN OBJET STRUCTURÉ, jamais une simple phrase :
- "type": "question" est OBLIGATOIRE dès que ton "message" contient — même implicitement — une invitation à décider, ajuster, valider ou choisir : "à valider avec le manager", "peut ajuster", "si nécessaire", "si X est souhaité", "à confirmer", "reste à définir", "positionné par défaut"… Dans ce cas, "options" DOIT couvrir concrètement les choix évoqués par le message, TOUJOURS avec une option "garder tel quel" (effet="none") en plus des autres. "type": "info" est RÉSERVÉ aux constats qui n'appellent AUCUNE décision, même implicite (ex. "le binôme double la main d'œuvre, aucune action requise", "positionné conformément au texte, aucun ajustement possible ici"). En cas de doute entre les deux, choisis TOUJOURS "question" — mieux vaut une option inutile qu'une décision cachée. Toute contrainte du texte ou des contraintes particulières NON satisfaite par ta proposition DOIT donner lieu à une alerte "question" ou "info" selon qu'elle appelle ou non un choix.
  Exemples de classification (ancrage) :
  · Tâche mensuelle positionnée par défaut en 1re semaine (fréquence exacte non précisée par le texte) → "question", PAS "info" : { "type": "question", "sujet": "Semaine du mois — vitres hall", "message": "Vitres hall positionnées en 1re semaine du mois par défaut, fréquence exacte non précisée par le texte — à ajuster si une autre semaine convient mieux.", "options": [ { "libelle": "Garder 1re semaine", "effet": "none", "cible": null, "valeur": null }, { "libelle": "2e semaine", "effet": "set_semaine_du_mois", "cible": { "batiment": "Bât A", "zone": "Hall", "libelle": "Vitres hall d'entrée" }, "valeur": 2 }, { "libelle": "3e semaine", "effet": "set_semaine_du_mois", "cible": { "batiment": "Bât A", "zone": "Hall", "libelle": "Vitres hall d'entrée" }, "valeur": 3 } ] }
  · Le texte évoque un passage sur un jour absent du planning actuel → "question", PAS "info" : { "type": "question", "sujet": "Ajout d'un passage lundi", "message": "Le texte évoque un passage supplémentaire le lundi, jour absent du planning actuel (mardi, vendredi) — nécessiterait l'ajout d'un créneau.", "options": [ { "libelle": "Garder mardi/vendredi tel quel", "effet": "none", "cible": null, "valeur": null }, { "libelle": "Ajouter un passage lundi", "effet": "add_creneau_hint", "cible": null, "valeur": null } ] }
- "sujet" : titre court (4-8 mots). "message" : explication complète, comme avant en prose libre — c'est le TEXTE affiché au manager, rédige-le normalement.
- "options" : UNIQUEMENT pour "type":"question", 2 à 4 choix concrets quand un choix réel existe. Chaque option a un "effet" — VOCABULAIRE FERMÉ, AUCUN AUTRE MOT AUTORISÉ :
  - "move_task_day" : repositionne une tâche sur un autre jour. "valeur" = le jour cible (string, un des 7 jours). "cible" obligatoire.
  - "set_semaine_du_mois" : change la semaine du mois d'une tâche mensuelle. "valeur" = un entier 1-5. "cible" obligatoire.
  - "set_mois_de_annee" : change les mois concernés d'une tâche trimestrielle/semestrielle/annuelle. "valeur" = tableau d'entiers 1-12. "cible" obligatoire.
  - "remove_task" : retire la tâche. "cible" obligatoire, "valeur" = null.
  - "add_creneau_hint" : le choix nécessiterait un créneau supplémentaire, hors de ta portée (les créneaux sont fixés à une étape précédente, tu ne les modifies jamais) — "cible" = null, "valeur" = null, le manager sera renvoyé modifier ses créneaux.
  - "none" : garder l'état actuel tel quel, aucun changement. "cible" = null, "valeur" = null.
  Si aucune option fermée ne convient à une question, laisse "options": [] — le manager pourra répondre en texte libre côté application, ne force jamais une option qui ne correspond pas exactement à un des 6 effets ci-dessus.
- "cible" (quand requis) DOIT référencer EXACTEMENT un "nom" de bâtiment + "nom" de zone + "libelle" de tâche que TU VIENS DE PRODUIRE dans "batiments" ci-dessus — jamais un bâtiment/zone/tâche inventé ou absent de ta propre réponse. CHAQUE option d'une alerte donnée ne référence QUE la tâche dont CETTE alerte parle — ne réutilise JAMAIS la "cible" d'une autre alerte, même par erreur d'inattention ; si la tâche concernée par l'alerte n'existe pas dans "batiments" (ex. tu l'as mise en hors_planning_hebdo, ou elle ne peut pas être positionnée du tout), n'invente pas de cible de substitution : laisse cette option de côté ou utilise "add_creneau_hint"/"none" selon le cas.
- INTERDIT ABSOLU, quel que soit le type d'alerte : ne mentionne JAMAIS un dépassement, une enveloppe, un temps qui "ne rentre pas" ou une durée totale à respecter — ce concept n'existe plus (répartition top-down, le budget est le budget, voir plus haut). Une alerte sur le temps disponible ne peut porter que sur un CONFLIT DE JOUR (tâche positionnée un jour hors planning actuel, ou jour de containers hors créneaux), jamais sur une quantité de minutes.`
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
