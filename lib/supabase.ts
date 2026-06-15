import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error(
    '[Archipropre] Variables manquantes : ' +
    (!SUPABASE_URL  ? 'NEXT_PUBLIC_SUPABASE_URL '  : '') +
    (!SUPABASE_ANON ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : '') +
    '\nVérifiez les variables d\'environnement dans Vercel > Settings > Environment Variables.'
  )
}

export function createClient() {
  return createBrowserClient(SUPABASE_URL!, SUPABASE_ANON!)
}
