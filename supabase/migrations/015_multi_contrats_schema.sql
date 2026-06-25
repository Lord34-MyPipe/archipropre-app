-- ============================================================
-- Migration 015 — Préparation schéma multi-contrats
-- ÉTAPE 1 : colonnes additionnelles uniquement, AUCUNE donnée modifiée
-- L'app continue de fonctionner sans changement de comportement.
-- ============================================================

-- 1. Type enum pour la nature du contrat
CREATE TYPE type_contrat_enum AS ENUM (
  'parties_communes',
  'containers',
  'espaces_verts'
);

-- 2. Nouvelles colonnes sur contrats_residences (toutes nullable)
ALTER TABLE contrats_residences
  ADD COLUMN IF NOT EXISTS libelle             TEXT,
  ADD COLUMN IF NOT EXISTS type_contrat        type_contrat_enum DEFAULT 'parties_communes',
  ADD COLUMN IF NOT EXISTS agent_prefere_id    UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS qr_code_token       TEXT;

-- 3. Nouvelle colonne sur zones_residence (nullable — FK non bloquante)
ALTER TABLE zones_residence
  ADD COLUMN IF NOT EXISTS contrat_id UUID REFERENCES contrats_residences(id);

-- 4. Nouvelle colonne sur interventions (nullable — FK non bloquante)
ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS contrat_id UUID REFERENCES contrats_residences(id);

-- Aucun UPDATE, aucun NOT NULL, aucune donnée modifiée.
-- Les colonnes restent NULL pour toutes les lignes existantes.
-- L'app lit/écrit les colonnes actuelles sans jamais toucher les nouvelles.
