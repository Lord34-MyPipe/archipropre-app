import { defineConfig, devices } from '@playwright/test'
import './e2e/support/env' // charge .env.test avant de lire les variables ci-dessous

const PORT = 3000

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // l'étape 2 du wizard appelle Claude en réel (analyse-contrat) — peut prendre 20-40s
  expect: { timeout: 10_000 },
  fullyParallel: false, // même backend partagé (Supabase prod + résidence de test unique) — exécution séquentielle volontaire, cf docs/E2E_TESTS.md
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never' }], // rapport HTML — c'est l'artefact téléchargé par le workflow GitHub Actions
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Build + start plutôt qu'un déploiement Preview Vercel (décision actée
    // avec Julien, cf docs/E2E_TESTS.md) : plus rapide, teste exactement le
    // code du commit, pas d'attente de déploiement externe.
    command: 'npm run build && npm run start',
    url: process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
})
