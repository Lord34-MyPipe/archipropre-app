import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profil } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profil || !['manager', 'directeur'].includes(profil.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { data: residences } = await supabase
    .from('residences').select('id').eq('manager_id', user.id)

  const residenceIds = residences?.map((r: { id: string }) => r.id) ?? []
  if (residenceIds.length === 0) return NextResponse.json({ commandes: [] })

  const { data: commandes, error } = await supabase
    .from('commandes_produits')
    .select(`
      id,
      statut,
      created_at,
      residence_id,
      agent_id,
      contrat_id,
      residences(nom),
      contrats_residences(libelle),
      profiles!agent_id(prenom, nom, mode_deplacement),
      lignes_commande(
        id,
        type_ligne,
        produit_id,
        quantite,
        localisation,
        photo_avant_path,
        produits(nom)
      )
    `)
    .in('statut', ['en_attente', 'commande'])
    .in('residence_id', residenceIds)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ commandes: commandes ?? [] })
}
