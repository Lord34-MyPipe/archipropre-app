-- ============================================================
-- Migration 032 — Dispatch semaine + jours de ramassage containers
-- (chantier "Répartition semaine")
-- ============================================================
-- Deux colonnes additives sur contrats_residences, aucune donnée existante
-- modifiée.
--
-- a) jours_ramassage_containers TEXT[] NULL.
--    Jours de collecte containers (agglo), saisis étape 1 du wizard.
--    NULL/vide = résidence non concernée par une gestion de containers
--    pilotée par des jours de ramassage (comportement actuel inchangé pour
--    tout contrat qui ne renseigne pas ce champ).
--
-- b) dispatch_semaine JSONB NULL.
--    Répartition semaine validée par le manager à l'étape 3 du wizard :
--    un objet par jour de passage, forme
--      [ { "jour": "lundi",
--          "batiments_complets": ["Bât 1","Bât 2"],
--          "tournees_transverses": [ { "libelle": "...", "zones": ["Bât X/Zone Y", ...] } ],
--          "containers": "sortie" | "rentree" | null,
--          "duree_totale_estimee_minutes": 230 }, ... ]
--    NULL = aucun dispatch défini → /api/planning/generer garde son
--    comportement actuel (enchaînement de tous les groupes chaque jour actif,
--    RÉTROCOMPATIBILITÉ STRICTE pour tout contrat existant). Un dispatch
--    non-null pilote une génération PAR JOUR scopée aux groupes du jour
--    (cf item 4 du chantier).
-- ============================================================

ALTER TABLE contrats_residences
  ADD COLUMN IF NOT EXISTS jours_ramassage_containers TEXT[],
  ADD COLUMN IF NOT EXISTS dispatch_semaine JSONB;

COMMENT ON COLUMN contrats_residences.jours_ramassage_containers IS
  'Jours de collecte containers (agglo) saisis dans le wizard — pilote les règles R4 de dispatch (sortie=veille, rentrée=lendemain). NULL = résidence non concernée.';

COMMENT ON COLUMN contrats_residences.dispatch_semaine IS
  'Répartition semaine validée (bâtiments complets par jour, tournées transverses, containers) — un objet par jour de passage. NULL = pas de dispatch défini, /api/planning/generer garde le comportement actuel (rétrocompatibilité stricte).';
