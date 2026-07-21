// Client Supabase service-role pour les scripts e2e (provisioning/nettoyage des
// fixtures). Ne PASSE JAMAIS par next/headers (pas de contexte requête ici) —
// contrairement à lib/supabase-server.ts, utilisé par l'app elle-même.
import { createClient, type RealtimeClientOptions } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { requireEnv } from './env'

export function adminClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // createClient() construit un RealtimeClient dès l'appel (pas
      // seulement au premier .channel()), qui exige un WebSocket au moment
      // même de sa construction. Ce script n'utilise jamais Realtime (juste
      // des requêtes admin), mais tourne hors du bundling Next.js (tsx /
      // Playwright, pas de polyfill fetch/WebSocket comme dans l'app elle-
      // même) — sur Node 20 il n'y a pas de WebSocket natif (natif seulement
      // depuis Node 22), d'où l'échec sinon. On fournit `ws` comme transport
      // (solution recommandée par @supabase/realtime-js) plutôt que
      // d'exiger Node 22 : aucun changement de version requis, ni en local
      // ni en CI. Voir docs/E2E_TESTS.md.
      // Cast nécessaire : les types de `ws` et l'interface WebSocketLikeConstructor
      // attendue par @supabase/realtime-js divergent légèrement (incompatibilité
      // de signature connue entre `ws` et le WebSocket natif du DOM), sans
      // divergence réelle à l'exécution — `ws` est explicitement documenté comme
      // implémentation valide par @supabase/realtime-js.
      realtime: { transport: WebSocket as unknown as RealtimeClientOptions['transport'] },
    },
  )
}
