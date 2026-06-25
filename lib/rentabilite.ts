export interface TacheFrequence {
  duree_minutes: number | null
  frequence_type: string
  jours_semaine: string[] | null
  frequence_valeur?: number | null
}

export interface KpiResidence {
  caMois: number
  coutMoisEstime: number
  margeMois: number
  tauxMarge: number | null  // null si caMois = 0
  perteCachee: boolean      // ≥1 contrat actif avec marge négative
  hasContrats: boolean
}

// Formule d'annualisation par fréquence — source de vérité unique
export function calcMinutesAnnuelles(taches: TacheFrequence[]): { annuel: number; incompleteCount: number } {
  let annuel = 0
  let incompleteCount = 0
  for (const t of taches) {
    const d = t.duree_minutes ?? 0
    if (!d) { incompleteCount++; continue }
    const nJours = Math.max((t.jours_semaine ?? []).length, 1)
    switch (t.frequence_type) {
      case 'hebdo':
      case 'contrainte_horaire':
        annuel += d * 52 * nJours; break
      case 'mensuel':
        annuel += d * 12 * Math.max(t.frequence_valeur || 1, 1); break
      case 'trimestriel':
        annuel += d * 4; break
      case 'semestriel':
        annuel += d * 2; break
      case 'annuel':
        annuel += d; break
    }
  }
  return { annuel, incompleteCount }
}

// Pour RentabiliteModal — retourne semaine / mois / année + incomplètes
export function calcDureBreakdown(taches: TacheFrequence[]) {
  const { annuel, incompleteCount } = calcMinutesAnnuelles(taches)
  return { annuel, mois: annuel / 12, semaine: annuel / 52, incompleteCount }
}

// Pour page.tsx et la route — coût mensuel estimé en €
export function calcCoutMensuel(taches: TacheFrequence[], tauxAgent: number): number {
  const { annuel } = calcMinutesAnnuelles(taches)
  return (annuel / 12 / 60) * tauxAgent
}
