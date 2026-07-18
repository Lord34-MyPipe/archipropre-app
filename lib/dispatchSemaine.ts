// Chantier "Répartition semaine" — règles R1-R5 et types partagés entre
// /api/ia/analyse-contrat (nouveau contrat, item 2) et
// /api/residences/[id]/contrats/[contratId]/dispatch/proposer (contrat
// existant, item 5). Un seul endroit pour ces règles, valables pour toute
// résidence, afin de ne jamais les faire diverger entre les deux appelants.

export interface TourneeTransverse {
  libelle: string
  zones: string[] // forme "Nom du bâtiment/Nom de la zone"
}
export interface DispatchJour {
  jour: string
  batiments_complets: string[]
  tournees_transverses: TourneeTransverse[]
  containers: 'sortie' | 'rentree' | null
  duree_totale_estimee_minutes: number
}

export const JOURS_VALIDES = new Set(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])
export const ORDRE_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

// ── Prompt système — règles R1-R5 (universelles, cf conception du chantier) ──

export function reglesDispatchPrompt(): string {
  return `RÈGLES DE RÉPARTITION SEMAINE (dispatch_semaine) — ABSOLUES, valables pour toute résidence :
R1. Un bâtiment commencé est terminé dans la même intervention : ne JAMAIS répartir les zones d'un même bâtiment sur plusieurs jours dans batiments_complets.
R2. Les bâtiments identiques se répartissent équitablement sur les jours de passage (ex. 9 bâtiments / 5 jours → 2-2-2-2-1). Chaque bâtiment apparaît dans EXACTEMENT UN jour de batiments_complets (jamais deux, jamais zéro).
R3. Pour une prestation bi-hebdomadaire par bâtiment (ex. halls 2×/semaine) : le 1er passage a lieu le jour de l'entretien complet du bâtiment (il fait partie de batiments_complets ce jour-là). Le 2e passage est une "tournée transverse" (tournees_transverses) un AUTRE jour, espacé d'AU MOINS 2 jours du premier passage. Place les tournées transverses en priorité sur les jours les plus légers (ceux avec le moins de bâtiments complets ce jour-là).
R4. Containers = zone commune résidence (pas par bâtiment, jamais dans batiments_complets ni tournees_transverses). Si jours_ramassage_containers est fourni : pour chaque jour de ramassage J, sortie = veille de J (J-1), rentrée = lendemain de J (J+1) — sauf si J+1 est déjà un autre jour de ramassage, auquel cas la rentrée et la sortie suivante coïncident (une seule entrée ce jour-là, containers="sortie" prime). Si un jour de sortie ou de rentrée calculé tombe HORS des jours de passage de l'agent (planningActuel.jours) : NE JAMAIS inventer un jour de repli — ajoute une alerte explicite décrivant précisément le conflit et proposant 1 ou 2 alternatives (jour précédent/suivant disponible dans planningActuel.jours), en laissant le choix final à l'utilisateur.
R5. La somme de duree_totale_estimee_minutes d'un jour doit tenir dans le créneau de ce jour (heure_fin − heure_debut) ; si ça dépasse, ajoute une alerte chiffrant précisément le dépassement.

FORMAT dispatch_semaine (tableau, un objet par jour de passage réellement actif — jours sans aucune activité omis) :
"dispatch_semaine": [
  { "jour": "lundi",
    "batiments_complets": ["Bât 1", "Bât 2"],
    "tournees_transverses": [ { "libelle": "Halls Bât 5-8 (2e passage)", "zones": ["Bât 5/Hall d'entrée", "Bât 6/Hall d'entrée"] } ],
    "containers": "sortie" | "rentree" | null,
    "duree_totale_estimee_minutes": 230 }
]
Les libellés de zones dans tournees_transverses.zones DOIVENT suivre exactement la forme "Nom du bâtiment/Nom de la zone", correspondant aux bâtiments/zones réels fournis en contexte — jamais un nom inventé.`
}

// ── Sanitisation défensive (même esprit que sanitiserAnalyse dans analyse-contrat) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitiserDispatch(raw: any): DispatchJour[] {
  if (!Array.isArray(raw)) return []
  const out: DispatchJour[] = []
  for (const j of raw) {
    if (!j || typeof j !== 'object') continue
    const rec = j as Record<string, unknown>
    const jour = typeof rec.jour === 'string' ? rec.jour : ''
    if (!JOURS_VALIDES.has(jour)) continue

    const batiments = Array.isArray(rec.batiments_complets)
      ? (rec.batiments_complets as unknown[]).filter((x): x is string => typeof x === 'string')
      : []

    const tournees: TourneeTransverse[] = Array.isArray(rec.tournees_transverses)
      ? (rec.tournees_transverses as unknown[])
          .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
          .map(t => ({
            libelle: typeof t.libelle === 'string' && t.libelle.trim() ? t.libelle : 'Tournée transverse',
            zones: Array.isArray(t.zones) ? (t.zones as unknown[]).filter((z): z is string => typeof z === 'string') : [],
          }))
      : []

    const containersRaw = rec.containers
    const containers = containersRaw === 'sortie' || containersRaw === 'rentree' ? containersRaw : null
    const duree = Math.max(0, Math.round(Number(rec.duree_totale_estimee_minutes) || 0))

    out.push({ jour, batiments_complets: batiments, tournees_transverses: tournees, containers, duree_totale_estimee_minutes: duree })
  }
  return out.sort((a, b) => ORDRE_JOURS.indexOf(a.jour) - ORDRE_JOURS.indexOf(b.jour))
}
