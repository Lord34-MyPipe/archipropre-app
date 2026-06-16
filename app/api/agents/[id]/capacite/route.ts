import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

const MODES_VALIDES = ['tramway', 'voiture', 'velo'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: manager } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (manager?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json()
  const { contrat_heures_hebdo, seuil_cible_pct, mode_deplacement, secteur_libelle } = body

  if (contrat_heures_hebdo !== undefined) {
    const h = Number(contrat_heures_hebdo)
    if (isNaN(h) || h < 0 || h > 50)
      return NextResponse.json({ error: 'contrat_heures_hebdo doit être entre 0 et 50' }, { status: 400 })
  }
  if (seuil_cible_pct !== undefined) {
    const s = Number(seuil_cible_pct)
    if (isNaN(s) || s < 50 || s > 100)
      return NextResponse.json({ error: 'seuil_cible_pct doit être entre 50 et 100' }, { status: 400 })
  }
  if (mode_deplacement !== undefined && !MODES_VALIDES.includes(mode_deplacement))
    return NextResponse.json({ error: 'mode_deplacement invalide' }, { status: 400 })

  const admin = await createAdminClient()

  const { data: agent } = await admin.from('profiles').select('manager_id').eq('id', id).single()
  if (!agent || agent.manager_id !== user.id)
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const updates: Record<string, unknown> = {}
  if (contrat_heures_hebdo !== undefined) updates.contrat_heures_hebdo = Number(contrat_heures_hebdo)
  if (seuil_cible_pct !== undefined) updates.seuil_cible_pct = Number(seuil_cible_pct)
  if (mode_deplacement !== undefined) updates.mode_deplacement = mode_deplacement
  if (secteur_libelle !== undefined) updates.secteur_libelle = secteur_libelle || null

  const { error } = await admin.from('profiles').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
