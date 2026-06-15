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

// GET — récupérer le contrat actif d'une résidence
export async function GET(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const residenceId = req.nextUrl.searchParams.get('residenceId')
  if (!residenceId) return NextResponse.json({ error: 'residenceId manquant' }, { status: 400 })
  if (!await ownsResidence(managerId, residenceId))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const admin = await createAdminClient()
  const { data } = await admin.from('contrats_residences')
    .select('*')
    .eq('residence_id', residenceId)
    .eq('actif', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ data })
}

// POST — créer ou mettre à jour le contrat d'une résidence
export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const {
    residenceId, contratId,
    dateDebut, dateFin,
    montantMensuel, nbInterventionsMois,
    joursObliges, joursInterdits,
    heureDebutMin, heureFinnMax,
    notesSpecifiques,
  } = body

  if (!residenceId || !dateDebut || !dateFin)
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
  if (!await ownsResidence(managerId, residenceId))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const admin = await createAdminClient()
  const payload = {
    residence_id:         residenceId,
    date_debut:           dateDebut,
    date_fin:             dateFin,
    montant_mensuel:      montantMensuel ? Number(montantMensuel) : null,
    nb_interventions_mois: Number(nbInterventionsMois ?? 4),
    jours_obliges:        joursObliges ?? [],
    jours_interdits:      joursInterdits ?? [],
    heure_debut_min:      heureDebutMin ?? null,
    heure_fin_max:        heureFinnMax ?? null,
    notes_specifiques:    notesSpecifiques ?? null,
    actif:                true,
  }

  let data, error
  if (contratId) {
    ;({ data, error } = await admin.from('contrats_residences')
      .update(payload).eq('id', contratId).select().single())
  } else {
    // Désactiver l'ancien contrat actif
    await admin.from('contrats_residences')
      .update({ actif: false }).eq('residence_id', residenceId).eq('actif', true)
    ;({ data, error } = await admin.from('contrats_residences')
      .insert(payload).select().single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
