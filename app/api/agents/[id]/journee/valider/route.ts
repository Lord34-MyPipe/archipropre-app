import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { date, total_minutes_terrain, total_minutes_trajets, notes } = body as {
    date: string
    total_minutes_terrain: number
    total_minutes_trajets: number
    notes?: string
  }

  if (!date) return NextResponse.json({ error: 'Paramètre date requis' }, { status: 400 })

  // Vérifier ownership
  const { data: agentProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', id)
    .eq('manager_id', user.id)
    .single()
  if (!agentProfile) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const admin = await createAdminClient()
  const now = new Date().toISOString()

  const [{ error: upsertError }, { error: updateError }] = await Promise.all([
    admin.from('journees_agent').upsert({
      agent_id: id,
      date,
      total_minutes_terrain,
      total_minutes_trajets,
      notes: notes ?? null,
      validee_par: user.id,
      validee_at: now,
    }, { onConflict: 'agent_id,date' }),

    admin.from('interventions')
      .update({ statut: 'validee', validee_par: user.id, validee_at: now })
      .eq('agent_id', id)
      .eq('date_prevue', date)
      .eq('statut', 'terminee'),
  ])

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 })
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
