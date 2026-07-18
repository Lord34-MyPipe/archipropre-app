-- ============================================================
-- Migration 031 — Écart rentable sur contrat + RPC création complète
-- (chantier "Analyse contrat", lot 2 révisé)
-- ============================================================
-- Deux objets additifs, aucune donnée existante modifiée.
--
-- a) minutes_hebdo_reelles / ecart_rentable_minutes sur contrats_residences.
--    Type INTEGER : cohérent avec les colonnes durée existantes du schéma
--    (zones_residence.duree_minutes, taches_template.duree_minutes sont déjà
--    en integer — vérifié via information_schema.columns avant écriture).
--    - minutes_hebdo_reelles : temps hebdomadaire de l'organisation actuelle
--      saisie dans le wizard (jours × durée par passage). NULL = non renseigné
--      (contrats créés avant ce chantier, ou via l'ancien flux manuel).
--    - ecart_rentable_minutes : minutes_hebdo_reelles − plafond rentable
--      (montant_mensuel ÷ parametres_societe.taux_horaire_cible, ramené à la
--      semaine). Positif = dépassement du plafond rentable. Calculé et stocké
--      côté serveur à la création (jamais recalculé à la volée pour l'instant),
--      pour permettre une future vue globale des contrats en dépassement.
--
-- b) RPC creer_contrat_complet(p_residence_id, p_contrat, p_structure).
--    Transaction unique : INSERT contrat + zones + tâches. Toute erreur
--    (RAISE EXCEPTION) annule l'intégralité de l'appel — une fonction
--    plpgsql est atomique dans la transaction appelante, pas de BEGIN/ROLLBACK
--    explicite nécessaire (même principe que planifier_interventions,
--    migration 028).
--
--    p_contrat (jsonb) — clés attendues :
--      libelle, type_contrat, date_debut, date_fin, montant_mensuel,
--      taux_horaire_facturation (nullable), agent_prefere_id (nullable),
--      nb_interventions_mois (nullable — aligné avec les modals existants,
--      non lu par la génération de planning, cf audit lot 0), creneaux_acceptes
--      (jsonb, tel quel), jours_interdits (array texte, optionnel),
--      notes_specifiques (nullable), minutes_hebdo_reelles,
--      ecart_rentable_minutes (déjà calculés par l'appelant — la route
--      revalide ecart_rentable_minutes côté serveur avant l'appel, cf item 3).
--
--    p_structure (jsonb) — arbre bâtiments → zones → tâches, même forme que
--    AnalyseIA (lot 1) : { "batiments": [ { "nom", "zones": [ { "nom",
--    "taches": [ { "libelle", "frequence_type", "jours_semaine": [...],
--    "duree_minutes" } ] } ] } ] }. Un "bâtiment" sans nom (résidence
--    mono-bâtiment) est accepté : nom NULL sur les zones (comportement
--    actuel inchangé, cf docs/CONCEPTION_BATIMENTS.md).
--
--    Retour : jsonb { "contrat_id", "nb_zones", "nb_taches" }.
--
--    qr_code_token du contrat : généré par le trigger existant
--    set_contrat_qr_token (BEFORE INSERT), non touché ici.
-- ============================================================

-- ── a) Colonnes écart rentable ────────────────────────────────────────────

ALTER TABLE contrats_residences
  ADD COLUMN IF NOT EXISTS minutes_hebdo_reelles INTEGER,
  ADD COLUMN IF NOT EXISTS ecart_rentable_minutes INTEGER;

COMMENT ON COLUMN contrats_residences.minutes_hebdo_reelles IS
  'Temps hebdomadaire (minutes) de l''organisation actuelle saisie dans le wizard (jours × durée des créneaux de passage). NULL = non renseigné.';

COMMENT ON COLUMN contrats_residences.ecart_rentable_minutes IS
  'minutes_hebdo_reelles − plafond rentable (montant_mensuel ÷ taux_horaire_cible, ramené à la semaine). Positif = dépassement du plafond rentable. Calculé et figé côté serveur à la création du contrat.';

-- ── b) RPC creer_contrat_complet ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.creer_contrat_complet(
  p_residence_id uuid,
  p_contrat jsonb,
  p_structure jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_contrat_id uuid;
  v_batiment   jsonb;
  v_zone       jsonb;
  v_tache      jsonb;
  v_zone_id    uuid;
  v_nb_zones   integer := 0;
  v_nb_taches  integer := 0;
BEGIN
  -- 1. Contrat
  INSERT INTO contrats_residences (
    residence_id, libelle, type_contrat, date_debut, date_fin,
    montant_mensuel, nb_interventions_mois, taux_horaire_facturation, agent_prefere_id,
    creneaux_acceptes, jours_interdits, notes_specifiques,
    minutes_hebdo_reelles, ecart_rentable_minutes, actif
  ) VALUES (
    p_residence_id,
    p_contrat->>'libelle',
    (p_contrat->>'type_contrat')::type_contrat_enum,
    (p_contrat->>'date_debut')::date,
    (p_contrat->>'date_fin')::date,
    (p_contrat->>'montant_mensuel')::numeric,
    NULLIF(p_contrat->>'nb_interventions_mois', '')::integer,
    NULLIF(p_contrat->>'taux_horaire_facturation', '')::numeric,
    NULLIF(p_contrat->>'agent_prefere_id', '')::uuid,
    COALESCE(p_contrat->'creneaux_acceptes', '[]'::jsonb),
    COALESCE(
      (SELECT array_agg(j) FROM jsonb_array_elements_text(COALESCE(p_contrat->'jours_interdits', '[]'::jsonb)) j),
      '{}'::text[]
    ),
    NULLIF(p_contrat->>'notes_specifiques', ''),
    (p_contrat->>'minutes_hebdo_reelles')::integer,
    (p_contrat->>'ecart_rentable_minutes')::integer,
    true
  )
  RETURNING id INTO v_contrat_id;

  -- 2 & 3. Zones + tâches, dans l'ordre de l'arbre fourni
  FOR v_batiment IN SELECT * FROM jsonb_array_elements(COALESCE(p_structure->'batiments', '[]'::jsonb))
  LOOP
    FOR v_zone IN SELECT * FROM jsonb_array_elements(COALESCE(v_batiment->'zones', '[]'::jsonb))
    LOOP
      INSERT INTO zones_residence (residence_id, contrat_id, nom, batiment, coef_duree, ordre)
      VALUES (
        p_residence_id,
        v_contrat_id,
        v_zone->>'nom',
        NULLIF(v_batiment->>'nom', ''),
        1,
        v_nb_zones
      )
      RETURNING id INTO v_zone_id;
      v_nb_zones := v_nb_zones + 1;

      FOR v_tache IN SELECT * FROM jsonb_array_elements(COALESCE(v_zone->'taches', '[]'::jsonb))
      LOOP
        INSERT INTO taches_template (residence_id, zone_id, libelle, frequence_type, jours_semaine, duree_minutes, ordre)
        VALUES (
          p_residence_id,
          v_zone_id,
          v_tache->>'libelle',
          COALESCE(v_tache->>'frequence_type', 'hebdo'),
          COALESCE(
            (SELECT array_agg(j) FROM jsonb_array_elements_text(COALESCE(v_tache->'jours_semaine', '[]'::jsonb)) j),
            '{}'::text[]
          ),
          COALESCE((v_tache->>'duree_minutes')::integer, 0),
          v_nb_taches
        );
        v_nb_taches := v_nb_taches + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  IF v_nb_zones = 0 THEN
    RAISE EXCEPTION 'Aucune zone fournie — au moins une zone est requise pour créer le contrat.';
  END IF;

  RETURN jsonb_build_object('contrat_id', v_contrat_id, 'nb_zones', v_nb_zones, 'nb_taches', v_nb_taches);
END;
$function$;

-- PostgreSQL accorde EXECUTE à PUBLIC par défaut à la création d'une fonction
-- (donc à anon/authenticated via héritage) — inacceptable pour une fonction
-- SECURITY DEFINER qui écrit sans vérification d'ownership interne (celle-ci
-- est assurée côté route Next.js, pas ici). REVOKE explicite avant le GRANT
-- ciblé, pour que service_role reste seul appelant possible.
REVOKE EXECUTE ON FUNCTION public.creer_contrat_complet(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creer_contrat_complet(uuid, jsonb, jsonb) TO service_role;
