// Recalcul RIGOUREUX de la durée d'un dispatch_semaine — même règle que la
// branche dispatch-aware de /api/planning/generer (correctif "durée dispatch"),
// exposée ici en fonction pure (lecture seule, aucune écriture) pour que
// n'importe quel écran d'affichage (ex. SimulationTauxRentablePanel) montre
// la VRAIE durée qu'une régénération produirait, au lieu d'un texte libre
// jamais mis à jour. Duplique volontairement la formule de generer/route.ts
// plutôt que de le refactorer : ce fichier est un calcul d'AFFICHAGE only,
// on ne touche pas au chemin de génération réel déjà testé/validé.

import { type DispatchJour } from './dispatchSemaine'

export interface ZoneLite {
  id: string
  nom: string
  batiment: string | null
}
export interface CreneauLite {
  jours: string[]
  heure_debut: string
  heure_fin: string
}

const DUREE_CONTAINERS_MIN = 5 // même forfait que generer/route.ts (sortie/rentrée bacs)

const normalizeTime = (t: string | null | undefined): string | null => (t ? t.substring(0, 5) : null)

function creneauPourJour(creneaux: CreneauLite[], jour: string): CreneauLite | null {
  return creneaux.find(c => c.jours.includes(jour)) ?? null
}

/** Même logique que groupZonesByBatiment (generer/route.ts) / zoneGroups (TachesClient.tsx). */
export function grouperZonesParBatiment(zones: ZoneLite[]): { label: string | null; zones: ZoneLite[] }[] {
  const hasBatiment = zones.some(z => z.batiment && z.batiment.trim() !== '')
  if (!hasBatiment) return [{ label: null, zones }]

  const parBatiment = new Map<string, ZoneLite[]>()
  const sansBatiment: ZoneLite[] = []
  for (const z of zones) {
    const b = z.batiment?.trim()
    if (b) {
      const arr = parBatiment.get(b) ?? []
      arr.push(z)
      parBatiment.set(b, arr)
    } else {
      sansBatiment.push(z)
    }
  }
  const keys = [...parBatiment.keys()].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }))
  const groups = keys.map(b => ({ label: b, zones: parBatiment.get(b)! }))
  if (sansBatiment.length > 0) groups.push({ label: 'Sans bâtiment', zones: sansBatiment })
  return groups
}

/** Même logique que zoneParNomComplet (generer/route.ts) : clé "Bâtiment/Zone" + repli nom seul. */
export function indexerZonesParNom(zones: ZoneLite[]): Map<string, ZoneLite> {
  const index = new Map<string, ZoneLite>()
  for (const z of zones) {
    const cle = z.batiment?.trim() ? `${z.batiment.trim()}/${z.nom.trim()}` : z.nom.trim()
    index.set(cle.toLowerCase(), z)
    index.set(z.nom.trim().toLowerCase(), z)
  }
  return index
}

/**
 * Recalcule duree_totale_estimee_minutes pour CHAQUE jour d'un dispatch_semaine.
 * Règle identique à generer/route.ts : le créneau du jour (moins containers
 * éventuels) est réparti à parts égales (+ reste) entre les unités (bâtiments
 * complets + tournées) réellement résolues ce jour — jamais un texte libre.
 * Conséquence mathématique (déjà démontrée lors du correctif durée dispatch) :
 * dès qu'au moins une unité est prévue ce jour-là, la somme des parts + les
 * containers remplit EXACTEMENT le créneau — pas besoin de répéter la
 * répartition unité par unité ici, seul le total du jour est affiché.
 * Ne modifie ni n'insère rien : lecture pure.
 */
export function recalculerDureesDispatch(
  dispatchSemaine: DispatchJour[],
  creneaux: CreneauLite[],
  zones: ZoneLite[],
): { dispatch: DispatchJour[]; warnings: string[] } {
  const zoneGroups = grouperZonesParBatiment(zones)
  const zoneParNomComplet = indexerZonesParNom(zones)
  const warnings: string[] = []

  const dispatch = dispatchSemaine.map(jourEntry => {
    const creneau = creneauPourJour(creneaux, jourEntry.jour)
    const hDebut = creneau ? normalizeTime(creneau.heure_debut) : null
    const hFin = creneau ? normalizeTime(creneau.heure_fin) : null
    const dureeCreneauJour = (hDebut && hFin) ? (() => {
      const [h1, m1] = hDebut.split(':').map(Number)
      const [h2, m2] = hFin.split(':').map(Number)
      return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
    })() : null

    const nbBatimentsResolus = jourEntry.batiments_complets.filter(nom => {
      const trouve = zoneGroups.some(g => g.label === nom)
      if (!trouve) warnings.push(`${jourEntry.jour} — bâtiment "${nom}" introuvable dans les zones actuelles`)
      return trouve
    }).length

    const nbTourneesResolues = jourEntry.tournees_transverses.filter(t => {
      const resolue = t.zones.some(nz => zoneParNomComplet.has(nz.trim().toLowerCase()))
      if (!resolue) warnings.push(`${jourEntry.jour} — tournée "${t.libelle}" : zones non reconnues`)
      return resolue
    }).length

    const dureeContainers = jourEntry.containers ? DUREE_CONTAINERS_MIN : 0
    const nbUnites = nbBatimentsResolus + nbTourneesResolues

    const total = nbUnites === 0
      ? dureeContainers
      : dureeCreneauJour != null
        ? dureeCreneauJour
        : nbUnites * 60 + dureeContainers // repli si aucun créneau connu ce jour (cf generer/route.ts)

    return { ...jourEntry, duree_totale_estimee_minutes: Math.round(total) }
  })

  return { dispatch, warnings }
}
