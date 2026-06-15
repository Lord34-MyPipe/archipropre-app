import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(list) {
          // Propager les cookies rafraîchis sur la requête ET la réponse
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // Rafraîchit le token si nécessaire — ne jamais utiliser getSession() ici
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Seule règle du middleware : bloquer les non-authentifiés hors /login
  // Les redirections post-login (selon le rôle) sont gérées par la page /login
  // et les layouts — pas ici, pour éviter les boucles.
  if (!user && path !== '/login') {
    const loginUrl = new URL('/login', request.url)
    // Passer l'URL cible en param pour pouvoir y revenir après login (optionnel)
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|public).*)',
  ],
}
