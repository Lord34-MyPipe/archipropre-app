-- Statut 3 états (a_faire / realisee / non_realisee) + commentaire par tâche
-- La colonne validee est conservée en base (non supprimée) mais plus utilisée côté code.
ALTER TABLE taches_intervention
  ADD COLUMN IF NOT EXISTS statut_tache text DEFAULT 'a_faire'
    CHECK (statut_tache IN ('a_faire', 'realisee', 'non_realisee')),
  ADD COLUMN IF NOT EXISTS commentaire text;

-- Migrer les données existantes
UPDATE taches_intervention
  SET statut_tache = 'realisee'
  WHERE validee = true AND statut_tache = 'a_faire';
