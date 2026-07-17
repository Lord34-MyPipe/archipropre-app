import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-server'
import { calculerJourneeAgent, type InterventionJourneeRaw } from '@/lib/journeeAgent'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await params
  const date = req.nextUrl.searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'Paramètre date requis' }, { status: 400 })

  // Vérifier ownership : l'agent appartient au manager
  const { data: agentProfile } = await supabase
    .from('profiles')
    .select('id, prenom, nom')
    .eq('id', id)
    .eq('manager_id', user.id)
    .single()
  if (!agentProfile) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const admin = await createAdminClient()

  const [{ data: interventionsRaw }, { data: journee }] = await Promise.all([
    admin
      .from('interventions')
      .select('id, heure_scan, heure_fin, statut, contrat_id, residences(nom)')
      .eq('agent_id', id)
      .eq('date_prevue', date)
      .in('statut', ['terminee', 'validee'])
      .order('heure_scan'),

    admin
      .from('journees_agent')
      .select('id, validee_at, validee_par, total_minutes_terrain, total_minutes_trajets, notes')
      .eq('agent_id', id)
      .eq('date', date)
      .maybeSingle(),
  ])

  const { segments, totalTerrain, totalTrajets, totalJournee } =
    calculerJourneeAgent((interventionsRaw ?? []) as InterventionJourneeRaw[])

  return NextResponse.json({
    agent: agentProfile,
    segments,
    totalTerrain,
    totalTrajets,
    totalJournee,
    journeeValidee: journee ?? null,
  })
}
