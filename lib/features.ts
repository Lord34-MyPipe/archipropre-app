export const FEATURES = {
  anaCopilote:       false,  // bouton flottant ANA + CopilotePanel + ReorganisationPanel
  suggestionIA:      false,  // boutons "Obtenir une suggestion IA" (AgentAttitreModal, PlanifierModal)
  rentabilite:       false,  // boutons+modal Rentabilité (fiche résidence, cartes contrat) + page /directeur/rentabilite
  catalogueProduits: false,  // nav directeur + page /directeur/catalogue
  commandesProduits: false,  // bloc Réappro dashboard, CommandeDetailDrawer, étapes chariot+produits du contrôle-final agent
  passagesSiege:     false,  // boutons "+ Passage siège", PlanifierModal retrait, carte passage bureau agent
  exportRhPdf:       true,   // export RH mensuel — ON GARDE
} as const

export const SEUIL_RETARD_SCAN_MIN = 15
