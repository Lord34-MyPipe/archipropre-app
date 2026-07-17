-- Rapport syndic (P3-2, étape S5) — lien web sécurisé, snapshot figé,
-- révocable. RLS activée, ZÉRO policy anon/authenticated : deny total
-- intentionnel — tout accès (création manager, résolution publique par
-- token) passe exclusivement par le service_role côté serveur (jamais par
-- le SDK client avec la clé anon), pour éviter toute possibilité
-- d'énumération des tokens actifs via PostgREST.

CREATE TABLE rapports_syndic_liens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token         uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  residence_id  uuid NOT NULL REFERENCES residences(id),
  contrat_id    uuid REFERENCES contrats_residences(id),
  periode_debut date NOT NULL,
  periode_fin   date NOT NULL,
  snapshot      jsonb NOT NULL,
  avec_photos   boolean NOT NULL DEFAULT true,
  actif         boolean NOT NULL DEFAULT true,
  created_by    uuid NOT NULL REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

CREATE INDEX idx_rapports_syndic_liens_residence ON rapports_syndic_liens(residence_id);

ALTER TABLE rapports_syndic_liens ENABLE ROW LEVEL SECURITY;
-- Volontairement AUCUNE policy créée : deny total pour anon ET authenticated.
-- Le manager gère ses liens via une route API (service_role + vérif ownership
-- en code) ; la page publique résout un token via service_role également.
