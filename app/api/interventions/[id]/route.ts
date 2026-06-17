import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

async function checkOwnership(admin: Awaited<ReturnType<typeof createAdminClient>>, interventionId: string, managerId: string) {
  const { data: inter } = await admin.from('interventions')
    .select('residence_id, statut').eq('id', interventionId).single()
  if (!inter) return { ok: false, status: 404, error: 'Intervention introuvable' }
  const { data: res } = await admin.from('residences')
    .select('id').eq('id', inter.residence_id).eq('manager_id', managerId).single()
  if (!res) return { ok: false, status: 403, error: 'Non autorisé' }
  return { ok: true, inter }
}

// PATCH /api/interventions/[id] — modifier heure_debut_prevue / heure_fin_prevue
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const admin = await createAdminClient()

  const check = await checkOwnership(admin, id, managerId)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })

  const updates: Record<string, string | null> = {}
  if (body.heureDebut !== undefined) updates.heure_debut_prevue = body.heureDebut || null
  if (body.heureFin   !== undefined) updates.heure_fin_prevue   = body.heureFin  || null
  if (body.agentId    !== undefined) updates.agent_id           = body.agentId   || null

  const { error } = await admin.from('interventions').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}

// DELETE /api/interventions/[id] — supprimer une intervention planifiée
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await params
  const admin = await createAdminClient()

  const check = await checkOwnership(admin, id, managerId)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })
  if (check.inter?.statut !== 'planifiee')
    return NextResponse.json({ error: 'Seules les interventions planifiées peuvent être supprimées' }, { status: 400 })

  const { error } = await admin.from('interventions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
