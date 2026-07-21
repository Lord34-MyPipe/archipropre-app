// Types + sanitisation partagés entre /api/ia/analyse-contrat (analyse initiale
// depuis un texte de contrat) et /api/ia/analyse-contrat/ajuster (ajustement
// ciblé d'une structure déjà existante suite à une réponse du manager sur une
// alerte). Extrait le 21/07 (chantier "alertes actionnables", sous-étape 4)
// pour que les deux routes valident EXACTEMENT la même forme — un seul
// endroit, jamais de divergence entre les deux sanitisations.

import { type DispatchJour, sanitiserDispatch } from './dispatchSemaine'

export const JOURS_VALIDES = new Set(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])

// ── Types de sortie (mêmes clés que AnalyseContratWizard.tsx) ──
// Refonte top-down (21/07) : plus de duree_minutes_estimee, plus de totaux/
// verdict — l'IA ne compare plus jamais un temps proposé à une enveloppe. Les
// tâches basse fréquence restent dans l'arbre bâtiments→zones→taches,
// positionnées (semaine_du_mois / mois_de_annee), alignées sur les colonnes
// déjà existantes de taches_template.

export interface AnalyseTache {
  libelle: string
  frequence_type: 'hebdo' | 'mensuel' | 'trimestriel' | 'semestriel' | 'annuel'
  jours_semaine: string[]           // hebdo : 1+ jours. Basse fréquence : exactement 1 jour positionné.
  semaine_du_mois: number[] | null  // mensuel uniquement : [1..5] (5 = dernière semaine du mois)
  mois_de_annee: number[] | null    // trimestriel/semestriel/annuel uniquement : mois 1-12 concernés
}
export interface AnalyseZone {
  nom: string
  taches: AnalyseTache[]
}
export interface AnalyseBatiment {
  nom: string
  zones: AnalyseZone[]
}
export interface CreneauPropose {
  jours: string[]
  heure_debut: string
  heure_fin: string
}
export interface HorsPlanning {
  libelle: string
  frequence: string
  note: string
}

// Alertes actionnables — vocabulaire d'effets FERMÉ, chacun mappé sur un
// mutateur déjà existant côté client (AnalyseContratEtape3.tsx :
// updateTache/deleteTache/goTo) — rien d'autre n'est ajouté ni prévu. `cible`
// référence une tâche par clé NATURELLE (batiment+zone+libelle), jamais par
// id local (inconnu de l'IA).
export type EffetAlerte = 'move_task_day' | 'set_semaine_du_mois' | 'set_mois_de_annee' | 'remove_task' | 'add_creneau_hint' | 'none'
export interface AlerteCible {
  batiment: string
  zone: string
  libelle: string
}
export interface AlerteOption {
  libelle: string
  effet: EffetAlerte
  cible: AlerteCible | null
  valeur: string | number | number[] | null
}
export interface Alerte {
  type: 'question' | 'info'
  sujet: string
  message: string
  options: AlerteOption[]
}

export interface AnalyseIA {
  batiments: AnalyseBatiment[]
  creneaux_proposes: CreneauPropose[]
  jours_interdits_detectes: string[]
  hors_planning_hebdo: HorsPlanning[]
  alertes: Alerte[]
  dispatch_semaine: DispatchJour[]
}

export const FREQUENCES_VALIDES = new Set(['hebdo', 'mensuel', 'trimestriel', 'semestriel', 'annuel'])
export const SEMAINES_MOIS_DEFAUT = [1]           // mensuel sans semaine_du_mois exploitable → 1ère semaine
export const MOIS_ANNEE_DEFAUT: Record<string, number[]> = {
  trimestriel: [1, 4, 7, 10],
  semestriel:  [1, 7],
  annuel:      [1],
}

export const EFFETS_VALIDES = new Set<EffetAlerte>(['move_task_day', 'set_semaine_du_mois', 'set_mois_de_annee', 'remove_task', 'add_creneau_hint', 'none'])
export const EFFETS_AVEC_CIBLE = new Set<EffetAlerte>(['move_task_day', 'set_semaine_du_mois', 'set_mois_de_annee', 'remove_task'])

// Alertes (vocabulaire d'effets FERMÉ, cf commentaire du type Alerte) : chaque
// option est validée indépendamment — une option invalide (effet inconnu,
// cible absente de l'arbre qu'on vient de produire, valeur mal formée) est
// silencieusement retirée SANS faire tomber toute l'alerte ni planter. La
// cible est vérifiée contre les tâches RÉELLEMENT présentes dans `batiments`
// (déjà sanitisé) — jamais de confiance aveugle dans ce que l'IA prétend avoir
// créé.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitiserAlertes(raw: any, batiments: AnalyseBatiment[]): Alerte[] {
  const clesTaches = new Set<string>()
  for (const b of batiments) {
    for (const z of b.zones) {
      for (const t of z.taches) {
        clesTaches.add(`${b.nom} ${z.nom} ${t.libelle}`)
      }
    }
  }

  function sanitiserOption(o: unknown): AlerteOption | null {
    if (!o || typeof o !== 'object') return null
    const rec = o as Record<string, unknown>
    const libelle = typeof rec.libelle === 'string' ? rec.libelle.trim() : ''
    if (!libelle) return null
    const effet = typeof rec.effet === 'string' && EFFETS_VALIDES.has(rec.effet as EffetAlerte) ? rec.effet as EffetAlerte : null
    if (!effet) return null

    if (!EFFETS_AVEC_CIBLE.has(effet)) {
      // add_creneau_hint / none : jamais de cible ni de valeur, quoi qu'ait
      // renvoyé le modèle — effets sans mutation de tâche par définition.
      return { libelle, effet, cible: null, valeur: null }
    }

    const cibleRaw = rec.cible
    if (!cibleRaw || typeof cibleRaw !== 'object') return null
    const cRec = cibleRaw as Record<string, unknown>
    const cible: AlerteCible = {
      batiment: typeof cRec.batiment === 'string' ? cRec.batiment : '',
      zone:     typeof cRec.zone === 'string' ? cRec.zone : '',
      libelle:  typeof cRec.libelle === 'string' ? cRec.libelle : '',
    }
    if (!clesTaches.has(`${cible.batiment} ${cible.zone} ${cible.libelle}`)) return null

    if (effet === 'remove_task') return { libelle, effet, cible, valeur: null }

    if (effet === 'move_task_day') {
      const jour = typeof rec.valeur === 'string' && JOURS_VALIDES.has(rec.valeur) ? rec.valeur : null
      return jour ? { libelle, effet, cible, valeur: jour } : null
    }

    if (effet === 'set_semaine_du_mois') {
      const n = Number(rec.valeur)
      return Number.isInteger(n) && n >= 1 && n <= 5 ? { libelle, effet, cible, valeur: n } : null
    }

    // set_mois_de_annee
    const mois = Array.isArray(rec.valeur)
      ? (rec.valeur as unknown[]).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12)
      : []
    return mois.length > 0 ? { libelle, effet, cible, valeur: mois } : null
  }

  if (!Array.isArray(raw)) return []
  const alertes: Alerte[] = []
  for (const a of raw as unknown[]) {
    if (!a || typeof a !== 'object') continue
    const rec = a as Record<string, unknown>
    const message = typeof rec.message === 'string' ? rec.message.trim() : ''
    if (!message) continue // une alerte sans texte n'a aucune valeur pour le manager
    const type: Alerte['type'] = rec.type === 'question' ? 'question' : 'info'
    const sujet = typeof rec.sujet === 'string' && rec.sujet.trim() ? rec.sujet.trim() : message.slice(0, 60)
    const options = type === 'question' && Array.isArray(rec.options)
      ? (rec.options as unknown[]).map(sanitiserOption).filter((o): o is AlerteOption => o !== null)
      : []
    alertes.push({ type, sujet, message, options })
  }
  return alertes
}

// Sanitisation de l'arbre bâtiments→zones→taches seul — extrait pour être
// réutilisable par /api/ia/analyse-contrat (analyse complète) ET
// /api/ia/analyse-contrat/ajuster (ajustement ciblé, qui ne renvoie/reçoit que
// cet arbre, sans creneaux_proposes/hors_planning_hebdo/alertes/dispatch_semaine).
// `horsPlanning` est un accumulateur optionnel (mutable) dans lequel les
// tâches non positionnables basculent — laissé vide si l'appelant n'en a pas
// l'usage (cf ajuster/route.ts, qui ignore ce cas plutôt que de le traiter).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitiserBatiments(rawBatiments: any, horsPlanning: HorsPlanning[] = []): AnalyseBatiment[] {
  return (Array.isArray(rawBatiments) ? rawBatiments : [])
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
}

// Nettoie et sécurise le JSON retourné par le modèle : coerce les types,
// POSITIONNE les tâches basse fréquence (défaut transparent si le modèle a
// omis semaine_du_mois/mois_de_annee — jamais un blocage, toujours modifiable
// ensuite par le manager), et ignore silencieusement les entrées mal formées
// plutôt que de planter. hors_planning_hebdo n'est plus qu'un filet défensif
// résiduel (entrées vraiment non positionnables : fréquence ou jour illisibles).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitiserAnalyse(raw: any): AnalyseIA {
  const horsPlanning: HorsPlanning[] = Array.isArray(raw?.hors_planning_hebdo)
    ? raw.hors_planning_hebdo
        .filter((h: unknown) => h && typeof h === 'object')
        .map((h: Record<string, unknown>) => ({
          libelle:   typeof h.libelle === 'string' ? h.libelle : '(sans libellé)',
          frequence: typeof h.frequence === 'string' ? h.frequence : 'non précisée',
          note:      typeof h.note === 'string' ? h.note : '',
        }))
    : []

  const batiments = sanitiserBatiments(raw?.batiments, horsPlanning)

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

  const alertes = sanitiserAlertes(raw?.alertes, batiments)

  return {
    batiments,
    creneaux_proposes: creneaux,
    jours_interdits_detectes: joursInterdits,
    hors_planning_hebdo: horsPlanning,
    alertes,
    dispatch_semaine: sanitiserDispatch(raw?.dispatch_semaine),
  }
}
