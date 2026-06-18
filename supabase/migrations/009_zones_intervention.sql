-- Horodatage de clôture par zone (temps calculé automatiquement, pas saisi manuellement)
-- heure_cloture est renseignée quand toutes les tâches de la zone sont traitées + ≥1 photo
CREATE TABLE zones_intervention (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id uuid NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  zone_nom        text NOT NULL,
  heure_cloture   timestamptz,
  UNIQUE(intervention_id, zone_nom)
);

ALTER TABLE zones_intervention ENABLE ROW LEVEL SECURITY;

-- SELECT : agent (ses interventions), manager (ses agents), directeur (toutes)
CREATE POLICY zones_intervention_select ON zones_intervention FOR SELECT USING (
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

-- INSERT : agent (ses interventions), manager, directeur
CREATE POLICY zones_intervention_insert ON zones_intervention FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_id
    AND (
      i.agent_id = auth.uid()
      OR current_role_is('manager')
      OR current_role_is('directeur')
    )
  )
);

-- UPDATE : agent (ses interventions), manager, directeur
-- Nécessaire pour l'upsert (heure_cloture mise à jour si zone réouverte puis reclôturée)
CREATE POLICY zones_intervention_update ON zones_intervention FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_id
    AND (
      i.agent_id = auth.uid()
      OR current_role_is('manager')
      OR current_role_is('directeur')
    )
  )
);

-- DELETE : agent (ses interventions), manager (ses agents), directeur
CREATE POLICY zones_intervention_delete ON zones_intervention FOR DELETE USING (
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
