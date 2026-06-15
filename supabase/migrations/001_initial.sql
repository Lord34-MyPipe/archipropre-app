-- ================================================================
-- ARCHIPROPRE SERVICES — Migration initiale
-- ================================================================

-- ----------------------------------------------------------------
-- PROFILES (3 rôles : agent / manager / directeur)
-- ----------------------------------------------------------------
CREATE TABLE profiles (
  id                    UUID REFERENCES auth.users PRIMARY KEY,
  nom                   TEXT NOT NULL,
  prenom                TEXT NOT NULL,
  email                 TEXT NOT NULL,
  role                  TEXT CHECK (role IN ('agent','manager','directeur')) NOT NULL,
  vehicule              BOOLEAN DEFAULT false,
  telephone             TEXT,
  manager_id            UUID REFERENCES profiles(id),
  zones_geo             TEXT[]  DEFAULT '{}',
  competences           TEXT[]  DEFAULT '{}',
  contrat_heures_hebdo  INTEGER DEFAULT 35,
  residences_attitrees  UUID[]  DEFAULT '{}',
  residences_exclues    UUID[]  DEFAULT '{}',
  disponibilites        JSONB   DEFAULT '{}',
  adresse_domicile      TEXT,
  actif                 BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- RESIDENCES
-- ----------------------------------------------------------------
CREATE TABLE residences (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom                   TEXT NOT NULL,
  adresse               TEXT NOT NULL,
  lat                   FLOAT,
  lng                   FLOAT,
  qr_code_token         UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  type_client           TEXT CHECK (type_client IN (
                          'syndic','profession_liberale','societe',
                          'magasin','particulier'
                        )),
  client_exigeant       BOOLEAN DEFAULT false,
  agent_prefere_id      UUID REFERENCES profiles(id),
  agent_exclu_ids       UUID[] DEFAULT '{}',
  vehicule_requis       BOOLEAN DEFAULT false,
  competences_requises  TEXT[] DEFAULT '{}',
  manager_id            UUID REFERENCES profiles(id),
  actif                 BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- ZONES PAR RÉSIDENCE (Bât A, Ascenseurs, Extérieurs…)
-- ----------------------------------------------------------------
CREATE TABLE zones_residence (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  residence_id  UUID REFERENCES residences(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL,
  ordre         INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- TÂCHES TEMPLATE (avec fréquences multiples)
-- ----------------------------------------------------------------
CREATE TABLE taches_template (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  residence_id        UUID REFERENCES residences(id) ON DELETE CASCADE,
  zone_id             UUID REFERENCES zones_residence(id),
  libelle             TEXT NOT NULL,
  ordre               INTEGER DEFAULT 0,
  jours_semaine       TEXT[] DEFAULT '{}',
  frequence_type      TEXT CHECK (frequence_type IN (
                        'hebdo','jours_specifiques','mensuel','trimestriel',
                        'semestriel','annuel','sur_passage','contrainte_horaire'
                      )) DEFAULT 'hebdo',
  frequence_valeur    INTEGER DEFAULT 1,
  heure_debut         TIME,
  heure_fin           TIME,
  contrainte_externe  TEXT,
  tache_liee_id       UUID REFERENCES taches_template(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- CONTRATS RÉSIDENCES
-- ----------------------------------------------------------------
CREATE TABLE contrats_residences (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  residence_id            UUID REFERENCES residences(id) ON DELETE CASCADE,
  type_client             TEXT,
  date_debut              DATE NOT NULL,
  date_fin                DATE NOT NULL,
  montant_mensuel         DECIMAL(10,2),
  nb_interventions_mois   INTEGER DEFAULT 4,
  jours_obliges           TEXT[] DEFAULT '{}',
  jours_interdits         TEXT[] DEFAULT '{}',
  heure_debut_min         TIME,
  heure_fin_max           TIME,
  notes_specifiques       TEXT,
  actif                   BOOLEAN DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- PLANNINGS
-- ----------------------------------------------------------------
CREATE TABLE plannings (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  semaine     DATE NOT NULL,
  statut      TEXT CHECK (statut IN ('brouillon','publie')) DEFAULT 'brouillon',
  manager_id  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- INTERVENTIONS PLANIFIÉES
-- ----------------------------------------------------------------
CREATE TABLE interventions_planifiees (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  planning_id   UUID REFERENCES plannings(id) ON DELETE CASCADE,
  residence_id  UUID REFERENCES residences(id),
  agent_id      UUID REFERENCES profiles(id),
  date          DATE NOT NULL,
  heure_debut   TIME,
  heure_fin     TIME,
  recurrence    TEXT CHECK (recurrence IN (
                  'hebdo','bihebdo','mensuelle','ponctuelle'
                )) DEFAULT 'ponctuelle',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- INTERVENTIONS RÉELLES
-- ----------------------------------------------------------------
CREATE TABLE interventions (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id                UUID REFERENCES profiles(id) NOT NULL,
  residence_id            UUID REFERENCES residences(id) NOT NULL,
  date_prevue             DATE NOT NULL,
  heure_debut_prevue      TIME,
  heure_fin_prevue        TIME,
  heure_scan              TIMESTAMPTZ,
  heure_fin               TIMESTAMPTZ,
  statut                  TEXT CHECK (statut IN (
                            'planifiee','en_cours','terminee',
                            'non_demarree','disponible'
                          )) DEFAULT 'planifiee',
  geoloc_lat              FLOAT,
  geoloc_lng              FLOAT,
  disponible_apres_fin    BOOLEAN DEFAULT false,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- TÂCHES PAR INTERVENTION
-- ----------------------------------------------------------------
CREATE TABLE taches_intervention (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  intervention_id     UUID REFERENCES interventions(id) ON DELETE CASCADE,
  tache_template_id   UUID REFERENCES taches_template(id),
  libelle             TEXT NOT NULL,
  zone_nom            TEXT,
  validee             BOOLEAN DEFAULT false,
  photo_url           TEXT,
  heure_validation    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- ALERTES
-- ----------------------------------------------------------------
CREATE TABLE alertes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  intervention_id UUID REFERENCES interventions(id),
  type            TEXT DEFAULT 'retard_demarrage',
  message         TEXT,
  envoyee_at      TIMESTAMPTZ DEFAULT NOW(),
  lue             BOOLEAN DEFAULT false,
  destinataire_id UUID REFERENCES profiles(id)
);

-- ----------------------------------------------------------------
-- ABSENCES
-- ----------------------------------------------------------------
CREATE TABLE absences (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id    UUID REFERENCES profiles(id),
  date_debut  DATE NOT NULL,
  date_fin    DATE NOT NULL,
  motif       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- CONGÉS
-- ----------------------------------------------------------------
CREATE TABLE conges (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id    UUID REFERENCES profiles(id),
  date_debut  DATE NOT NULL,
  date_fin    DATE NOT NULL,
  valide      BOOLEAN DEFAULT false,
  valide_par  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- TOURNÉES
-- ----------------------------------------------------------------
CREATE TABLE tournees (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id                  UUID REFERENCES profiles(id),
  date                      DATE NOT NULL,
  statut                    TEXT DEFAULT 'en_cours',
  distance_totale_km        FLOAT,
  duree_trajet_totale_min   INTEGER,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- ÉTAPES TOURNÉES
-- ----------------------------------------------------------------
CREATE TABLE tournees_etapes (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tournee_id              UUID REFERENCES tournees(id) ON DELETE CASCADE,
  intervention_id         UUID REFERENCES interventions(id),
  ordre                   INTEGER NOT NULL,
  heure_arrivee_estimee   TIME,
  temps_trajet_min        INTEGER
);

-- ----------------------------------------------------------------
-- CACHE DISTANCES
-- ----------------------------------------------------------------
CREATE TABLE distances_cache (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  residence_a_id  UUID REFERENCES residences(id),
  residence_b_id  UUID REFERENCES residences(id),
  distance_km     FLOAT,
  duree_min       INTEGER,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- INDEX
-- ================================================================
CREATE INDEX idx_interventions_agent   ON interventions(agent_id);
CREATE INDEX idx_interventions_date    ON interventions(date_prevue);
CREATE INDEX idx_interventions_statut  ON interventions(statut);
CREATE INDEX idx_taches_intervention   ON taches_intervention(intervention_id);
CREATE INDEX idx_residences_token      ON residences(qr_code_token);
CREATE INDEX idx_profiles_manager      ON profiles(manager_id);
CREATE INDEX idx_alertes_destinataire  ON alertes(destinataire_id);
CREATE INDEX idx_alertes_lue           ON alertes(lue);
CREATE INDEX idx_plannings_semaine     ON plannings(semaine);
CREATE INDEX idx_ip_planning           ON interventions_planifiees(planning_id);
CREATE INDEX idx_ip_agent_date         ON interventions_planifiees(agent_id, date);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE residences              ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones_residence         ENABLE ROW LEVEL SECURITY;
ALTER TABLE taches_template         ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrats_residences     ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE taches_intervention     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE plannings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions_planifiees ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences                ENABLE ROW LEVEL SECURITY;
ALTER TABLE conges                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournees                ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournees_etapes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE distances_cache         ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- Fonction helper : rôle de l'utilisateur courant
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_role_is(r TEXT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = r
  );
$$;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_user_manager_id()
RETURNS UUID LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT manager_id FROM profiles WHERE id = auth.uid();
$$;

-- ================================================================
-- POLICIES
-- ================================================================

-- ── PROFILES ────────────────────────────────────────────────────
-- Agent : se voir lui-même
-- Manager : se voir + voir ses agents (manager_id = lui)
-- Directeur : tout voir
CREATE POLICY profiles_select ON profiles FOR SELECT USING (
  id = auth.uid()
  OR manager_id = auth.uid()
  OR current_role_is('directeur')
);

CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (
  current_role_is('directeur')
  OR current_role_is('manager')
);

CREATE POLICY profiles_update ON profiles FOR UPDATE USING (
  id = auth.uid()
  OR manager_id = auth.uid()
  OR current_role_is('directeur')
);

CREATE POLICY profiles_delete ON profiles FOR DELETE USING (
  current_role_is('directeur')
);

-- ── RESIDENCES ──────────────────────────────────────────────────
-- Lecture : tout utilisateur connecté (agent a besoin de voir la résidence lors du scan)
CREATE POLICY residences_read ON residences FOR SELECT USING (
  auth.uid() IS NOT NULL
);

-- Écriture : manager (ses résidences) + directeur (toutes)
CREATE POLICY residences_write ON residences FOR INSERT WITH CHECK (
  current_role_is('manager') OR current_role_is('directeur')
);
CREATE POLICY residences_update ON residences FOR UPDATE USING (
  manager_id = auth.uid() OR current_role_is('directeur')
);
CREATE POLICY residences_delete ON residences FOR DELETE USING (
  current_role_is('directeur')
);

-- ── ZONES RÉSIDENCE ─────────────────────────────────────────────
CREATE POLICY zones_read ON zones_residence FOR SELECT USING (
  auth.uid() IS NOT NULL
);
CREATE POLICY zones_write ON zones_residence FOR ALL USING (
  current_role_is('manager') OR current_role_is('directeur')
);

-- ── TÂCHES TEMPLATE ─────────────────────────────────────────────
CREATE POLICY taches_template_read ON taches_template FOR SELECT USING (
  auth.uid() IS NOT NULL
);
CREATE POLICY taches_template_write ON taches_template FOR ALL USING (
  current_role_is('manager') OR current_role_is('directeur')
);

-- ── CONTRATS RÉSIDENCES ─────────────────────────────────────────
CREATE POLICY contrats_policy ON contrats_residences FOR ALL USING (
  current_role_is('manager') OR current_role_is('directeur')
);

-- ── PLANNINGS ───────────────────────────────────────────────────
CREATE POLICY plannings_read ON plannings FOR SELECT USING (
  manager_id = auth.uid() OR current_role_is('directeur')
);
CREATE POLICY plannings_write ON plannings FOR ALL USING (
  manager_id = auth.uid() OR current_role_is('directeur')
);

-- ── INTERVENTIONS PLANIFIÉES ────────────────────────────────────
CREATE POLICY ip_read ON interventions_planifiees FOR SELECT USING (
  agent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM plannings p WHERE p.id = planning_id AND p.manager_id = auth.uid())
  OR current_role_is('directeur')
);
CREATE POLICY ip_write ON interventions_planifiees FOR ALL USING (
  EXISTS (SELECT 1 FROM plannings p WHERE p.id = planning_id AND p.manager_id = auth.uid())
  OR current_role_is('directeur')
);

-- ── INTERVENTIONS RÉELLES ───────────────────────────────────────
-- Agent : les siennes
-- Manager : celles de ses agents
-- Directeur : toutes
CREATE POLICY interventions_select ON interventions FOR SELECT USING (
  agent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = agent_id AND p.manager_id = auth.uid())
  OR current_role_is('directeur')
);
CREATE POLICY interventions_insert ON interventions FOR INSERT WITH CHECK (
  agent_id = auth.uid()
  OR current_role_is('manager')
  OR current_role_is('directeur')
);
CREATE POLICY interventions_update ON interventions FOR UPDATE USING (
  agent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = agent_id AND p.manager_id = auth.uid())
  OR current_role_is('directeur')
);
CREATE POLICY interventions_delete ON interventions FOR DELETE USING (
  current_role_is('manager') OR current_role_is('directeur')
);

-- ── TÂCHES INTERVENTION ─────────────────────────────────────────
CREATE POLICY taches_i_select ON taches_intervention FOR SELECT USING (
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
CREATE POLICY taches_i_insert ON taches_intervention FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM interventions i
    WHERE i.id = intervention_id
    AND (i.agent_id = auth.uid() OR current_role_is('manager') OR current_role_is('directeur'))
  )
);
CREATE POLICY taches_i_update ON taches_intervention FOR UPDATE USING (
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

-- ── ALERTES ─────────────────────────────────────────────────────
CREATE POLICY alertes_select ON alertes FOR SELECT USING (
  destinataire_id = auth.uid() OR current_role_is('directeur')
);
CREATE POLICY alertes_insert ON alertes FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);
CREATE POLICY alertes_update ON alertes FOR UPDATE USING (
  destinataire_id = auth.uid() OR current_role_is('directeur')
);

-- ── ABSENCES ────────────────────────────────────────────────────
CREATE POLICY absences_select ON absences FOR SELECT USING (
  agent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = agent_id AND p.manager_id = auth.uid())
  OR current_role_is('directeur')
);
CREATE POLICY absences_write ON absences FOR ALL USING (
  agent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = agent_id AND p.manager_id = auth.uid())
  OR current_role_is('directeur')
);

-- ── CONGÉS ──────────────────────────────────────────────────────
CREATE POLICY conges_select ON conges FOR SELECT USING (
  agent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = agent_id AND p.manager_id = auth.uid())
  OR current_role_is('directeur')
);
CREATE POLICY conges_write ON conges FOR ALL USING (
  agent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = agent_id AND p.manager_id = auth.uid())
  OR current_role_is('directeur')
);

-- ── TOURNÉES ────────────────────────────────────────────────────
CREATE POLICY tournees_select ON tournees FOR SELECT USING (
  agent_id = auth.uid()
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = agent_id AND p.manager_id = auth.uid())
  OR current_role_is('directeur')
);
CREATE POLICY tournees_write ON tournees FOR ALL USING (
  agent_id = auth.uid()
  OR current_role_is('manager')
  OR current_role_is('directeur')
);

-- ── ÉTAPES TOURNÉES ─────────────────────────────────────────────
CREATE POLICY tournees_etapes_select ON tournees_etapes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM tournees t
    WHERE t.id = tournee_id
    AND (
      t.agent_id = auth.uid()
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = t.agent_id AND p.manager_id = auth.uid())
      OR current_role_is('directeur')
    )
  )
);
CREATE POLICY tournees_etapes_write ON tournees_etapes FOR ALL USING (
  current_role_is('manager') OR current_role_is('directeur')
);

-- ── CACHE DISTANCES ─────────────────────────────────────────────
CREATE POLICY distances_read ON distances_cache FOR SELECT USING (
  auth.uid() IS NOT NULL
);
CREATE POLICY distances_write ON distances_cache FOR ALL USING (
  current_role_is('manager') OR current_role_is('directeur')
);

-- ================================================================
-- STORAGE BUCKETS
-- ================================================================
-- Bucket photos-interventions (privé)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos-interventions',
  'photos-interventions',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
) ON CONFLICT (id) DO NOTHING;

-- Bucket qr-codes (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qr-codes',
  'qr-codes',
  true,
  1048576,  -- 1 MB
  ARRAY['image/png','image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS — photos-interventions
CREATE POLICY "photos_upload" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'photos-interventions' AND auth.uid() IS NOT NULL
);
CREATE POLICY "photos_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'photos-interventions' AND auth.uid() IS NOT NULL
);

-- Storage RLS — qr-codes (public en lecture)
CREATE POLICY "qrcodes_read" ON storage.objects FOR SELECT USING (
  bucket_id = 'qr-codes'
);
CREATE POLICY "qrcodes_write" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'qr-codes'
  AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager','directeur'))
);
