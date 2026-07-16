-- ============================================================
-- Migration 025 — Niveau Bâtiment (ÉTAPE 8a : coefficient de durée)
-- ============================================================
-- Ajout ADDITIF d'un coefficient de durée par zone, pour le prorata pondéré
-- (docs/CONCEPTION_BATIMENTS.md §4.2). Le coefficient est stocké ici mais N'EST
-- PAS encore utilisé par le planning/charge (branchement = étape 8b).
--
-- DEFAULT 1 = comportement neutre (prorata simple) pour toute zone existante ou
-- créée sans coef. Zones normales = 1, containers/poubelles = 0.5.
--
-- NOT NULL DEFAULT 1 : les lignes existantes reçoivent 1 automatiquement.
-- Aucune donnée métier modifiée.
-- ============================================================

ALTER TABLE zones_residence
  ADD COLUMN IF NOT EXISTS coef_duree NUMERIC NOT NULL DEFAULT 1;

COMMENT ON COLUMN zones_residence.coef_duree IS
  'Coefficient de durée pour le prorata pondéré (§4.2) : normale=1, containers=0.5. DEFAULT 1 = prorata simple.';
