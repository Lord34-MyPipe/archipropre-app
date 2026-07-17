import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-server'
import { calculerJourneeAgent, type InterventionJourneeRaw } from '@/lib/journeeAgent'

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
  const { date, notes } = body as { date: string; notes?: string }

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

  // Garde-fou RH : le total persisté est TOUJOURS recalculé côté serveur,
  // jamais celui envoyé par le client. Même fonction de regroupement par
  // mission que GET /api/agents/[id]/journee (lib/journeeAgent.ts) — les deux
  // ne peuvent pas diverger, et un futur bug d'affichage côté client ne peut
  // plus corrompre la donnée de paie.
  const { data: interventionsRaw } = await admin
    .from('interventions')
    .select('id, heure_scan, heure_fin, statut, contrat_id, residences(nom)')
    .eq('agent_id', id)
    .eq('date_prevue', date)
    .in('statut', ['terminee', 'validee'])
    .order('heure_scan')

  const { totalTerrain, totalTrajets } =
    calculerJourneeAgent((interventionsRaw ?? []) as InterventionJourneeRaw[])

  const now = new Date().toISOString()

  const [{ error: upsertError }, { error: updateError }] = await Promise.all([
    admin.from('journees_agent').upsert({
      agent_id: id,
      date,
      total_minutes_terrain: totalTerrain,
      total_minutes_trajets: totalTrajets,
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
