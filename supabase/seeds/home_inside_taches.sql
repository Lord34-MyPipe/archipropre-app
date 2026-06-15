-- Seed : zones et tâches template pour Home Inside
-- Résidence ID : 30d96500-6612-464a-97cc-8abcd8af3540

DO $$
DECLARE
  v_res_id  UUID := '30d96500-6612-464a-97cc-8abcd8af3540';
  v_bat_a   UUID;
  v_asc     UUID;
  v_bat_b   UUID;
  v_sas     UUID;
  v_ext     UUID;
  v_park    UUID;
  v_serv    UUID;
  v_loc_cnt UUID;
  v_cnt     UUID;
  v_sortie  UUID;
BEGIN
  -- Vérification résidence
  IF NOT EXISTS (SELECT 1 FROM residences WHERE id = v_res_id) THEN
    RAISE NOTICE 'Résidence Home Inside introuvable (id: %).', v_res_id;
    RETURN;
  END IF;

  -- ────────────────────────────────────────────────
  -- ZONE 1 — Bâtiment A
  -- ────────────────────────────────────────────────
  INSERT INTO zones_residence (residence_id, nom, ordre)
    VALUES (v_res_id, 'Bâtiment A', 1) RETURNING id INTO v_bat_a;

  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur, jours_semaine, semaine_du_mois, mois_de_annee, ordre)
  VALUES
    (v_res_id, v_bat_a, 'Aspiration et lavage humide des sols',         'hebdo', 1, ARRAY['lundi'], NULL, NULL, 1),
    (v_res_id, v_bat_a, 'Aspiration des tapis du hall et sous le tapis', 'hebdo', 1, ARRAY['lundi'], NULL, NULL, 2),
    (v_res_id, v_bat_a, 'Dépoussiérage tableaux affichage et plinthes',  'hebdo', 1, ARRAY['lundi'], NULL, NULL, 3),
    (v_res_id, v_bat_a, 'Enlèvement des toiles d''araignées',            'hebdo', 1, ARRAY['lundi'], NULL, NULL, 4),
    (v_res_id, v_bat_a, 'Nettoyage portes vitrées et encadrements',      'hebdo', 1, ARRAY['lundi'], NULL, NULL, 5),
    (v_res_id, v_bat_a, 'Désinfection des platines',                     'hebdo', 1, ARRAY['lundi'], NULL, NULL, 6),
    (v_res_id, v_bat_a, 'Aspiration et lavage escaliers et rampes',      'hebdo', 1, ARRAY['lundi'], NULL, NULL, 7),
    (v_res_id, v_bat_a, 'Hall bâtiment B',                               'hebdo', 1, ARRAY['lundi'], NULL, NULL, 8),
    (v_res_id, v_bat_a, 'Nettoyage int/ext portes placards halls',        'trimestriel', 4, ARRAY['lundi'], ARRAY[1], ARRAY[1,4,7,10], 9),
    (v_res_id, v_bat_a, 'Dépoussiérage luminaires escaliers',            'mensuel',      1, ARRAY['lundi'], ARRAY[1], NULL, 10);

  -- ────────────────────────────────────────────────
  -- ZONE 2 — Ascenseurs
  -- ────────────────────────────────────────────────
  INSERT INTO zones_residence (residence_id, nom, ordre)
    VALUES (v_res_id, 'Ascenseurs', 2) RETURNING id INTO v_asc;

  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur, jours_semaine, ordre)
  VALUES
    (v_res_id, v_asc, 'Nettoyage rails, parois et portes',              'hebdo', 1, ARRAY['lundi','mercredi'], 1),
    (v_res_id, v_asc, 'Aspiration rainures portes ascenseurs',          'hebdo', 1, ARRAY['lundi','mercredi'], 2),
    (v_res_id, v_asc, 'Essuyage boutons de commande',                   'hebdo', 1, ARRAY['lundi','mercredi'], 3),
    (v_res_id, v_asc, 'Essuyage traces doigts parois et miroirs',       'hebdo', 1, ARRAY['lundi','mercredi'], 4),
    (v_res_id, v_asc, 'Lavage parois et miroirs cabine',                'hebdo', 1, ARRAY['lundi','mercredi'], 5);

  -- ────────────────────────────────────────────────
  -- ZONE 3 — Bâtiment B
  -- ────────────────────────────────────────────────
  INSERT INTO zones_residence (residence_id, nom, ordre)
    VALUES (v_res_id, 'Bâtiment B', 3) RETURNING id INTO v_bat_b;

  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur, jours_semaine, semaine_du_mois, mois_de_annee, ordre)
  VALUES
    (v_res_id, v_bat_b, 'Aspiration et lavage humide des sols',         'hebdo', 1, ARRAY['mercredi'], NULL, NULL, 1),
    (v_res_id, v_bat_b, 'Aspiration des tapis du hall et sous le tapis', 'hebdo', 1, ARRAY['mercredi'], NULL, NULL, 2),
    (v_res_id, v_bat_b, 'Dépoussiérage tableaux affichage et plinthes',  'hebdo', 1, ARRAY['mercredi'], NULL, NULL, 3),
    (v_res_id, v_bat_b, 'Enlèvement des toiles d''araignées',            'hebdo', 1, ARRAY['mercredi'], NULL, NULL, 4),
    (v_res_id, v_bat_b, 'Nettoyage portes vitrées et encadrements',      'hebdo', 1, ARRAY['mercredi'], NULL, NULL, 5),
    (v_res_id, v_bat_b, 'Désinfection des platines',                     'hebdo', 1, ARRAY['mercredi'], NULL, NULL, 6),
    (v_res_id, v_bat_b, 'Nettoyage int/ext portes placards halls',        'trimestriel', 4, ARRAY['mercredi'], ARRAY[1], ARRAY[1,4,7,10], 7),
    (v_res_id, v_bat_b, 'Aspiration et lavage escaliers et rampes',      'hebdo', 1, ARRAY['mercredi'], NULL, NULL, 8),
    (v_res_id, v_bat_b, 'Dépoussiérage luminaires escaliers',            'mensuel', 1, ARRAY['mercredi'], ARRAY[1], NULL, 9),
    (v_res_id, v_bat_b, 'Hall bâtiment A',                               'hebdo', 1, ARRAY['mercredi'], NULL, NULL, 10);

  -- ────────────────────────────────────────────────
  -- ZONE 4 — SAS Sécurité Sous-sols
  -- ────────────────────────────────────────────────
  INSERT INTO zones_residence (residence_id, nom, ordre)
    VALUES (v_res_id, 'SAS Sécurité Sous-sols', 4) RETURNING id INTO v_sas;

  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur, jours_semaine, semaine_du_mois, ordre)
  VALUES
    (v_res_id, v_sas, 'Aspiration et lavage des SAS',         'mensuel', 1, ARRAY['lundi'], ARRAY[1], 1),
    (v_res_id, v_sas, 'Enlèvement des toiles d''araignées',   'mensuel', 1, ARRAY['lundi'], ARRAY[1], 2),
    (v_res_id, v_sas, 'Dépoussiérage luminaires dans escaliers','mensuel',1, ARRAY['lundi'], ARRAY[1], 3),
    (v_res_id, v_sas, 'Dépoussiérage des luminaires',          'mensuel', 1, ARRAY['lundi'], ARRAY[1], 4);

  -- ────────────────────────────────────────────────
  -- ZONE 5 — Extérieurs
  -- ────────────────────────────────────────────────
  INSERT INTO zones_residence (residence_id, nom, ordre)
    VALUES (v_res_id, 'Extérieurs', 5) RETURNING id INTO v_ext;

  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur, jours_semaine, semaine_du_mois, mois_de_annee, ordre)
  VALUES
    (v_res_id, v_ext, 'Ramassage détritus et déchets abords',         'hebdo',      1, ARRAY['mercredi'], NULL,    NULL,    1),
    (v_res_id, v_ext, 'Désinfection platine interphone extérieur',     'hebdo',      1, ARRAY['mercredi'], NULL,    NULL,    2),
    (v_res_id, v_ext, 'Nettoyage caniveaux à grille',                  'mensuel',    1, ARRAY['lundi'],    ARRAY[1],NULL,    3),
    (v_res_id, v_ext, 'Balayage accès parking sous-terrain',           'mensuel',    1, ARRAY['lundi'],    ARRAY[1],NULL,    4),
    (v_res_id, v_ext, 'Dépoussiérage des BAL',                         'mensuel',    1, ARRAY['lundi'],    ARRAY[1],NULL,    5),
    (v_res_id, v_ext, 'Arrachage mauvaises herbes trottoirs',          'semestriel', 2, ARRAY['lundi'],    ARRAY[1],ARRAY[3,9], 6);

  -- ────────────────────────────────────────────────
  -- ZONE 6 — Parkings
  -- ────────────────────────────────────────────────
  INSERT INTO zones_residence (residence_id, nom, ordre)
    VALUES (v_res_id, 'Parkings', 6) RETURNING id INTO v_park;

  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur, jours_semaine, semaine_du_mois, ordre)
  VALUES
    (v_res_id, v_park, 'Ramassage des détritus',          'mensuel', 1, ARRAY['lundi'], ARRAY[1], 1),
    (v_res_id, v_park, 'Balayage allées de circulation',  'mensuel', 1, ARRAY['lundi'], ARRAY[1], 2);

  -- ────────────────────────────────────────────────
  -- ZONE 7 — Servitude de passage
  -- ────────────────────────────────────────────────
  INSERT INTO zones_residence (residence_id, nom, ordre)
    VALUES (v_res_id, 'Servitude de passage', 7) RETURNING id INTO v_serv;

  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur, jours_semaine, semaine_du_mois, ordre)
  VALUES
    (v_res_id, v_serv, 'Ramassage détritus et papiers',    'mensuel', 1, ARRAY['lundi'], ARRAY[1], 1),
    (v_res_id, v_serv, 'Balayage allées de circulation',   'mensuel', 1, ARRAY['lundi'], ARRAY[1], 2),
    (v_res_id, v_serv, 'Dépoussiérage luminaires',         'mensuel', 1, ARRAY['lundi'], ARRAY[1], 3);

  -- ────────────────────────────────────────────────
  -- ZONE 8 — Locaux Containers
  -- ────────────────────────────────────────────────
  INSERT INTO zones_residence (residence_id, nom, ordre)
    VALUES (v_res_id, 'Locaux Containers', 8) RETURNING id INTO v_loc_cnt;

  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur, jours_semaine, semaine_du_mois, ordre)
  VALUES
    (v_res_id, v_loc_cnt, 'Lavage et désinfection des locaux',        'mensuel', 1, ARRAY['lundi'], ARRAY[1], 1),
    (v_res_id, v_loc_cnt, 'Lavage et désinfection des containers',    'mensuel', 1, ARRAY['lundi'], ARRAY[1], 2),
    (v_res_id, v_loc_cnt, 'Enlèvement des toiles d''araignées',       'mensuel', 1, ARRAY['lundi'], ARRAY[1], 3),
    (v_res_id, v_loc_cnt, 'Désinfection portes et poignées',          'mensuel', 1, ARRAY['lundi'], ARRAY[1], 4);

  -- ────────────────────────────────────────────────
  -- ZONE 9 — Containers
  -- ────────────────────────────────────────────────
  INSERT INTO zones_residence (residence_id, nom, ordre)
    VALUES (v_res_id, 'Containers', 9) RETURNING id INTO v_cnt;

  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur, jours_semaine, ordre)
  VALUES
    (v_res_id, v_cnt, 'Sortie containers gris et jaune', 'hebdo', 1,
      ARRAY['lundi','mardi','mercredi','jeudi','vendredi','samedi'], 1);

  -- Tâche avec contrainte horaire
  INSERT INTO taches_template
    (residence_id, zone_id, libelle, frequence_type, frequence_valeur,
     jours_semaine, heure_debut, heure_fin, contrainte_externe, ordre)
  VALUES
    (v_res_id, v_cnt,
     'Sortie encombrants dans la rue',
     'contrainte_horaire', 1,
     ARRAY['mardi'], '18:00', '20:00',
     'Selon passage collecte mairie', 2);

  RAISE NOTICE 'Seed Home Inside : 9 zones et tâches insérées avec succès.';
END $$;
