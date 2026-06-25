-- ============================================================
-- Migration 016 — Données multi-contrats (migration en masse)
-- Prérequis : migration 015 exécutée (colonnes déjà présentes)
-- IDEMPOTENT : peut être relancé sans créer de doublons
-- ALTHEA (6537baf8-…) déjà migrée manuellement — garde-fous actifs
-- ============================================================


-- ── 2a : UPDATE contrats existants ──────────────────────────────────────────
-- Copie agent_prefere_id + qr_code_token depuis residences vers contrats_residences
-- Garde-fou : WHERE type_contrat IS NULL évite d'écraser ALTHEA déjà migrée

UPDATE contrats_residences c
SET
  agent_prefere_id = r.agent_prefere_id,
  qr_code_token    = r.qr_code_token::text,
  type_contrat     = 'parties_communes',
  libelle          = 'Contrat principal'
FROM residences r
WHERE c.residence_id = r.id
  AND c.type_contrat IS NULL;   -- garde-fou idempotence


-- ── 2b : INSERT contrats vides pour les 151 résidences sans contrat ─────────
-- Garde-fou : NOT EXISTS évite la création en double si déjà présent

INSERT INTO contrats_residences (
  residence_id,
  agent_prefere_id,
  qr_code_token,
  type_contrat,
  libelle,
  date_debut,
  date_fin,
  creneaux_acceptes,
  actif
)
SELECT
  r.id,
  r.agent_prefere_id,
  r.qr_code_token::text,
  'parties_communes',
  'Contrat principal',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '3 years',
  '[]'::jsonb,
  false   -- inactif : pas de vrai contrat configuré
FROM residences r
WHERE NOT EXISTS (
  SELECT 1 FROM contrats_residences c WHERE c.residence_id = r.id
);


-- ── 2c : Rattacher toutes les zones à leur contrat ───────────────────────────
-- Jointure via residence_id (pas d'ID en dur)
-- Garde-fou : WHERE contrat_id IS NULL évite de re-rattacher ALTHEA

UPDATE zones_residence z
SET contrat_id = c.id
FROM contrats_residences c
WHERE c.residence_id = z.residence_id
  AND z.contrat_id IS NULL;     -- garde-fou idempotence


-- ── VÉRIFICATION FINALE ───────────────────────────────────────────────────────
-- Lancer après la migration pour valider le résultat

SELECT
  (SELECT COUNT(*) FROM residences)                                     AS nb_residences,
  (SELECT COUNT(*) FROM contrats_residences)                            AS nb_contrats_total,
  (SELECT COUNT(*) FROM contrats_residences WHERE actif = true)         AS nb_contrats_actifs,
  (SELECT COUNT(*) FROM contrats_residences WHERE actif = false)        AS nb_contrats_inactifs,
  (SELECT COUNT(*) FROM contrats_residences WHERE type_contrat IS NULL) AS contrats_sans_type,
  (SELECT COUNT(*) FROM zones_residence)                                AS nb_zones_total,
  (SELECT COUNT(*) FROM zones_residence WHERE contrat_id IS NOT NULL)   AS zones_rattachees,
  (SELECT COUNT(*) FROM zones_residence WHERE contrat_id IS NULL)       AS zones_orphelines,
  (SELECT COUNT(*) FROM residences r
   WHERE NOT EXISTS (
     SELECT 1 FROM contrats_residences c WHERE c.residence_id = r.id
   ))                                                                   AS residences_sans_contrat;

-- Résultats attendus :
-- nb_residences              = 162
-- nb_contrats_total          = 162  (11 existants + 151 créés)
-- nb_contrats_actifs         = 11
-- nb_contrats_inactifs       = 151
-- contrats_sans_type         = 0
-- nb_zones_total             = 22
-- zones_rattachees           = 22
-- zones_orphelines           = 0
-- residences_sans_contrat    = 0
