import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

async function ownsResidence(managerId: string, residenceId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin.from('residences').select('id').eq('id', residenceId).eq('manager_id', managerId).single()
  return !!data
}

// POST — créer une zone
export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { residenceId, nom, ordre, contratId, batiment, coefDuree } = await req.json()
  if (!residenceId || !nom) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  if (!contratId) return NextResponse.json({ error: 'contratId obligatoire — toute zone doit appartenir à un contrat' }, { status: 400 })

  if (!await ownsResidence(managerId, residenceId))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Coefficient de durée (prorata pondéré) : nombre > 0, défaut 1.
  const coef = Number(coefDuree)
  const coefOk = Number.isFinite(coef) && coef > 0 ? coef : 1

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('zones_residence')
    .insert({
      residence_id: residenceId,
      nom: nom.trim(),
      ordre: ordre ?? 1,
      batiment: typeof batiment === 'string' && batiment.trim() ? batiment.trim() : null,
      coef_duree: coefOk,
      ...(contratId ? { contrat_id: contratId } : {}),
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

// PATCH — renommer une zone
export async function PATCH(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id, nom, batiment, coefDuree } = await req.json()
  if (!id || !nom) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()
  const { data: zone } = await admin.from('zones_residence').select('residence_id').eq('id', id).single()
  if (!zone || !await ownsResidence(managerId, zone.residence_id))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const upd: Record<string, unknown> = { nom: nom.trim() }
  // batiment optionnel : mis à jour seulement s'il est fourni (undefined = ne pas toucher)
  if (batiment !== undefined) upd.batiment = typeof batiment === 'string' && batiment.trim() ? batiment.trim() : null
  // coef_duree optionnel : mis à jour seulement s'il est fourni ; valeur > 0, sinon 1
  if (coefDuree !== undefined) {
    const c = Number(coefDuree)
    upd.coef_duree = Number.isFinite(c) && c > 0 ? c : 1
  }

  const { error } = await admin.from('zones_residence').update(upd).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// DELETE — supprimer une zone (et ses tâches)
export async function DELETE(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()
  const { data: zone } = await admin.from('zones_residence').select('residence_id').eq('id', id).single()
  if (!zone || !await ownsResidence(managerId, zone.residence_id))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Dissocier les tâches avant suppression
  await admin.from('taches_template').update({ zone_id: null }).eq('zone_id', id)
  const { error } = await admin.from('zones_residence').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
