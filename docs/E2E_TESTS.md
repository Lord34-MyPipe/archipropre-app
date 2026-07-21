# Tests E2E (Playwright)

Suite de tests de bout en bout couvrant les 2 parcours critiques de l'app :

1. **Manager** : login → wizard "Nouveau contrat (assisté IA)" → cartes de
   décision → création du contrat → génération du planning → vérification
   que les interventions couvrent les créneaux (`e2e/01-manager-flow.spec.ts`).
2. **Agent** : login → scan → validation des tâches d'une zone (photo
   obligatoire) → rapport final envoyé (`e2e/03-agent-flow.spec.ts`).
3. **Régressions du 21/07/2026** (`e2e/02-regressions.spec.ts`) : durées des
   interventions = créneaux du contrat (pas de réduction binôme en mode
   dispatch), aucune tournée transverse générée sur un contrat mono-bâtiment,
   chips par jour de `/taches` = créneaux × binôme.

## Décision d'environnement (actée avec Julien le 21/07/2026)

La suite tourne contre **la base Supabase de production existante**, pas une
base séparée — le branching Supabase (DB éphémère par run, la solution la
plus propre) n'est pas disponible sur le plan actuel de ce projet. En
contrepartie :

- Tout est isolé sur une **résidence de test dédiée**, créée automatiquement
  au premier run (`ZZZ-E2E-TEST (Playwright — ne pas modifier manuellement)`)
  et **2 agents de test dédiés** (`E2E_AGENT_EMAIL` + son binôme miroir
  `E2E_AGENT_BINOME_EMAIL`) — jamais GMCO, jamais un compte ou une résidence
  réels.
- Chaque test crée son propre contrat de test et le **supprime entièrement**
  en fin de run (`delete_contrat_cascade`, la même RPC utilisée pour les
  nettoyages manuels de GMCO cette session) — la résidence elle-même
  persiste (idempotent), mais aucun contrat de test ne doit rester après
  un run réussi.
- L'app testée est un **serveur Next.js buildé et démarré localement**
  (`npm run build && npm run start`) dans le runner CI — pas un déploiement
  Preview Vercel (plus rapide, teste exactement le code du commit, pas
  d'attente de déploiement externe).

Si un run plante avant le nettoyage (crash, timeout), un contrat de test
orphelin peut rester sur la résidence dédiée — sans impact sur la prod
(cette résidence n'est jamais assignée à un vrai client), mais à nettoyer
manuellement si besoin (même procédure que GMCO : vérifier que 100% des
interventions sont `planifiee` sans `heure_scan`, puis `DELETE FROM
interventions` + `delete_contrat_cascade`).

**Limite connue** : les photos uploadées par le test agent (1x1 px, ~70
octets) restent dans le bucket Supabase Storage après le nettoyage — le
`DELETE`/`delete_contrat_cascade` ne purge que les tables Postgres, pas le
storage. Impact négligeable (quelques octets par run) ; à améliorer plus
tard si besoin (purge du bucket dans `nettoyerContrat`).

## Sécurité des fixtures — garde-fou `e2e_fixture` (migration 034)

**Incident du 21/07/2026** : le script de provisioning cherchait un profil/
une résidence existant par email/nom avant d'en créer un (pour rester
idempotent entre les runs). Un premier identifiant de test choisi (un
prénom) a résolu — via le même mécanisme que l'app elle-même
(`lib/agent-identifiant.ts`) — vers l'email technique d'un **vrai compte
agent existant**, que le script a alors traité comme une fixture et modifié
(`binome_agent_id` écrasé). Corrigé manuellement (profil restauré depuis les
données disponibles, vérifié par recoupement), puis durci en profondeur :

- Colonne `profiles.e2e_fixture` / `residences.e2e_fixture` (booléen, défaut
  `false`, migration 034) — posée à `true` **uniquement** par ce script, sur
  les lignes qu'il crée lui-même.
- `ensureAgent()`/`ensureFixtures()` **refusent bruyamment** (erreur explicite,
  aucune écriture) si un profil ou une résidence correspondant au nom/email
  attendu existe déjà mais `e2e_fixture=false` — jamais de réutilisation
  silencieuse par simple correspondance de nom.
- Volontairement **pas** de réutilisation du champ `is_demo` existant pour
  ce garde-fou : `is_demo` s'est déjà révélé non fiable pour ce genre de
  décision (incident du 14/07/2026, voir `docs/CONTEXT.md`) — `e2e_fixture`
  est un marqueur neuf, à la sémantique unique.

**Ce que ça implique concrètement** : si vous changez `E2E_AGENT_EMAIL`/
`E2E_AGENT_BINOME_EMAIL`/le nom de la résidence de test dans `.env.test`
après un premier run réussi, le prochain run échouera avec un message
explicite plutôt que de silencieusement réutiliser/modifier autre chose —
c'est voulu. Choisissez ces identifiants une fois, avec soin (jamais un
prénom ou une valeur qui pourrait correspondre à un employé réel), et
gardez-les stables.

## Lancer les tests en local

### 1. Configurer les identifiants

```bash
cp .env.test.example .env.test
```

Remplir `.env.test` (jamais commité, voir `.gitignore`) :

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY` : mêmes valeurs que `.env.local` (déjà présentes
  si vous développez sur ce projet — le script de fixtures les reprend
  automatiquement en repli si `.env.test` ne les définit pas).
- `E2E_MANAGER_EMAIL` / `E2E_MANAGER_PASSWORD` : le compte manager de test
  existant (`manager@archipropre.fr` / `Test1234!`, voir `docs/CONTEXT.md`).
- `E2E_AGENT_EMAIL` / `E2E_AGENT_BINOME_EMAIL` / `E2E_AGENT_PASSWORD` :
  identifiants des 2 comptes agent de test **dédiés** à la suite (distincts
  de `agent@archipropre.fr`, qui reste désactivé en prod) — le premier run
  les crée automatiquement s'ils n'existent pas encore, marqués
  `e2e_fixture=true` en base (migration 034). **Choisissez un identifiant qui
  ne peut correspondre à aucun employé réel** (jamais un prénom, même
  approximatif) — un identifiant simple est résolu par l'app en
  `<identifiant>@archipropre.local` (`lib/agent-identifiant.ts`) : s'il
  collisionne avec un compte réel, le script refuse maintenant de le
  toucher (incident du 21/07/2026, voir `docs/CONTEXT.md`), mais autant
  l'éviter dès le départ. Valeurs par défaut dans `.env.test.example` :
  `e2e-agent-principal` / `e2e-agent-binome`.

### 2. Lancer la suite

```bash
npm run test:e2e
```

Playwright build + démarre l'app (`npm run build && npm run start`), lance
les 3 fichiers de specs dans l'ordre (`01-manager-flow` → `02-regressions` →
`03-agent-flow`, séquentiel — `fullyParallel: false`, `workers: 1`, cf
`playwright.config.ts`, volontaire puisque tout partage la même base et la
même résidence de test), puis nettoie chaque contrat créé.

Autres commandes utiles :

```bash
npm run test:e2e:ui       # mode interactif Playwright (rejouer/déboguer un test précis)
npm run test:e2e:report   # rouvrir le dernier rapport HTML (traces, screenshots)
```

Pour lancer un seul fichier : `npx playwright test e2e/01-manager-flow.spec.ts`.

### 3. En cas d'échec

Le rapport HTML (`npm run test:e2e:report`) contient, pour chaque test en
échec : une trace Playwright rejouable (chaque action, requête réseau,
console) et une capture d'écran au moment de l'échec. En CI, ce rapport est
publié comme artefact téléchargeable sur chaque exécution du workflow
(`.github/workflows/e2e.yml`), même si la suite échoue.

## CI (GitHub Actions)

Le workflow `.github/workflows/e2e.yml` tourne à chaque push sur `main`
(et manuellement via `workflow_dispatch`). Il lui faut les secrets suivants,
à configurer une fois dans *Settings → Secrets and variables → Actions* du
repo GitHub : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (nécessaire au serveur
Next.js démarré dans le runner — l'étape 2 du wizard appelle Claude en
réel), `E2E_MANAGER_EMAIL`, `E2E_MANAGER_PASSWORD`, `E2E_AGENT_EMAIL`,
`E2E_AGENT_BINOME_EMAIL`, `E2E_AGENT_PASSWORD` — mêmes valeurs que
`.env.test` en local.

## Pourquoi Claude n'exécute jamais ces tests lui-même

Toute exécution de cette suite déclenche de vraies connexions (manager et
agent, via de vrais mots de passe) — Claude ne saisit jamais d'identifiants
pour s'authentifier, y compris via un script automatisé qu'il lancerait
lui-même, même avec l'autorisation explicite de l'utilisateur (règle stricte,
non négociable au cas par cas). Claude peut écrire et faire évoluer les
fichiers de test, lire le rapport après un run déclenché par un humain ou
par la CI, et diagnostiquer/corriger à partir de ce rapport — mais c'est
Julien (en local) ou GitHub Actions qui doit lancer `npm run test:e2e`.
