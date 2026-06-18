-- Rattrapage : duree_reelle_minutes ajoutée manuellement en base, absente des migrations.
-- ADD COLUMN IF NOT EXISTS : sans effet si la colonne existe déjà.
ALTER TABLE taches_intervention
  ADD COLUMN IF NOT EXISTS duree_reelle_minutes INTEGER;
