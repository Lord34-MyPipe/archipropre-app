-- ================================================================
-- Rend qr_code_token immuable sauf via regenerate_qr_token()
-- ================================================================

-- Trigger : bloque toute modification directe du token
CREATE OR REPLACE FUNCTION prevent_qr_token_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.qr_code_token IS DISTINCT FROM OLD.qr_code_token THEN
    -- La seule exception autorisée : la fonction regenerate_qr_token()
    -- positionne ce flag de session avant de faire l'UPDATE
    IF current_setting('app.allow_qr_update', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION
        'Le champ qr_code_token est immuable. '
        'Utilisez la fonction regenerate_qr_token() pour le renouveler.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lock_qr_code_token
  BEFORE UPDATE ON residences
  FOR EACH ROW EXECUTE FUNCTION prevent_qr_token_update();

-- ----------------------------------------------------------------
-- Fonction de régénération — SECURITY DEFINER pour contourner
-- le trigger, mais avec vérification d'autorisation intégrée
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION regenerate_qr_token(p_residence_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_token UUID;
BEGIN
  -- Vérification d'autorisation : manager de la résidence ou directeur
  IF NOT (
    EXISTS (
      SELECT 1 FROM residences
      WHERE id = p_residence_id AND manager_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'directeur'
    )
  ) THEN
    RAISE EXCEPTION 'Non autorisé : vous ne gérez pas cette résidence.';
  END IF;

  v_new_token := gen_random_uuid();

  -- Lever le verrou pour cet UPDATE uniquement (LOCAL = durée de la transaction)
  PERFORM set_config('app.allow_qr_update', 'true', true);

  UPDATE residences
  SET    qr_code_token = v_new_token
  WHERE  id = p_residence_id;

  -- Remettre le verrou immédiatement
  PERFORM set_config('app.allow_qr_update', 'false', true);

  RETURN v_new_token;
END;
$$;
