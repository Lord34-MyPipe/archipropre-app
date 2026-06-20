import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-server'

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
      .select('id, heure_scan, heure_fin, statut, residences(nom)')
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

  const interventions = (interventionsRaw ?? []) as Array<{
    id: string
    heure_scan: string | null
    heure_fin: string | null
    statut: string
    residences: { nom: string } | { nom: string }[] | null
  }>

  const segments = interventions.map((inter, i) => {
    const debut = inter.heure_scan ? new Date(inter.heure_scan) : null
    const fin   = inter.heure_fin  ? new Date(inter.heure_fin)  : null
    const dureeMin = debut && fin ? Math.round((fin.getTime() - debut.getTime()) / 60000) : null

    const next = interventions[i + 1]
    const trajetMin = fin && next?.heure_scan
      ? Math.round((new Date(next.heure_scan).getTime() - fin.getTime()) / 60000)
      : null

    const res = inter.residences
    const residenceNom = res
      ? (Array.isArray(res) ? res[0]?.nom : (res as { nom: string }).nom) ?? '—'
      : '—'

    return {
      intervention_id: inter.id,
      residence_nom: residenceNom,
      heure_debut: inter.heure_scan,
      heure_fin: inter.heure_fin,
      duree_minutes: dureeMin,
      trajet_apres_minutes: trajetMin,
      statut: inter.statut,
    }
  })

  const totalTerrain = segments.reduce((s, seg) => s + (seg.duree_minutes ?? 0), 0)
  const totalTrajets = segments.reduce((s, seg) => s + (seg.trajet_apres_minutes ?? 0), 0)

  return NextResponse.json({
    agent: agentProfile,
    segments,
    totalTerrain,
    totalTrajets,
    totalJournee: totalTerrain + totalTrajets,
    journeeValidee: journee ?? null,
  })
}
