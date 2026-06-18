import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['manager', 'directeur'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json() as { intervention_id?: string }
  const { intervention_id } = body

  if (!intervention_id?.trim()) {
    return NextResponse.json({ error: 'intervention_id manquant' }, { status: 400 })
  }

  const admin = await createAdminClient()

  // ── Charger l'intervention + l'agent pour détecter un binôme ─────────────────
  const { data: inter, error: errLoad } = await admin
    .from('interventions')
    .select('id, agent_id, residence_id, date_prevue, heure_debut_prevue, heure_fin_prevue, statut')
    .eq('id', intervention_id)
    .single()

  if (errLoad || !inter) {
    return NextResponse.json({ error: 'Intervention introuvable' }, { status: 404 })
  }

  if (inter.statut === 'annulee') {
    return NextResponse.json({ error: 'Intervention déjà annulée' }, { status: 409 })
  }

  // ── Annulation logique — on garde l'historique ─────────────────────────────────
  const { data: updated1, error: err1 } = await admin
    .from('interventions')
    .update({ statut: 'annulee' })
    .eq('id', intervention_id)
    .select()
    .single()

  if (err1 || !updated1) {
    console.error('[annuler] update intervention:', err1?.message)
    return NextResponse.json({ error: err1?.message ?? 'Erreur annulation' }, { status: 500 })
  }

  // ── Chercher l'intervention miroir du binôme (même résidence, date, créneau, autre agent lié) ──
  const { data: agentProfile } = await admin
    .from('profiles')
    .select('binome_agent_id')
    .eq('id', inter.agent_id)
    .single()

  const binomeAgentId = agentProfile?.binome_agent_id ?? null
  let updated2 = null

  if (binomeAgentId) {
    // Cherche l'intervention miroir : même résidence + date + créneau + agent binôme + non annulée
    const { data: miroir } = await admin
      .from('interventions')
      .select('id, statut')
      .eq('agent_id', binomeAgentId)
      .eq('residence_id', inter.residence_id)
      .eq('date_prevue', inter.date_prevue)
      .eq('heure_debut_prevue', inter.heure_debut_prevue)
      .eq('heure_fin_prevue', inter.heure_fin_prevue)
      .neq('statut', 'annulee')
      .maybeSingle()

    if (miroir) {
      const { data: u2, error: err2 } = await admin
        .from('interventions')
        .update({ statut: 'annulee' })
        .eq('id', miroir.id)
        .select()
        .single()

      if (err2) {
        console.error('[annuler] update miroir:', err2.message)
        // L'intervention principale est déjà annulée — on signale mais on ne rollback pas
      } else {
        updated2 = u2
      }
    }
  }

  return NextResponse.json(
    updated2
      ? { intervention: updated1, miroir: updated2, binome: true }
      : { intervention: updated1, binome: false },
    { status: 200 }
  )
}
