-- Refonte étape 3 "Répartition" — top-down (21/07/2026), sous-étape 2/5.
-- creer_contrat_complet accepte désormais semaine_du_mois / mois_de_annee sur
-- chaque tâche de p_structure (colonnes déjà existantes de taches_template,
-- migration 001) — CREATE OR REPLACE additif, même signature, rétrocompatible :
-- une tâche sans ces clés (ancien format) reçoit NULL comme avant.
--
-- Ancienne définition (migration 031, pour rollback) :
--
-- CREATE OR REPLACE FUNCTION public.creer_contrat_complet(p_residence_id uuid, p_contrat jsonb, p_structure jsonb)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_contrat_id uuid;
--   v_batiment   jsonb;
--   v_zone       jsonb;
--   v_tache      jsonb;
--   v_zone_id    uuid;
--   v_nb_zones   integer := 0;
--   v_nb_taches  integer := 0;
-- BEGIN
--   INSERT INTO contrats_residences (
--     residence_id, libelle, type_contrat, date_debut, date_fin,
--     montant_mensuel, nb_interventions_mois, taux_horaire_facturation, agent_prefere_id,
--     creneaux_acceptes, jours_interdits, notes_specifiques,
--     minutes_hebdo_reelles, ecart_rentable_minutes, actif
--   ) VALUES (
--     p_residence_id, p_contrat->>'libelle', (p_contrat->>'type_contrat')::type_contrat_enum,
--     (p_contrat->>'date_debut')::date, (p_contrat->>'date_fin')::date,
--     (p_contrat->>'montant_mensuel')::numeric, NULLIF(p_contrat->>'nb_interventions_mois', '')::integer,
--     NULLIF(p_contrat->>'taux_horaire_facturation', '')::numeric, NULLIF(p_contrat->>'agent_prefere_id', '')::uuid,
--     COALESCE(p_contrat->'creneaux_acceptes', '[]'::jsonb),
--     COALESCE((SELECT array_agg(j) FROM jsonb_array_elements_text(COALESCE(p_contrat->'jours_interdits', '[]'::jsonb)) j), '{}'::text[]),
--     NULLIF(p_contrat->>'notes_specifiques', ''), (p_contrat->>'minutes_hebdo_reelles')::integer,
--     (p_contrat->>'ecart_rentable_minutes')::integer, true
--   ) RETURNING id INTO v_contrat_id;
--   FOR v_batiment IN SELECT * FROM jsonb_array_elements(COALESCE(p_structure->'batiments', '[]'::jsonb)) LOOP
--     FOR v_zone IN SELECT * FROM jsonb_array_elements(COALESCE(v_batiment->'zones', '[]'::jsonb)) LOOP
--       INSERT INTO zones_residence (residence_id, contrat_id, nom, batiment, coef_duree, ordre)
--       VALUES (p_residence_id, v_contrat_id, v_zone->>'nom', NULLIF(v_batiment->>'nom', ''), 1, v_nb_zones)
--       RETURNING id INTO v_zone_id;
--       v_nb_zones := v_nb_zones + 1;
--       FOR v_tache IN SELECT * FROM jsonb_array_elements(COALESCE(v_zone->'taches', '[]'::jsonb)) LOOP
--         INSERT INTO taches_template (residence_id, zone_id, libelle, frequence_type, jours_semaine, duree_minutes, ordre)
--         VALUES (
--           p_residence_id, v_zone_id, v_tache->>'libelle', COALESCE(v_tache->>'frequence_type', 'hebdo'),
--           COALESCE((SELECT array_agg(j) FROM jsonb_array_elements_text(COALESCE(v_tache->'jours_semaine', '[]'::jsonb)) j), '{}'::text[]),
--           COALESCE((v_tache->>'duree_minutes')::integer, 0), v_nb_taches
--         );
--         v_nb_taches := v_nb_taches + 1;
--       END LOOP;
--     END LOOP;
--   END LOOP;
--   IF v_nb_zones = 0 THEN RAISE EXCEPTION 'Aucune zone fournie — au moins une zone est requise pour créer le contrat.'; END IF;
--   RETURN jsonb_build_object('contrat_id', v_contrat_id, 'nb_zones', v_nb_zones, 'nb_taches', v_nb_taches);
-- END;
-- $function$

CREATE OR REPLACE FUNCTION public.creer_contrat_complet(p_residence_id uuid, p_contrat jsonb, p_structure jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
        -- semaine_du_mois / mois_de_annee (refonte top-down, 21/07) : positionnement
        -- des tâches basse fréquence. Absent ou JSON null → NULL (comportement
        -- identique à avant pour une tâche hebdo classique).
        INSERT INTO taches_template (
          residence_id, zone_id, libelle, frequence_type, jours_semaine, duree_minutes,
          semaine_du_mois, mois_de_annee, ordre
        )
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
          CASE WHEN v_tache->'semaine_du_mois' IS NULL OR v_tache->'semaine_du_mois' = 'null'::jsonb THEN NULL
               ELSE (SELECT array_agg(x::int) FROM jsonb_array_elements_text(v_tache->'semaine_du_mois') x)
          END,
          CASE WHEN v_tache->'mois_de_annee' IS NULL OR v_tache->'mois_de_annee' = 'null'::jsonb THEN NULL
               ELSE (SELECT array_agg(x::int) FROM jsonb_array_elements_text(v_tache->'mois_de_annee') x)
          END,
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
$function$
