// Registre extensible des templates zones/tâches (docs/CONCEPTION_BATIMENTS.md §3.2).
//
// Ajouter un futur template (tertiaire, cabinet médical…) = créer un nouveau fichier
// lib/templates/<x>.ts qui exporte un `Template`, puis ajouter une entrée dans REGISTRY
// ci-dessous. Aucune refonte, aucune table `templates` en base (sur-ingénierie évitée).

import { TEMPLATE_COPROPRIETE } from './copropriete'
import type { Template } from './types'

export * from './types'
export { TEMPLATE_COPROPRIETE } from './copropriete'

// Un template = une entrée ici.
const REGISTRY: Template[] = [
  TEMPLATE_COPROPRIETE,
]

// Accès par clé.
export const TEMPLATES: Record<string, Template> =
  Object.fromEntries(REGISTRY.map(t => [t.key, t]))

// Récupère un template par sa clé, ou null s'il n'existe pas.
export function getTemplate(key: string): Template | null {
  return TEMPLATES[key] ?? null
}

// Liste { key, label } pour un futur sélecteur d'UI (étape 5), sans exposer la structure.
export function listTemplates(): { key: string; label: string }[] {
  return REGISTRY.map(t => ({ key: t.key, label: t.label }))
}
