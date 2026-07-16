-- ============================================================
-- Migration 026 — Niveau Bâtiment (ÉTAPE 8b-1 : durée par zone)
-- ============================================================
-- Ajout ADDITIF d'une durée manuelle par zone, saisie via des puces
-- cliquables dans l'écran zones/tâches du contrat
-- (docs/CONCEPTION_BATIMENTS.md §4.3 — « prévoir que le système accepte une
-- durée par zone si elle est renseignée, et retombe sur le prorata sinon »).
--
-- duree_minutes = durée d'UN PASSAGE dans la zone (pas la durée hebdo totale).
-- NULL = pas de durée saisie → repli sur le prorata pondéré
-- (lib/prorata.ts, coef_duree, migration 025).
--
-- Nullable, aucun défaut : additive, ne modifie aucune donnée existante,
-- ne casse aucun flux (rien ne la lit avant l'étape 8b-2).
-- ============================================================

ALTER TABLE zones_residence
  ADD COLUMN IF NOT EXISTS duree_minutes INTEGER NULL;

COMMENT ON COLUMN zones_residence.duree_minutes IS
  'Durée manuelle d''UN passage dans la zone (minutes). NULL = repli sur le prorata pondéré (coef_duree). Prend le pas sur le prorata si renseignée (§4.3).';
