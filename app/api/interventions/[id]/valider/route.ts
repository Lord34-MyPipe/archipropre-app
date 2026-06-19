import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await params

  // Vérifier ownership : l'intervention appartient à un agent du manager
  const { data: inter } = await supabase
    .from('interventions')
    .select('statut, profiles!interventions_agent_id_fkey(manager_id)')
    .eq('id', id)
    .single()

  if (!inter) return NextResponse.json({ error: 'Intervention introuvable' }, { status: 404 })

  const profileRaw = (inter as Record<string, unknown>).profiles
  const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw
  if ((profile as { manager_id: string } | null)?.manager_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  if (inter.statut !== 'terminee') {
    return NextResponse.json({ error: 'Seules les interventions terminées peuvent être validées' }, { status: 400 })
  }

  const { error } = await supabase
    .from('interventions')
    .update({ statut: 'validee', validee_par: user.id, validee_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
