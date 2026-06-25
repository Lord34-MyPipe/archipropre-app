-- Agents doivent pouvoir lire contrats_residences pour résoudre le token QR au scan.
-- Les champs financiers ne sont jamais exposés dans l'UI agent (SELECT id, libelle, residence_id).
CREATE POLICY contrats_read_agent ON contrats_residences
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
