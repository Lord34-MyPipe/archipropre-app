-- Marqueur de provenance pour les fixtures Playwright (e2e/support/fixtures.ts).
--
-- Contexte (21/07/2026) : le script de provisioning e2e cherchait un profil/
-- une résidence existant par email/nom avant d'en créer un, pour rester
-- idempotent entre les runs. Un identifiant de test ("christian") a collisionné
-- avec le compte agent RÉEL de Christian Marquant (résolu par
-- lib/agent-identifiant.ts en christian@archipropre.local, exactement comme
-- pour un agent réel) — le script l'a pris pour une fixture et a écrasé son
-- binome_agent_id. Incident corrigé manuellement (profil restauré), mais la
-- classe de bug reste possible tant que la détection "est-ce une fixture ?"
-- repose sur une simple correspondance de nom/email.
--
-- Volontairement UN NOUVEAU CHAMP DÉDIÉ, PAS is_demo : is_demo s'est déjà
-- révélé non fiable pour ce genre de décision (incident du 14/07/2026, voir
-- docs/CONTEXT.md « Key learnings » — is_demo avait été posé à tort sur des
-- résidences réelles, RÈGLE ABSOLUE : ne jamais l'utiliser comme critère
-- d'action). e2e_fixture est un marqueur neuf, jamais posé sur aucune ligne
-- réelle existante, à la sémantique unique et non ambiguë.
--
-- Défaut false partout : aucune ligne existante n'est marquée fixture. Le
-- script de provisioning est désormais seul à écrire `true`, uniquement sur
-- les lignes qu'il crée lui-même — jamais une réutilisation par simple
-- correspondance de nom/email.

ALTER TABLE profiles   ADD COLUMN IF NOT EXISTS e2e_fixture BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE residences ADD COLUMN IF NOT EXISTS e2e_fixture BOOLEAN NOT NULL DEFAULT false;
