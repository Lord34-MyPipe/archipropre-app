# archipropre-app

PWA de gestion d'interventions de nettoyage (Next.js + Supabase).

## Documentation

- [`docs/CONTEXT.md`](docs/CONTEXT.md) — état du projet, historique des
  chantiers, décisions actées.
- [`docs/E2E_TESTS.md`](docs/E2E_TESTS.md) — tests de bout en bout
  (Playwright) : comment les lancer en local, configuration CI.

## Développement

```bash
npm install
npm run dev
```

## Tests e2e

```bash
cp .env.test.example .env.test   # puis remplir les identifiants, voir docs/E2E_TESTS.md
npm run test:e2e
```
