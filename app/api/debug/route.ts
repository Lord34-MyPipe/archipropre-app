export async function GET() {
  return Response.json({
    url:       process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasKey:    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    keyStart:  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20),
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    appUrl:    process.env.NEXT_PUBLIC_APP_URL,
    nodeEnv:   process.env.NODE_ENV,
  })
}
