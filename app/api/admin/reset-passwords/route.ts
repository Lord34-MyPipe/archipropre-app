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

  // Récupérer tous les agents via profiles (profile.id === auth.users.id garanti)
  const { data: profiles, error: listErr } = await admin
    .from('profiles')
    .select('id, nom, prenom')
    .eq('role', 'agent')
  if (listErr) {
    console.error('[reset-passwords] profiles.select error:', listErr)
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }

  const cibles = profiles ?? []
  console.log(`[reset-passwords] ${cibles.length} agents trouvés`)

  let success = 0
  let errors = 0
  const failures: { nom: string; id: string; error_message?: string; error_code?: string; error_status?: number }[] = []

  for (const p of cibles) {
    const { error } = await admin.auth.admin.updateUserById(p.id, { password: '2026' })
    if (error) {
      console.error(`[reset-passwords] échec ${p.prenom} ${p.nom} (${p.id}):`,
        error.message, 'code:', error.code, 'status:', error.status)
      failures.push({ nom: `${p.prenom} ${p.nom}`, id: p.id, error_message: error?.message, error_code: error?.code, error_status: error?.status })
      errors++
    } else {
      console.log(`[reset-passwords] ok: ${p.prenom} ${p.nom}`)
      success++
    }
  }

  console.log(`[reset-passwords] terminé — ${success} succès, ${errors} échecs`)
  return NextResponse.json({ success, errors, failures, total: cibles.length })
}
