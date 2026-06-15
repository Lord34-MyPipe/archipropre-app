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

// POST /api/agents — créer un agent
export async function POST(req: NextRequest) {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { nom, prenom, email, telephone, password, vehicule, zones_geo, competences, contrat_heures_hebdo, disponibilites } = body

  if (!nom || !prenom || !email || !password) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
  }

  const admin = await createAdminClient()

  // Créer le compte auth
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nom, prenom },
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

  // Créer le profil
  const { error: profileErr } = await admin.from('profiles').insert({
    id: authData.user.id,
    nom,
    prenom,
    email,
    telephone: telephone || null,
    role: 'agent',
    vehicule: vehicule ?? false,
    zones_geo: zones_geo ?? [],
    competences: competences ?? [],
    contrat_heures_hebdo: contrat_heures_hebdo ?? 35,
    disponibilites: disponibilites ?? {},
    manager_id: manager.id,
    actif: true,
    residences_attitrees: [],
    residences_exclues: [],
  })

  if (profileErr) {
    // Rollback auth user si profil échoue
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  return NextResponse.json({ id: authData.user.id })
}

// PATCH /api/agents — modifier un agent
export async function PATCH(req: NextRequest) {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { id, nom, prenom, telephone, vehicule, zones_geo, competences, contrat_heures_hebdo, disponibilites, actif } = body
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  const admin = await createAdminClient()

  // Vérifier que l'agent appartient à ce manager
  const { data: agent } = await admin.from('profiles').select('manager_id').eq('id', id).single()
  if (agent?.manager_id !== manager.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}
  if (nom !== undefined) updates.nom = nom
  if (prenom !== undefined) updates.prenom = prenom
  if (telephone !== undefined) updates.telephone = telephone || null
  if (vehicule !== undefined) updates.vehicule = vehicule
  if (zones_geo !== undefined) updates.zones_geo = zones_geo
  if (competences !== undefined) updates.competences = competences
  if (contrat_heures_hebdo !== undefined) updates.contrat_heures_hebdo = contrat_heures_hebdo
  if (disponibilites !== undefined) updates.disponibilites = disponibilites
  if (actif !== undefined) updates.actif = actif

  const { error } = await admin.from('profiles').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}

// DELETE /api/agents — désactiver un agent (soft delete)
export async function DELETE(req: NextRequest) {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  const admin = await createAdminClient()
  const { data: agent } = await admin.from('profiles').select('manager_id').eq('id', id).single()
  if (agent?.manager_id !== manager.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { error } = await admin.from('profiles').update({ actif: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
