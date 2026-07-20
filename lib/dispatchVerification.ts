// Garde-fou de vérification déterministe sur une proposition dispatch_semaine
// générée par l'IA (route dispatch/proposer). L'IA affirme respecter R3/R4/R5
// dans son texte "alertes", mais rien ne le vérifiait — un audit manuel avait
// confirmé une proposition ponctuelle, sans garantie pour les suivantes.
// Fonction pure, lecture seule : ne fait JAMAIS confiance au texte de l'IA,
// recalcule tout depuis les données structurées (jours, zones, créneaux).
// Universel : ne dépend d'aucune résidence en particulier.

import { ORDRE_JOURS, type DispatchJour } from './dispatchSemaine'

export interface CreneauLite {
  jours: string[]
  heure_debut: string
  heure_fin: string
}

export interface VerificationResult {
  ok: boolean
  violations: string[]
}

const ECART_MIN_JOURS = 2 // R3

function creneauMaxMinutes(creneaux: CreneauLite[], jour: string): number | null {
  const c = creneaux.find(cr => cr.jours.includes(jour))
  if (!c) return null
  const [h1, m1] = c.heure_debut.split(':').map(Number)
  const [h2, m2] = c.heure_fin.split(':').map(Number)
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
}

/** Distance cyclique AVANT (0-6) de jourA vers jourB dans la semaine récurrente
 *  (ex. vendredi(4)→lundi(0) = 3, pas -4 : dispatch_semaine se répète chaque semaine). */
function ecartCyclique(jourA: string, jourB: string): number {
  const iA = ORDRE_JOURS.indexOf(jourA)
  const iB = ORDRE_JOURS.indexOf(jourB)
  return ((iB - iA) % 7 + 7) % 7
}

/**
 * R1 : un bâtiment n'apparaît jamais dans batiments_complets deux fois cette
 * semaine (le lundi lui-même ne compte qu'un « 1er passage »).
 * R3 : chaque tournée transverse référence des zones "Bâtiment/Zone" — le
 * bâtiment doit avoir un passage complet ailleurs dans le dispatch, avec un
 * écart cyclique ≥ ECART_MIN_JOURS. Vérifié bâtiment par bâtiment (pas en
 * moyenne sur le groupe d'une tournée).
 */
function verifierEcartsTournees(dispatch: DispatchJour[]): string[] {
  const violations: string[] = []
  const jourComplet = new Map<string, string>() // "Bât X" -> jour de son passage complet
  for (const j of dispatch) {
    for (const nom of j.batiments_complets) {
      if (jourComplet.has(nom)) {
        violations.push(`R1 violé : "${nom}" apparaît en bâtiment complet sur plusieurs jours (${jourComplet.get(nom)} et ${j.jour}).`)
      }
      jourComplet.set(nom, j.jour)
    }
  }

  for (const j of dispatch) {
    for (const t of j.tournees_transverses) {
      for (const zoneRef of t.zones) {
        const bat = zoneRef.split('/')[0]?.trim()
        if (!bat) continue
        const jourRef = jourComplet.get(bat)
        if (!jourRef) {
          violations.push(`R3 violé : la tournée "${t.libelle}" (${j.jour}) référence "${bat}", qui n'a AUCUN passage complet dans la proposition.`)
          continue
        }
        const ecart = ecartCyclique(jourRef, j.jour)
        if (ecart < ECART_MIN_JOURS) {
          violations.push(
            `R3 violé : "${bat}" — 1er passage ${jourRef}, 2e passage (tournée "${t.libelle}") ${j.jour} → écart réel de ${ecart} jour(s), minimum requis ${ECART_MIN_JOURS}.`
          )
        }
      }
    }
  }
  return violations
}

/**
 * R4 : sortie = veille du jour de ramassage, rentrée = jour même (collecte
 * nocturne). Calcule le mouvement ATTENDU pour chaque jour de passage
 * présent dans la proposition et le compare au mouvement PROPOSÉ — écarts
 * dans les deux sens (mouvement proposé non attendu = invention de l'IA ;
 * mouvement attendu absent = oubli).
 */
function verifierContainers(dispatch: DispatchJour[], joursRamassageContainers: string[]): string[] {
  if (joursRamassageContainers.length === 0) {
    // Contrat non concerné : tout mouvement containers proposé est une invention.
    return dispatch
      .filter(j => j.containers)
      .map(j => `R4 violé : mouvement containers "${j.containers}" proposé le ${j.jour}, mais ce contrat n'a aucun jour de ramassage renseigné.`)
  }

  // Attendu par jour, avant résolution de collision (deux jours de ramassage
  // consécutifs : la sortie du 2nd coïncide avec la rentrée du 1er → "sortie" prime).
  const attendu = new Map<string, Set<'sortie' | 'rentree'>>()
  const add = (jour: string, action: 'sortie' | 'rentree') => {
    if (!attendu.has(jour)) attendu.set(jour, new Set())
    attendu.get(jour)!.add(action)
  }
  for (const j of joursRamassageContainers) {
    if (!ORDRE_JOURS.includes(j)) continue
    const idx = ORDRE_JOURS.indexOf(j)
    const veille = ORDRE_JOURS[(idx - 1 + 7) % 7]
    add(veille, 'sortie')
    add(j, 'rentree')
  }
  const attenduResolu = new Map<string, 'sortie' | 'rentree'>()
  for (const [jour, actions] of attendu) {
    attenduResolu.set(jour, actions.has('sortie') ? 'sortie' : 'rentree')
  }

  const violations: string[] = []
  for (const j of dispatch) {
    const attendu1 = attenduResolu.get(j.jour) ?? null
    if (j.containers !== attendu1) {
      if (j.containers && !attendu1) {
        violations.push(`R4 violé : mouvement containers "${j.containers}" proposé le ${j.jour}, mais aucun mouvement n'était attendu ce jour-là (ramassage : ${joursRamassageContainers.join(', ')}).`)
      } else if (!j.containers && attendu1) {
        violations.push(`R4 violé : un mouvement "${attendu1}" était attendu le ${j.jour} (ramassage : ${joursRamassageContainers.join(', ')}) mais la proposition n'en indique aucun.`)
      } else {
        violations.push(`R4 violé : le ${j.jour} devrait être "${attendu1}" mais la proposition indique "${j.containers}".`)
      }
    }
  }
  return violations
}

/** R5 : aucune durée quotidienne annoncée ne doit dépasser le créneau réel du jour. */
function verifierCreneaux(dispatch: DispatchJour[], creneaux: CreneauLite[]): string[] {
  const violations: string[] = []
  for (const j of dispatch) {
    const max = creneauMaxMinutes(creneaux, j.jour)
    if (max != null && j.duree_totale_estimee_minutes > max) {
      violations.push(`R5 violé : le ${j.jour}, la proposition annonce ${j.duree_totale_estimee_minutes} min mais le créneau ne dispose que de ${max} min.`)
    }
  }
  return violations
}

/**
 * Enveloppe (simulation) : la somme hebdo annoncée doit rester proche de la cible —
 * tolérance 15% (plancher 20 min). L'IA propose un total en PRÉSENCE (elle ne connaît
 * pas le binôme, cf audit 21/07) ; enveloppeMinutesHebdo est en MAIN D'ŒUVRE (montant÷
 * tauxCible) — si l'agent du contrat est en binôme, on double la présence avant de
 * comparer, même règle que recalculerDureesDispatch() (lib/dispatchDuree.ts).
 */
function verifierEnveloppe(dispatch: DispatchJour[], enveloppeMinutesHebdo: number, estBinome: boolean): string[] {
  const sommePresence = dispatch.reduce((s, j) => s + j.duree_totale_estimee_minutes, 0)
  const somme = estBinome ? sommePresence * 2 : sommePresence
  const tolerance = Math.max(20, enveloppeMinutesHebdo * 0.15)
  const ecart = Math.abs(somme - enveloppeMinutesHebdo)
  if (ecart > tolerance) {
    return [`Dérive d'enveloppe : la proposition totalise ${somme} min/semaine${estBinome ? ` (${sommePresence} min de présence × 2 agents binôme)` : ''}, contre une enveloppe cible de ${Math.round(enveloppeMinutesHebdo)} min (écart ${Math.round(ecart)} min, tolérance ${Math.round(tolerance)} min).`]
  }
  return []
}

export function verifierPropositionDispatch(params: {
  dispatch: DispatchJour[]
  creneaux: CreneauLite[]
  joursRamassageContainers: string[]
  enveloppeMinutesHebdo?: number
  estBinome?: boolean
}): VerificationResult {
  const violations: string[] = [
    ...verifierEcartsTournees(params.dispatch),
    ...verifierContainers(params.dispatch, params.joursRamassageContainers),
    ...verifierCreneaux(params.dispatch, params.creneaux),
    ...(params.enveloppeMinutesHebdo != null ? verifierEnveloppe(params.dispatch, params.enveloppeMinutesHebdo, !!params.estBinome) : []),
  ]
  return { ok: violations.length === 0, violations }
}
