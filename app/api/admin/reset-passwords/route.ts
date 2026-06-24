import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

// ⚠️ ROUTE ONE-SHOT — supprimer après utilisation

export async function POST(req: NextRequest) {
  // Vérification token secret (header X-Reset-Secret)
  const secret = req.headers.get('x-reset-secret')
  if (!secret || secret !== process.env.ADMIN_RESET_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // Double vérification : appelant doit être directeur ou manager
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['directeur', 'manager'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Rôle insuffisant' }, { status: 403 })
  }

  const admin = await createAdminClient()

  // Lister tous les users (pagination 1000 max par page)
  const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) {
    console.error('[reset-passwords] listUsers error:', listErr)
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const cibles = users.filter(u => u.email?.endsWith('@archipropre-services.com'))
  console.log(`[reset-passwords] ${cibles.length} comptes @archipropre-services.com trouvés`)

  let success = 0
  let errors = 0
  const failures: string[] = []

  for (const u of cibles) {
    const { error } = await admin.auth.admin.updateUserById(u.id, { password: '2026' })
    if (error) {
      console.error(`[reset-passwords] échec ${u.email}:`, error.message)
      failures.push(u.email ?? u.id)
      errors++
    } else {
      success++
    }
  }

  console.log(`[reset-passwords] terminé — ${success} succès, ${errors} échecs`)
  return NextResponse.json({ success, errors, failures, total: cibles.length })
}
