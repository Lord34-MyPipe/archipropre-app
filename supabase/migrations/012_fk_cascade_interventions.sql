-- Migration 012 : ON DELETE CASCADE sur alertes et tournees_etapes → interventions
-- Correction : les FK sans cascade bloquaient la RPC planifier_interventions
-- lors de la régénération de planning (DELETE interventions futures échouait)

ALTER TABLE alertes
  DROP CONSTRAINT alertes_intervention_id_fkey,
  ADD CONSTRAINT alertes_intervention_id_fkey
    FOREIGN KEY (intervention_id) REFERENCES interventions(id) ON DELETE CASCADE;

ALTER TABLE tournees_etapes
  DROP CONSTRAINT tournees_etapes_intervention_id_fkey,
  ADD CONSTRAINT tournees_etapes_intervention_id_fkey
    FOREIGN KEY (intervention_id) REFERENCES interventions(id) ON DELETE CASCADE;
