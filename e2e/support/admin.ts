// Client Supabase service-role pour les scripts e2e (provisioning/nettoyage des
// fixtures). Ne PASSE JAMAIS par next/headers (pas de contexte requête ici) —
// contrairement à lib/supabase-server.ts, utilisé par l'app elle-même.
import { createClient } from '@supabase/supabase-js'
import { requireEnv } from './env'

export function adminClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
