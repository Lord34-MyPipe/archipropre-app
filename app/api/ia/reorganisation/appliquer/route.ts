import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { redistribuer, annuler, alerte_id } = body as {
    redistribuer: Array<{ intervention_id: string; agent_id_propose: string }>
    annuler: Array<{ intervention_id: string }>
    alerte_id: string
  }

  if (!alerte_id) return NextResponse.json({ error: 'alerte_id manquant' }, { status: 400 })

  const admin = await createAdminClient()

  // Garde-fou : vérifier que toutes les interventions appartiennent à ce manager
  const allIds = [
    ...(redistribuer ?? []).map(r => r.intervention_id),
    ...(annuler ?? []).map(a => a.intervention_id),
  ]

  if (allIds.length > 0) {
    const { data: interventions } = await admin
      .from('interventions')
      .select('id, residences(manager_id)')
      .in('id', allIds)

    const unauthorized = (interventions ?? []).filter(i => {
      const raw = i.residences
      const res = (Array.isArray(raw) ? raw[0] : raw) as { manager_id: string | null } | null
      return res?.manager_id !== user.id
    })
    if (unauthorized.length > 0) {
      return NextResponse.json({ error: 'Non autorisé sur certaines interventions' }, { status: 403 })
    }
  }

  // 1. Redistribuer
  for (const item of redistribuer ?? []) {
    await admin
      .from('interventions')
      .update({ agent_id: item.agent_id_propose })
      .eq('id', item.intervention_id)
      .eq('statut', 'planifiee')
  }

  // 2. Annuler
  for (const item of annuler ?? []) {
    await admin
      .from('interventions')
      .update({ statut: 'annulee' })
      .eq('id', item.intervention_id)
  }

  // 3. Supprimer l'alerte
  await admin.from('alertes').delete().eq('id', alerte_id)

  return NextResponse.json({
    success: true,
    redistribuees: (redistribuer ?? []).length,
    annulees: (annuler ?? []).length,
  })
}
