-- Ajoute 'annulee' aux valeurs autorisées pour interventions.statut
ALTER TABLE interventions DROP CONSTRAINT interventions_statut_check;
ALTER TABLE interventions ADD CONSTRAINT interventions_statut_check
  CHECK (statut = ANY (ARRAY['planifiee','en_cours','terminee','non_demarree','disponible','annulee']));
