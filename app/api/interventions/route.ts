import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

function computeDates(startDate: string, recurrence: string): string[] {
  const base = new Date(startDate + 'T00:00:00')
  if (recurrence === 'ponctuelle') return [startDate]
  const dates: string[] = []
  if (recurrence === 'mensuelle') {
    for (let i = 0; i < 3; i++) {
      const d = new Date(base)
      d.setMonth(d.getMonth() + i)
      dates.push(d.toISOString().split('T')[0])
    }
  } else {
    const step = recurrence === 'bihebdo' ? 14 : 7
    for (let i = 0; i < 8; i++) {
      const d = new Date(base)
      d.setDate(d.getDate() + i * step)
      dates.push(d.toISOString().split('T')[0])
    }
  }
  return dates
}

// POST — créer une (ou plusieurs) intervention(s)
export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { residenceId, agentId, dateDebut, heureDebut, heureFin, recurrence } = await req.json()
  if (!residenceId || !agentId || !dateDebut)
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()

  // Vérifier que la résidence appartient au manager
  const { data: res } = await admin
    .from('residences').select('id').eq('id', residenceId).eq('manager_id', managerId).single()
  if (!res) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Vérifier que l'agent appartient au manager
  const { data: agent } = await admin
    .from('profiles').select('id').eq('id', agentId).eq('manager_id', managerId).single()
  if (!agent) return NextResponse.json({ error: 'Agent non autorisé' }, { status: 403 })

  const dates = computeDates(dateDebut, recurrence ?? 'ponctuelle')
  const rows = dates.map(d => ({
    agent_id: agentId,
    residence_id: residenceId,
    date_prevue: d,
    heure_debut_prevue: heureDebut ?? null,
    heure_fin_prevue: heureFin ?? null,
    statut: 'planifiee',
    disponible_apres_fin: false,
  }))

  const { data: created, error } = await admin
    .from('interventions').insert(rows).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Alerte pour l'agent (première occurrence)
  const firstId = (created ?? [])[0]?.id
  if (firstId) {
    const dateLabel = new Date(dateDebut + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    await admin.from('alertes').insert({
      intervention_id: firstId,
      type: 'nouvelle_intervention',
      message: `Nouvelle intervention planifiée le ${dateLabel}${heureDebut ? ` à ${heureDebut}` : ''}.`,
      destinataire_id: agentId,
      lue: false,
    })
  }

  return NextResponse.json({ data: created, count: dates.length })
}

// PATCH — réassigner un agent sur une intervention existante
export async function PATCH(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { interventionId, agentId } = await req.json()
  if (!interventionId || !agentId)
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()

  // Vérifier ownership via la résidence
  const { data: inter } = await admin
    .from('interventions').select('id, residence_id, date_prevue, heure_debut_prevue')
    .eq('id', interventionId).single()
  if (!inter) return NextResponse.json({ error: 'Intervention introuvable' }, { status: 404 })

  const { data: res } = await admin
    .from('residences').select('id').eq('id', inter.residence_id).eq('manager_id', managerId).single()
  if (!res) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Vérifier que le nouvel agent appartient au manager
  const { data: agent } = await admin
    .from('profiles').select('id').eq('id', agentId).eq('manager_id', managerId).single()
  if (!agent) return NextResponse.json({ error: 'Agent non autorisé' }, { status: 403 })

  const { error } = await admin
    .from('interventions').update({ agent_id: agentId }).eq('id', interventionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Alerte pour le nouvel agent
  const dateLabel = new Date(inter.date_prevue + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  await admin.from('alertes').insert({
    intervention_id: interventionId,
    type: 'reassignation',
    message: `Vous avez été réassigné(e) sur une intervention le ${dateLabel}${inter.heure_debut_prevue ? ` à ${inter.heure_debut_prevue.slice(0,5)}` : ''}.`,
    destinataire_id: agentId,
    lue: false,
  })

  return NextResponse.json({ ok: true })
}
