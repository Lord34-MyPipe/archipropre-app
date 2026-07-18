import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

// GET — lecture seule des taux de référence société, accessible manager ET
// directeur (contrairement à /api/directeur/parametres qui est réservée au
// directeur et gère aussi l'écriture des coûts de production).
// Sert AnalyseContratWizard étape 1 (indicateur d'écart, item 3) quand
// aucun contrat n'existe encore pour la résidence (pas de contratId à
// interroger via /api/residences/[id]/contrats/[contratId]).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'directeur'].includes(profile.role))
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const admin = await createAdminClient()
  const { data } = await admin.from('parametres_societe')
    .select('taux_horaire_facturation_defaut, taux_horaire_cible')
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    tauxBase:  data?.taux_horaire_facturation_defaut ?? 25,
    tauxCible: data?.taux_horaire_cible ?? 30,
  })
}
