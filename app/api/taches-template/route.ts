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

// GET — lister les tâches template d'une résidence (optionnel: ?frequenceType=hebdo)
export async function GET(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const residenceId   = req.nextUrl.searchParams.get('residenceId')
  const frequenceType = req.nextUrl.searchParams.get('frequenceType')
  if (!residenceId) return NextResponse.json({ error: 'residenceId manquant' }, { status: 400 })
  if (!await ownsResidence(managerId, residenceId))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const admin = await createAdminClient()
  let query = admin.from('taches_template')
    .select('id, libelle, frequence_type, jours_semaine, duree_minutes, ordre')
    .eq('residence_id', residenceId)
    .order('ordre', { ascending: true })

  if (frequenceType) query = query.eq('frequence_type', frequenceType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

// POST — créer une tâche template
export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { residenceId, zoneId, libelle, frequenceType, frequenceValeur,
          joursSemaine, semaineDuMois, moisDeAnnee,
          heureDebut, heureFin, contrainteExterne, tacheLieeId } = body

  if (!residenceId || !libelle || !frequenceType)
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  if (!await ownsResidence(managerId, residenceId))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const admin = await createAdminClient()

  // Calculer l'ordre (après la dernière tâche de la zone)
  const { count } = await admin.from('taches_template')
    .select('id', { count: 'exact', head: true })
    .eq('residence_id', residenceId)
    .eq('zone_id', zoneId ?? null)

  const { data, error } = await admin.from('taches_template').insert({
    residence_id:      residenceId,
    zone_id:           zoneId || null,
    libelle:           libelle.trim(),
    frequence_type:    frequenceType,
    frequence_valeur:  frequenceValeur ?? 1,
    jours_semaine:     joursSemaine ?? [],
    semaine_du_mois:   semaineDuMois ?? null,
    mois_de_annee:     moisDeAnnee ?? null,
    heure_debut:       heureDebut || null,
    heure_fin:         heureFin || null,
    contrainte_externe: contrainteExterne || null,
    tache_liee_id:     tacheLieeId || null,
    ordre:             (count ?? 0) + 1,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

// PATCH — modifier une tâche
export async function PATCH(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()
  const { data: tache } = await admin.from('taches_template').select('residence_id').eq('id', id).single()
  if (!tache || !await ownsResidence(managerId, tache.residence_id))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const update: Record<string, unknown> = {}
  if (fields.zoneId        !== undefined) update.zone_id            = fields.zoneId || null
  if (fields.libelle        !== undefined) update.libelle            = fields.libelle.trim()
  if (fields.frequenceType  !== undefined) update.frequence_type     = fields.frequenceType
  if (fields.frequenceValeur!== undefined) update.frequence_valeur   = fields.frequenceValeur
  if (fields.joursSemaine   !== undefined) update.jours_semaine      = fields.joursSemaine
  if (fields.semaineDuMois  !== undefined) update.semaine_du_mois    = fields.semaineDuMois
  if (fields.moisDeAnnee    !== undefined) update.mois_de_annee      = fields.moisDeAnnee
  if (fields.heureDebut     !== undefined) update.heure_debut        = fields.heureDebut || null
  if (fields.heureFin       !== undefined) update.heure_fin          = fields.heureFin || null
  if (fields.contrainteExterne !== undefined) update.contrainte_externe = fields.contrainteExterne || null
  if (fields.tacheLieeId    !== undefined) update.tache_liee_id      = fields.tacheLieeId || null
  if (fields.dureeMinutes   !== undefined) update.duree_minutes       = fields.dureeMinutes ?? 0

  const { error } = await admin.from('taches_template').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

// DELETE — supprimer une tâche
export async function DELETE(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()
  const { data: tache } = await admin.from('taches_template').select('residence_id').eq('id', id).single()
  if (!tache || !await ownsResidence(managerId, tache.residence_id))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { error } = await admin.from('taches_template').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
