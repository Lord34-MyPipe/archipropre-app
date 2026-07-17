-- ============================================================
-- Migration 028 — Niveau Bâtiment (ÉTAPE 8b-4 : RPC planifier_interventions)
-- ============================================================
-- CREATE OR REPLACE additif — signature strictement identique
-- (p_residence_id, p_contrat_id, p_lignes). Deux changements uniquement :
--   a) batiment ajouté à l'INSERT + extraction (ligne->>'batiment') au SELECT.
--   b) DELETE : CURRENT_DATE (fuseau de session Supabase, UTC) remplacé par
--      (now() AT TIME ZONE 'Europe/Paris')::date, cohérent avec le "today"
--      calculé côté route.ts depuis le fix précédent (commit "fix: date de
--      génération planning en Europe/Paris (bug décalage UTC)").
-- Le reste (DELETE scope residence_id + contrat_id + statut='planifiee',
-- colonnes existantes, transaction atomique DELETE+INSERT) est INCHANGÉ.
--
-- ROLLBACK — pour revenir à la version précédente (avant 8b-4), ré-appliquer
-- ce CREATE OR REPLACE avec la définition suivante (sans batiment, sans le
-- fix de fuseau) :
--
--   CREATE OR REPLACE FUNCTION public.planifier_interventions(p_residence_id uuid, p_contrat_id uuid, p_lignes jsonb)
--    RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
--   AS $function$
--   DECLARE
--     v_count INTEGER;
--   BEGIN
--     DELETE FROM interventions
--     WHERE residence_id = p_residence_id AND contrat_id = p_contrat_id
--       AND date_prevue >= CURRENT_DATE AND statut = 'planifiee';
--
--     INSERT INTO interventions (
--       agent_id, residence_id, contrat_id, date_prevue,
--       heure_debut_prevue, heure_fin_prevue, statut
--     )
--     SELECT
--       (ligne->>'agent_id')::uuid, (ligne->>'residence_id')::uuid, (ligne->>'contrat_id')::uuid,
--       (ligne->>'date_prevue')::date, (ligne->>'heure_debut_prevue')::time,
--       (ligne->>'heure_fin_prevue')::time, ligne->>'statut'
--     FROM jsonb_array_elements(p_lignes) AS ligne;
--
--     GET DIAGNOSTICS v_count = ROW_COUNT;
--     RETURN v_count;
--   END;
--   $function$;
-- ============================================================

CREATE OR REPLACE FUNCTION public.planifier_interventions(p_residence_id uuid, p_contrat_id uuid, p_lignes jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  -- Supprime uniquement les interventions planifiées (pas démarrées) de CE contrat
  -- Préserve les autres contrats de la même résidence
  DELETE FROM interventions
  WHERE residence_id = p_residence_id
    AND contrat_id   = p_contrat_id
    AND date_prevue  >= (now() AT TIME ZONE 'Europe/Paris')::date
    AND statut       = 'planifiee';

  INSERT INTO interventions (
    agent_id, residence_id, contrat_id, date_prevue,
    heure_debut_prevue, heure_fin_prevue, statut, batiment
  )
  SELECT
    (ligne->>'agent_id')::uuid,
    (ligne->>'residence_id')::uuid,
    (ligne->>'contrat_id')::uuid,
    (ligne->>'date_prevue')::date,
    (ligne->>'heure_debut_prevue')::time,
    (ligne->>'heure_fin_prevue')::time,
    ligne->>'statut',
    ligne->>'batiment'
  FROM jsonb_array_elements(p_lignes) AS ligne;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
