import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

async function assertDirecteur() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autorisé', status: 401, supabase: null }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'directeur') return { error: 'Accès réservé au directeur', status: 403, supabase: null }
  return { error: null, status: 200, supabase }
}

export async function GET() {
  const { error, status, supabase } = await assertDirecteur()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { data: produits, error: dbErr } = await supabase
    .from('produits')
    .select('id, nom, categorie, photo_url, actif, ordre')
    .order('ordre', { ascending: true })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ produits: produits ?? [] })
}

export async function POST(req: NextRequest) {
  const { error, status, supabase } = await assertDirecteur()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { nom, categorie, ordre } = await req.json()
  if (!nom?.trim() || !categorie) {
    return NextResponse.json({ error: 'nom et categorie requis' }, { status: 400 })
  }

  let ordreVal = ordre
  if (ordreVal == null) {
    const { data: maxRow } = await supabase
      .from('produits')
      .select('ordre')
      .order('ordre', { ascending: false })
      .limit(1)
      .maybeSingle()
    ordreVal = (maxRow?.ordre ?? 0) + 1
  }

  const { data: produit, error: dbErr } = await supabase
    .from('produits')
    .insert({ nom: nom.trim(), categorie, ordre: ordreVal })
    .select('id, nom, categorie, photo_url, actif, ordre')
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ produit }, { status: 201 })
}
