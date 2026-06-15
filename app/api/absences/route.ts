import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

async function getManagerUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return null
  return user
}

async function verifyAgentBelongsToManager(agentId: string, managerId: string) {
  const admin = await createAdminClient()
  const { data } = await admin.from('profiles').select('manager_id').eq('id', agentId).single()
  return data?.manager_id === managerId
}

// POST — créer une absence ou un congé
export async function POST(req: NextRequest) {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { tableType, agentId, dateDebut, dateFin, type, motif, valideImmediat } = body

  if (!agentId || !dateDebut || !dateFin || !tableType) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  const ok = await verifyAgentBelongsToManager(agentId, manager.id)
  if (!ok) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const admin = await createAdminClient()

  if (tableType === 'absence') {
    const { data, error } = await admin.from('absences').insert({
      agent_id:   agentId,
      date_debut: dateDebut,
      date_fin:   dateFin,
      type:       type ?? 'maladie',
      motif:      motif ?? null,
      valide:     true,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data })
  }

  if (tableType === 'conge') {
    const statut = valideImmediat ? 'valide' : 'en_attente'
    const { data, error } = await admin.from('conges').insert({
      agent_id:   agentId,
      date_debut: dateDebut,
      date_fin:   dateFin,
      statut,
      valide:     valideImmediat ?? false,
      valide_par: valideImmediat ? manager.id : null,
      motif:      motif ?? null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: 'tableType invalide' }, { status: 400 })
}

// PATCH — modifier complètement une absence/congé, ou juste valider/refuser un congé
export async function PATCH(req: NextRequest) {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { id, statut, tableType, dateDebut, dateFin, type, motif } = body
  if (!id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()

  // Mise à jour complète (mode édition)
  if (dateDebut && dateFin && tableType) {
    const table = tableType === 'absence' ? 'absences' : 'conges'
    const { data: row } = await admin.from(table).select('agent_id').eq('id', id).single()
    if (!row) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

    const ok = await verifyAgentBelongsToManager(row.agent_id, manager.id)
    if (!ok) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    if (tableType === 'absence') {
      const { error } = await admin.from('absences').update({
        date_debut: dateDebut,
        date_fin:   dateFin,
        type:       type ?? 'maladie',
        motif:      motif ?? null,
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      const newStatut = statut ?? 'en_attente'
      const { error } = await admin.from('conges').update({
        date_debut: dateDebut,
        date_fin:   dateFin,
        motif:      motif ?? null,
        statut:     newStatut,
        valide:     newStatut === 'valide',
        valide_par: newStatut === 'valide' ? manager.id : null,
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  // Mise à jour statut seul (valider / refuser un congé)
  if (!statut) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const { data: conge } = await admin.from('conges').select('agent_id').eq('id', id).single()
  if (!conge) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const ok = await verifyAgentBelongsToManager(conge.agent_id, manager.id)
  if (!ok) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { error } = await admin.from('conges').update({
    statut,
    valide:     statut === 'valide',
    valide_par: statut === 'valide' ? manager.id : null,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// DELETE — supprimer une absence ou un congé
export async function DELETE(req: NextRequest) {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { tableType, id } = await req.json()
  if (!tableType || !id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()
  const table = tableType === 'absence' ? 'absences' : 'conges'
  const { data: row } = await admin.from(table).select('agent_id').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const ok = await verifyAgentBelongsToManager(row.agent_id, manager.id)
  if (!ok) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { error } = await admin.from(table).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
