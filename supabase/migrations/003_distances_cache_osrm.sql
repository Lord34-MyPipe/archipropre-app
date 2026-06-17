-- Migration 003 : support OSRM pour distances_cache
-- Ajoute les colonnes lat/lng et mode pour stocker des trajets entre coordonnées quelconques
-- (pas seulement entre résidences identifiées par ID)

ALTER TABLE distances_cache
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'voiture',
  ADD COLUMN IF NOT EXISTS origine_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS origine_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dest_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dest_lng DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS distances_cache_coords_mode_idx
  ON distances_cache (origine_lat, origine_lng, dest_lat, dest_lng, mode);

-- Paramètre forfait tramway (temps d'attente + correspondances, en minutes)
ALTER TABLE parametres_societe
  ADD COLUMN IF NOT EXISTS forfait_tram INTEGER NOT NULL DEFAULT 20;
