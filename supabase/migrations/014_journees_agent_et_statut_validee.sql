-- 1. Ajouter statut 'validee' à interventions
ALTER TABLE interventions DROP CONSTRAINT interventions_statut_check;
ALTER TABLE interventions ADD CONSTRAINT interventions_statut_check
  CHECK (statut = ANY (ARRAY[
    'planifiee','en_cours','terminee','non_demarree','disponible','annulee','validee'
  ]));

-- 2. Ajouter colonnes validee_par / validee_at à interventions
ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS validee_par UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS validee_at  TIMESTAMPTZ;

-- 3. Corriger v_conflits_planning pour exclure 'validee' comme 'terminee'
CREATE OR REPLACE VIEW v_conflits_planning AS
 SELECT i1.id AS intervention_1_id,
    i2.id AS intervention_2_id,
    i1.agent_id,
    ((p.prenom || ' '::text) || p.nom) AS nom_agent,
    i1.date_prevue,
    i1.residence_id AS residence_1_id,
    r1.nom AS residence_1_nom,
    i1.heure_debut_prevue AS debut_1,
    i1.heure_fin_prevue AS fin_1,
    i2.residence_id AS residence_2_id,
    r2.nom AS residence_2_nom,
    i2.heure_debut_prevue AS debut_2,
    i2.heure_fin_prevue AS fin_2,
    round((EXTRACT(epoch FROM (LEAST(i1.heure_fin_prevue, i2.heure_fin_prevue) - GREATEST(i1.heure_debut_prevue, i2.heure_debut_prevue))) / (60)::numeric)) AS duree_chevauchement_min
   FROM ((((interventions i1
     JOIN interventions i2 ON (((i1.agent_id = i2.agent_id) AND (i1.date_prevue = i2.date_prevue) AND (i1.id < i2.id))))
     JOIN profiles p ON ((p.id = i1.agent_id)))
     JOIN residences r1 ON ((r1.id = i1.residence_id)))
     JOIN residences r2 ON ((r2.id = i2.residence_id)))
  WHERE ((i1.statut <> ALL (ARRAY['terminee'::text, 'annulee'::text, 'validee'::text])) AND (i2.statut <> ALL (ARRAY['terminee'::text, 'annulee'::text, 'validee'::text])) AND (i1.heure_debut_prevue < i2.heure_fin_prevue) AND (i2.heure_debut_prevue < i1.heure_fin_prevue));

-- 4. Table journees_agent
CREATE TABLE IF NOT EXISTS journees_agent (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date             DATE        NOT NULL,
  total_minutes_terrain  INTEGER,
  total_minutes_trajets  INTEGER,
  notes            TEXT,
  validee_par      UUID        REFERENCES profiles(id),
  validee_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, date)
);

ALTER TABLE journees_agent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager_journees" ON journees_agent
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = agent_id AND p.manager_id = auth.uid()
    )
  );
