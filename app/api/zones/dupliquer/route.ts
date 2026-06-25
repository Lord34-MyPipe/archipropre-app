import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { zoneId } = await req.json()
  if (!zoneId) return NextResponse.json({ error: 'zoneId manquant' }, { status: 400 })

  const admin = await createAdminClient()

  // Récupérer la zone source + vérifier ownership via residence
  const { data: sourceZone } = await admin
    .from('zones_residence')
    .select('id, residence_id, nom, ordre, couleur, contrat_id')
    .eq('id', zoneId)
    .single()
  if (!sourceZone) return NextResponse.json({ error: 'Zone introuvable' }, { status: 404 })

  const { data: residence } = await admin
    .from('residences')
    .select('id')
    .eq('id', sourceZone.residence_id)
    .eq('manager_id', user.id)
    .single()
  if (!residence) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Résoudre le contrat_id : source en priorité, sinon contrat parties_communes de la résidence
  let contratId: string | null = sourceZone.contrat_id ?? null
  if (!contratId) {
    const { data: contrat } = await admin
      .from('contrats_residences')
      .select('id')
      .eq('residence_id', sourceZone.residence_id)
      .eq('type_contrat', 'parties_communes')
      .limit(1)
      .maybeSingle()
    contratId = contrat?.id ?? null
  }

  // Compter les zones existantes pour l'ordre
  const { count } = await admin
    .from('zones_residence')
    .select('id', { count: 'exact', head: true })
    .eq('residence_id', sourceZone.residence_id)

  // Créer la nouvelle zone
  const { data: newZone, error: zoneErr } = await admin
    .from('zones_residence')
    .insert({
      residence_id: sourceZone.residence_id,
      nom: `${sourceZone.nom} (copie)`,
      ordre: (count ?? 0) + 1,
      couleur: sourceZone.couleur,
      contrat_id: contratId,
    })
    .select()
    .single()
  if (zoneErr || !newZone) return NextResponse.json({ error: zoneErr?.message ?? 'Erreur création zone' }, { status: 400 })

  // Récupérer les tâches de la zone source
  const { data: sourceTaches } = await admin
    .from('taches_template')
    .select('residence_id, libelle, ordre, jours_semaine, frequence_type, frequence_valeur, heure_debut, heure_fin, contrainte_externe, semaine_du_mois, mois_de_annee, duree_minutes')
    .eq('zone_id', zoneId)
    .order('ordre')

  let newTaches: unknown[] = []
  if (sourceTaches && sourceTaches.length > 0) {
    const payload = sourceTaches.map(t => ({
      ...t,
      zone_id: newZone.id,
      tache_liee_id: null, // FK vers une autre tâche — invalide dans la copie
    }))

    const { data: inserted, error: tachesErr } = await admin
      .from('taches_template')
      .insert(payload)
      .select()
    if (tachesErr) return NextResponse.json({ error: tachesErr.message }, { status: 400 })
    newTaches = inserted ?? []
  }

  return NextResponse.json({ zone: newZone, taches: newTaches })
}
