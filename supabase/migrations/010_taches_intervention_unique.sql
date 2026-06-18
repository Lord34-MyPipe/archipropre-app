-- Contrainte UNIQUE (intervention_id, tache_template_id) sur taches_intervention
-- Permet ON CONFLICT DO NOTHING au scan pour éviter les doublons sans DELETE préalable.
-- PostgreSQL traite les NULLs comme distincts : les tâches ponctuelles (tache_template_id IS NULL)
-- ne sont pas affectées par cette contrainte.
ALTER TABLE taches_intervention
  ADD CONSTRAINT taches_intervention_unique_template
  UNIQUE (intervention_id, tache_template_id);
