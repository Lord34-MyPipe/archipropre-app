// Types partagés des templates zones/tâches.
// Réf : docs/CONCEPTION_BATIMENTS.md §3 (template) et §4.2 (coefficients de durée).
// Étape 2 : structure de données uniquement — aucune UI, aucune route, aucune
// instanciation (l'instanciation viendra à l'étape 5).

// Coefficients de durée par type de zone (§4.2). Servent au prorata PONDÉRÉ
// (étape 7) : invisibles pour l'utilisateur, pré-remplis dans les templates.
// Tous à 1 = prorata simple (comportement de repli).
export const COEF_ZONE = {
  normale:    1,
  containers: 0.5, // gestion poubelles/containers : ~moitié d'une zone normale
} as const

export type CoefZoneKey = keyof typeof COEF_ZONE

export interface TemplateTache {
  libelle: string
  ordre: number // protocole des 5 doigts : du haut vers le bas / du propre vers le sale
}

export interface TemplateZone {
  nom: string
  ordre: number
  coefDuree: number // COEF_ZONE.normale (1) par défaut ; containers = 0.5
  taches: TemplateTache[]
}

export interface Template {
  key: string   // identifiant stable, utilisé par le registre
  label: string // libellé affichable
  zones: TemplateZone[]
}
