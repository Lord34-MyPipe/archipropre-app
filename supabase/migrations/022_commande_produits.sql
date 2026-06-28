-- Table produits (catalogue)
CREATE TABLE IF NOT EXISTS public.produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  categorie text NOT NULL CHECK (categorie IN ('produit','consommable','materiel')),
  photo_url text NULL,
  actif boolean NOT NULL DEFAULT true,
  ordre integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.produits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produits_read_all" ON public.produits
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "produits_write_directeur" ON public.produits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'directeur')
  );

-- Table commandes_produits (une par intervention)
CREATE TABLE IF NOT EXISTS public.commandes_produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id uuid NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id),
  residence_id uuid NOT NULL REFERENCES public.residences(id),
  contrat_id uuid REFERENCES public.contrats_residences(id),
  statut text NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','commande','livre')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commandes_produits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commandes_agent_own" ON public.commandes_produits
  FOR ALL USING (agent_id = auth.uid());
CREATE POLICY "commandes_manager_read" ON public.commandes_produits
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','directeur'))
  );
CREATE POLICY "commandes_manager_update" ON public.commandes_produits
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','directeur'))
  );

-- Table lignes_commande (items sélectionnés)
CREATE TABLE IF NOT EXISTS public.lignes_commande (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.commandes_produits(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES public.produits(id) NULL,
  type_ligne text NOT NULL DEFAULT 'produit'
    CHECK (type_ligne IN ('produit','ampoule')),
  quantite integer NOT NULL DEFAULT 1,
  localisation text NULL,
  photo_avant_path text NULL,
  photo_apres_path text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lignes_commande ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lignes_agent_via_commande" ON public.lignes_commande
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.commandes_produits cp
      WHERE cp.id = commande_id AND cp.agent_id = auth.uid()
    )
  );
CREATE POLICY "lignes_manager_read" ON public.lignes_commande
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','directeur'))
  );

-- Table photos_chariot
CREATE TABLE IF NOT EXISTS public.photos_chariot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id uuid NOT NULL REFERENCES public.interventions(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id),
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.photos_chariot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chariot_agent_own" ON public.photos_chariot
  FOR ALL USING (agent_id = auth.uid());
CREATE POLICY "chariot_manager_read" ON public.photos_chariot
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','directeur'))
  );

-- Pré-remplissage catalogue (12 produits Archipropre)
INSERT INTO public.produits (nom, categorie, ordre) VALUES
  ('Vitres & surfaces IGUAL',        'produit',      1),
  ('Sol 3D désinfectant',            'produit',      2),
  ('Détartrage sanitaires',          'produit',      3),
  ('Lavette microfibre jaune',       'consommable',  4),
  ('Lavette microfibre bleue',       'consommable',  5),
  ('Lavette microfibre rouge',       'consommable',  6),
  ('Sacs poubelle 30L',              'consommable',  7),
  ('Sacs poubelle 50L',              'consommable',  8),
  ('Sacs poubelle 100L',             'consommable',  9),
  ('Bobines essuie-mains',           'consommable', 10),
  ('Papier WC',                      'consommable', 11),
  ('Franges de lavage microfibre',   'materiel',    12)
ON CONFLICT DO NOTHING;
