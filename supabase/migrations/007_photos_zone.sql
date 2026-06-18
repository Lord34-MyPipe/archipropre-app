-- Photos par zone d'intervention (une ou plusieurs photos par zone, pas par tâche)
-- photo_url stocke le chemin de stockage (pas une URL complète) :
--   photos-interventions/{intervention_id}/{zone_nom}/{timestamp}.{ext}
CREATE TABLE photos_zone (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id uuid NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  zone_nom        text NOT NULL,
  photo_url       text NOT NULL,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE photos_zone ENABLE ROW LEVEL SECURITY;

-- SELECT : agent (ses propres interventions), manager (ses agents), directeur (toutes)
CREATE POLICY photos_zone_select ON photos_zone FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_id
    AND (
      i.agent_id = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = i.agent_id AND p.manager_id = auth.uid())
      OR current_role_is('directeur')
    )
  )
);

-- INSERT : agent (ses propres interventions), manager, directeur
CREATE POLICY photos_zone_insert ON photos_zone FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_id
    AND (i.agent_id = auth.uid() OR current_role_is('manager') OR current_role_is('directeur'))
  )
);

-- DELETE : agent (ses propres), manager (ses agents), directeur
CREATE POLICY photos_zone_delete ON photos_zone FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_id
    AND (
      i.agent_id = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = i.agent_id AND p.manager_id = auth.uid())
      OR current_role_is('directeur')
    )
  )
);
