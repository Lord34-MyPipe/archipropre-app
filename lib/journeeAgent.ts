// Calcul du temps de journée d'un agent, regroupé PAR MISSION (pas par
// intervention) — fix double comptage multi-bâtiments. Depuis l'étape 9h, les
// N interventions d'une mission multi-bâtiments partagent le même
// heure_scan/heure_fin (temps global de la résidence, pas par bâtiment) :
// sommer chaque intervention compte donc N fois le même temps. Une mission =
// même triplet (agent_id déjà fixé par l'appelant, contrat_id, date_prevue) —
// même critère que la clôture groupée (9h) et le dashboard agent (9j).
// Mono-bâtiment (contrat_id null) : repli sur l'id de l'intervention, donc
// 1 groupe = 1 intervention = comportement strictement inchangé.
//
// Utilisé à la fois par GET /api/agents/[id]/journee (affichage) et par
// POST /api/agents/[id]/journee/valider (persistance RH) pour qu'ils ne
// divergent jamais.

export interface InterventionJourneeRaw {
  id: string
  heure_scan: string | null
  heure_fin: string | null
  statut: string
  contrat_id: string | null
  residences: { nom: string } | { nom: string }[] | null
}

export interface SegmentMission {
  mission_key: string
  residence_nom: string
  nb_batiments: number
  heure_debut: string | null
  heure_fin: string | null
  duree_minutes: number | null
  trajet_apres_minutes: number | null
  statut: string
}

export interface JourneeCalculee {
  segments: SegmentMission[]
  totalTerrain: number
  totalTrajets: number
  totalJournee: number
}

export function calculerJourneeAgent(interventions: InterventionJourneeRaw[]): JourneeCalculee {
  // 1. Regrouper par mission — clé = contrat_id, repli sur l'id propre si null.
  const groupes = new Map<string, InterventionJourneeRaw[]>()
  for (const inter of interventions) {
    const key = inter.contrat_id ?? inter.id
    const arr = groupes.get(key)
    if (arr) arr.push(inter)
    else groupes.set(key, [inter])
  }

  type Mission = {
    key: string
    residenceNom: string
    nbBatiments: number
    heureDebut: string | null
    heureFin: string | null
    statut: string
  }

  const missions: Mission[] = []
  for (const [key, groupe] of groupes) {
    // heure_scan/heure_fin sont identiques sur toutes les interventions du
    // groupe depuis 9h — min/max reste correct même si un cas futur les
    // désynchronisait légèrement (défensif, pas de régression possible).
    let heureDebut: string | null = null
    let heureFin: string | null = null
    for (const inter of groupe) {
      if (inter.heure_scan && (!heureDebut || inter.heure_scan < heureDebut)) heureDebut = inter.heure_scan
      if (inter.heure_fin && (!heureFin || inter.heure_fin > heureFin)) heureFin = inter.heure_fin
    }

    const first = groupe[0]
    const res = first.residences
    const residenceNom = res
      ? (Array.isArray(res) ? res[0]?.nom : (res as { nom: string }).nom) ?? '—'
      : '—'

    // Statut mission : 'validee' seulement si TOUT le groupe l'est (cohérent
    // avec la clôture groupée 9h qui fait passer tous les bâtiments ensemble).
    const statut = groupe.every(i => i.statut === 'validee') ? 'validee' : 'terminee'

    missions.push({ key, residenceNom, nbBatiments: groupe.length, heureDebut, heureFin, statut })
  }

  missions.sort((a, b) => (a.heureDebut ?? '').localeCompare(b.heureDebut ?? ''))

  // 2. Un segment PAR MISSION. Trajets recalculés ENTRE missions (fin
  // mission N → début mission N+1) — jamais entre bâtiments d'une même
  // mission (ce qui donnait un trajet négatif, déjà filtré avant, mais qui
  // n'a plus lieu d'être puisqu'il n'y a plus qu'un segment par mission).
  const segments: SegmentMission[] = missions.map((m, i) => {
    const debut = m.heureDebut ? new Date(m.heureDebut) : null
    const fin   = m.heureFin ? new Date(m.heureFin) : null
    const dureeMin = debut && fin ? Math.round((fin.getTime() - debut.getTime()) / 60000) : null

    const next = missions[i + 1]
    const trajetMin = fin && next?.heureDebut
      ? Math.round((new Date(next.heureDebut).getTime() - fin.getTime()) / 60000)
      : null

    return {
      mission_key:          m.key,
      residence_nom:        m.residenceNom,
      nb_batiments:         m.nbBatiments,
      heure_debut:          m.heureDebut,
      heure_fin:            m.heureFin,
      duree_minutes:        dureeMin,
      trajet_apres_minutes: trajetMin !== null && trajetMin > 0 ? trajetMin : null,
      statut:               m.statut,
    }
  })

  const totalTerrain = segments.reduce((s, seg) => s + (seg.duree_minutes ?? 0), 0)
  const totalTrajets = segments.reduce((s, seg) => s + (seg.trajet_apres_minutes ?? 0), 0)

  return { segments, totalTerrain, totalTrajets, totalJournee: totalTerrain + totalTrajets }
}
