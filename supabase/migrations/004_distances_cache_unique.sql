-- Migration 004 : déduplication + contrainte UNIQUE sur distances_cache

-- Étape 1 : supprimer les doublons sur les lignes OSRM (coord non-nulles),
-- en gardant la plus récente par updated_at.
DELETE FROM distances_cache
WHERE id NOT IN (
  SELECT DISTINCT ON (origine_lat, origine_lng, dest_lat, dest_lng, mode) id
  FROM distances_cache
  WHERE origine_lat IS NOT NULL
    AND origine_lng IS NOT NULL
    AND dest_lat    IS NOT NULL
    AND dest_lng    IS NOT NULL
  ORDER BY origine_lat, origine_lng, dest_lat, dest_lng, mode, updated_at DESC NULLS LAST
)
AND origine_lat IS NOT NULL
AND origine_lng IS NOT NULL
AND dest_lat    IS NOT NULL
AND dest_lng    IS NOT NULL;

-- Étape 2 : contrainte UNIQUE
ALTER TABLE distances_cache
  ADD CONSTRAINT distances_cache_coords_mode_unique
  UNIQUE (origine_lat, origine_lng, dest_lat, dest_lng, mode);

-- Étape 3 : supprimer l'ancien index non-unique devenu redondant
DROP INDEX IF EXISTS distances_cache_coords_mode_idx;
