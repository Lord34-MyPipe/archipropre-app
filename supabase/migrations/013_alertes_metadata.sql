-- Migration 013 : colonne metadata JSONB sur alertes
-- Stocke les données structurées de l'alerte (ex. intervention_ids pour reorganisation_proposee)

ALTER TABLE alertes ADD COLUMN IF NOT EXISTS metadata JSONB;
