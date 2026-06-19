-- Migration 011 : taux de facturation client pour le calcul de la durée contractuelle
-- Étape 1/3 — socle données uniquement, pas d'UI

-- ── 1. Taux spécifique par contrat ──────────────────────────────────────────
-- NULL volontaire : signifie "utiliser le taux Base global de parametres_societe"
ALTER TABLE contrats_residences
  ADD COLUMN IF NOT EXISTS taux_horaire_facturation NUMERIC(6,2);

COMMENT ON COLUMN contrats_residences.taux_horaire_facturation IS
  'Taux horaire de facturation client (€/h) spécifique à ce contrat. NULL = appliquer taux_horaire_facturation_defaut de parametres_societe.';

-- ── 2. Taux Base global dans parametres_societe ─────────────────────────────
-- Cohérent avec taux_horaire_agent et cout_km déjà présents dans cette table.
-- 25.00 €/h = valeur de départ raisonnable (modifiable depuis la page paramètres directeur).
ALTER TABLE parametres_societe
  ADD COLUMN IF NOT EXISTS taux_horaire_facturation_defaut NUMERIC(6,2) NOT NULL DEFAULT 25.00;

COMMENT ON COLUMN parametres_societe.taux_horaire_facturation_defaut IS
  'Taux horaire de facturation client par défaut (€/h), appliqué quand contrats_residences.taux_horaire_facturation est NULL.';
