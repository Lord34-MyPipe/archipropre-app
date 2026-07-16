// Durée au prorata pondéré — calcul serveur À LA VOLÉE (option A validée).
// Réf : docs/CONCEPTION_BATIMENTS.md §4. RIEN n'est écrit en base : les
// duree_minutes des tâches ne sont pas touchées. Cette fonction FOURNIT la durée
// de chaque zone au moment où on en a besoin (charge + planning, étape 8).
//
// Principe (§4.2) :
//   - volume_horaire_hebdo = heures vendues du contrat ramenées à la semaine.
//   - passage d'une zone = un jour distinct où au moins une de ses tâches (hebdo)
//     est planifiée.
//   - poids d'une zone = coefDuree × nb_passages.
//   - durée d'UN passage de zone = volume × coefDuree / Σ(tous les poids du contrat).
//     (le volume est réparti sur le contrat ENTIER, pas par bâtiment)
//   - durée hebdo d'une zone = durée d'un passage × nb_passages.
// Coefficients tous à 1 ⇒ prorata simple.

export interface ProrataTacheInput {
  frequence_type: string
  jours_semaine: string[] | null
}

export interface ProrataZoneInput {
  id: string
  coefDuree: number                 // normale=1, containers=0.5 (cf lib/templates COEF_ZONE)
  taches: ProrataTacheInput[]
  dureeExpliciteHebdoMin?: number | null // REPLI futur (§4.3) : durée hebdo explicite si renseignée
}

export interface ProrataZoneResult {
  zoneId: string
  nbPassages: number                // jours distincts de passage hebdo
  poids: number                     // coefDuree × nbPassages
  dureePassageMin: number           // durée d'UN passage de la zone (minutes)
  dureeHebdoMin: number             // durée hebdomadaire totale de la zone (minutes)
  source: 'prorata' | 'explicite'
}

// Nb de passages hebdo d'une zone = nb de jours distincts où ≥1 tâche HEBDO est
// planifiée. (Les autres fréquences seront intégrées plus tard ; démarrage hebdo.)
export function nbPassagesHebdo(taches: ProrataTacheInput[]): number {
  const jours = new Set<string>()
  for (const t of taches) {
    if (t.frequence_type === 'hebdo') {
      for (const j of t.jours_semaine ?? []) jours.add(j)
    }
  }
  return jours.size
}

// Heures vendues par MOIS = montant_mensuel ÷ taux horaire facturation.
// (Identique à la formule « heures vendues » des modals contrat — on la réutilise ici.)
export function heuresVenduesMois(montantMensuel: number | null, tauxHoraire: number | null): number {
  if (!montantMensuel || !tauxHoraire || tauxHoraire <= 0) return 0
  return montantMensuel / tauxHoraire
}

// Volume horaire HEBDOMADAIRE en minutes = heures vendues/mois ramenées à la
// semaine (× 12 mois / 52 semaines) × 60.
export function volumeHebdoMinutes(montantMensuel: number | null, tauxHoraire: number | null): number {
  const heuresMois = heuresVenduesMois(montantMensuel, tauxHoraire)
  return (heuresMois * 12 / 52) * 60
}

// Calcul principal : répartit le volume hebdo (minutes) sur les zones du contrat.
export function computeProrataZones(volumeHebdoMin: number, zones: ProrataZoneInput[]): ProrataZoneResult[] {
  // 1) nb passages + poids par zone
  const rows = zones.map(z => {
    const nbPassages = nbPassagesHebdo(z.taches)
    const poids = z.coefDuree * nbPassages
    return { z, nbPassages, poids }
  })
  const totalPoids = rows.reduce((s, r) => s + r.poids, 0)

  // 2) durée par zone
  return rows.map(({ z, nbPassages, poids }) => {
    // REPLI (§4.3) — durée explicite si renseignée. Non alimenté pour l'instant
    // (aucune zone n'a de durée explicite) ; la structure est prête à le brancher.
    if (z.dureeExpliciteHebdoMin != null && z.dureeExpliciteHebdoMin > 0) {
      const dureeHebdoMin = z.dureeExpliciteHebdoMin
      return {
        zoneId: z.id,
        nbPassages,
        poids,
        dureePassageMin: nbPassages > 0 ? dureeHebdoMin / nbPassages : dureeHebdoMin,
        dureeHebdoMin,
        source: 'explicite' as const,
      }
    }

    // Prorata pondéré : durée d'un passage = volume × coef / Σ poids.
    const dureePassageMin = (totalPoids > 0 && nbPassages > 0)
      ? (volumeHebdoMin * z.coefDuree) / totalPoids
      : 0
    return {
      zoneId: z.id,
      nbPassages,
      poids,
      dureePassageMin,
      dureeHebdoMin: dureePassageMin * nbPassages,
      source: 'prorata' as const,
    }
  })
}
