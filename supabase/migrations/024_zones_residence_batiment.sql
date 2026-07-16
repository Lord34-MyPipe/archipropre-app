-- ============================================================
-- Migration 024 — Niveau Bâtiment (ÉTAPE 1 : schéma uniquement)
-- ============================================================
-- Ajout ADDITIF d'une colonne facultative pour regrouper les zones
-- d'une résidence par bâtiment.
--
-- Purement additive, aucun risque pour l'existant :
--   - colonne TEXT NULLABLE, sans valeur par défaut, sans contrainte
--   - reste NULL pour toutes les lignes existantes
--   - AUCUN flux existant ne la lit encore
--     (template, UI zones/tâches, prorata = étapes suivantes, une par une)
--
-- Aucune donnée modifiée, aucun NOT NULL, rien d'autre touché.
-- ============================================================

ALTER TABLE zones_residence
  ADD COLUMN IF NOT EXISTS batiment TEXT;

COMMENT ON COLUMN zones_residence.batiment IS
  'Bâtiment regroupant la zone (facultatif — niveau Bâtiment, étape 1). NULL = non renseigné. Rien ne le lit encore.';
