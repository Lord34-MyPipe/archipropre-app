export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import CatalogueClient from './CatalogueClient'

export interface Produit {
  id: string
  nom: string
  categorie: 'produit' | 'consommable' | 'materiel'
  photo_url: string | null
  actif: boolean
  ordre: number
}

export default async function CataloguePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'directeur') redirect('/directeur/dashboard')

  const { data } = await supabase
    .from('produits')
    .select('id, nom, categorie, photo_url, actif, ordre')
    .order('ordre', { ascending: true })

  return <CatalogueClient initialProduits={(data ?? []) as Produit[]} />
}
