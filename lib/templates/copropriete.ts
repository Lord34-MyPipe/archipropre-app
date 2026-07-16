// Template « résidence / copropriété » (docs/CONCEPTION_BATIMENTS.md §3.1).
// 6 zones × 5 tâches, toutes zones normales (coef 1). Aucune UI/instanciation ici.

import { COEF_ZONE, type Template, type TemplateTache, type TemplateZone } from './types'

// 5 tâches communes à chaque zone (§3.1). Ordre = protocole des 5 doigts
// (du haut vers le bas / du propre vers le sale, cohérent avec les règles métier).
const TACHES_STANDARD: TemplateTache[] = [
  { libelle: "Toiles d'araignées",   ordre: 0 },
  { libelle: 'Dépoussiérage',         ordre: 1 },
  { libelle: 'Vitres / traces',       ordre: 2 },
  { libelle: 'Poubelle / Prospectus', ordre: 3 },
  { libelle: 'Sol',                   ordre: 4 },
]

function zoneNormale(nom: string, ordre: number): TemplateZone {
  return {
    nom,
    ordre,
    coefDuree: COEF_ZONE.normale,
    taches: TACHES_STANDARD.map(t => ({ ...t })), // copie défensive (chaque zone ses tâches)
  }
}

// 6 zones de la copropriété type (§3.1), dans l'ordre.
export const TEMPLATE_COPROPRIETE: Template = {
  key: 'copropriete',
  label: 'Résidence / copropriété',
  zones: [
    zoneNormale('Hall entrée / Ascenseur', 0),
    zoneNormale('Palier',                  1),
    zoneNormale('Escalier de service',     2),
    zoneNormale('SAS / Accès sous-sol',    3),
    zoneNormale('Garage',                  4),
    zoneNormale('Extérieur',               5),
  ],
}
