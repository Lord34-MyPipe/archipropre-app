-- ============================================================
-- Migration 027 — Niveau Bâtiment (ÉTAPE 8b-4 : bâtiment sur intervention)
-- ============================================================
-- Ajout ADDITIF d'une étiquette bâtiment par intervention. Depuis l'étape
-- 8b-3, une ligne d'intervention représente déjà un passage sur UN bâtiment
-- un jour donné (enchaînement horaire) — il ne reste qu'à persister le label
-- pour pouvoir l'afficher dans le planning (docs/CONCEPTION_BATIMENTS.md §7.4,
-- audit 8b-3 option C1).
--
-- NULL = mono-bâtiment (résidence sans étiquette bâtiment) OU intervention
-- générée avant ce changement — le planning retombe alors sur le libellé du
-- contrat, comme aujourd'hui (repli géré côté affichage, pas ici).
--
-- Nullable, aucun défaut : additive, ne modifie aucune ligne existante, ne
-- casse aucun flux (rien ne l'écrit avant le CREATE OR REPLACE de la RPC
-- planifier_interventions qui accompagne cette migration).
-- ============================================================

ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS batiment TEXT NULL;

COMMENT ON COLUMN interventions.batiment IS
  'Étiquette du bâtiment couvert par cette intervention (§5.2/§7.4). NULL = mono-bâtiment ou intervention générée avant l''étape 8b-4 → repli sur le libellé du contrat à l''affichage.';
