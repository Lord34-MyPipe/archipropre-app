-- Migration 023: passages_siege + adresse_siege sur parametres_societe

-- Ajouter adresse_siege à parametres_societe
ALTER TABLE public.parametres_societe
  ADD COLUMN IF NOT EXISTS adresse_siege text;

UPDATE public.parametres_societe
  SET adresse_siege = '123 Rue de la Bandido, 34160 Castries'
  WHERE adresse_siege IS NULL;

-- Table passages_siege
CREATE TABLE IF NOT EXISTS public.passages_siege (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manager_id            uuid        NOT NULL REFERENCES public.profiles(id),
  commande_id           uuid        REFERENCES public.commandes_produits(id) ON DELETE SET NULL,
  date                  date        NOT NULL,
  heure_prevue          time        NOT NULL,
  motif                 text        NOT NULL,
  statut                text        NOT NULL DEFAULT 'planifie'
                                    CHECK (statut IN ('planifie','confirme','effectue','annule')),
  est_livraison_manager boolean     NOT NULL DEFAULT false,
  heure_effectue        timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.passages_siege ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passages_agent_select" ON public.passages_siege
  FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "passages_manager_all" ON public.passages_siege
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('manager', 'directeur')
    )
  );
