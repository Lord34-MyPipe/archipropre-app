-- ============================================================
-- Migration 030 — Taux horaire cible (pilotage d'écart, hors facturation)
-- ============================================================
-- Ajout ADDITIF d'un taux commercial de référence sur parametres_societe,
-- utilisé uniquement pour calculer un indicateur d'écart (vendu réel vs
-- vendu au taux cible). Ne touche JAMAIS à la facturation ni à la
-- rentabilité existantes (taux_horaire_facturation_defaut, contrats_residences
-- .taux_horaire_facturation restent la seule source de vérité facturation).
--
-- Type NUMERIC(6,2), aligné sur les colonnes taux existantes
-- (parametres_societe.taux_horaire_facturation_defaut,
-- contrats_residences.taux_horaire_facturation — vérifié via
-- information_schema.columns avant cette migration).
--
-- NOT NULL DEFAULT 30 : toute ligne existante (une seule ligne en pratique
-- sur parametres_societe) reçoit 30 automatiquement. Aucune donnée
-- métier modifiée.
-- ============================================================

ALTER TABLE parametres_societe
  ADD COLUMN IF NOT EXISTS taux_horaire_cible NUMERIC(6,2) NOT NULL DEFAULT 30;

COMMENT ON COLUMN parametres_societe.taux_horaire_cible IS
  'Taux horaire commercial cible (€ HT/h) — sert uniquement aux indicateurs d''écart affichés (GestionContratModal, AnalyseContratWizard). Jamais utilisé pour la facturation ou la rentabilité.';
