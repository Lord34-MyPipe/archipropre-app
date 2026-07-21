// Charge .env.test (jamais commité) puis .env.local en repli, pour que les
// scripts e2e (config Playwright + provisioning des fixtures) partagent la
// même config Supabase que l'app sans dupliquer un 3e fichier d'env.
import { config as loadEnv } from 'dotenv'
import path from 'node:path'

loadEnv({ path: path.resolve(process.cwd(), '.env.test'), quiet: true })
loadEnv({ path: path.resolve(process.cwd(), '.env.local'), quiet: true }) // repli dev local — ne remplace jamais une clé déjà définie par .env.test

export function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.test.example)`)
  return v
}

export const E2E_BASE_URL       = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
export const E2E_MANAGER_EMAIL  = () => requireEnv('E2E_MANAGER_EMAIL')
export const E2E_MANAGER_PASSWORD = () => requireEnv('E2E_MANAGER_PASSWORD')
export const E2E_AGENT_EMAIL    = () => requireEnv('E2E_AGENT_EMAIL')
export const E2E_AGENT_BINOME_EMAIL = () => requireEnv('E2E_AGENT_BINOME_EMAIL')
export const E2E_AGENT_PASSWORD = () => requireEnv('E2E_AGENT_PASSWORD')

// Nom fixe et sans ambiguïté — ne JAMAIS réutiliser une résidence réelle (GMCO
// incluse) pour ces tests. Le script de provisioning cherche une résidence
// avec exactement ce nom avant d'en créer une, pour rester idempotent entre
// les runs (même résidence réutilisée, jamais recréée en double).
export const E2E_RESIDENCE_NOM = 'ZZZ-E2E-TEST (Playwright — ne pas modifier manuellement)'
export const E2E_AGENT_NOM_A = 'E2E-Test'
export const E2E_AGENT_PRENOM_A = 'Agent'
export const E2E_AGENT_NOM_B = 'E2E-Binome'
export const E2E_AGENT_PRENOM_B = 'Agent'
