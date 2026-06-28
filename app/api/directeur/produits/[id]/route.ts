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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { error, status, supabase } = await assertDirecteur()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const allowed: Record<string, unknown> = {}
  if (body.nom      !== undefined) allowed.nom      = String(body.nom).trim()
  if (body.categorie !== undefined) allowed.categorie = body.categorie
  if (body.actif    !== undefined) allowed.actif    = Boolean(body.actif)
  if (body.ordre    !== undefined) allowed.ordre    = Number(body.ordre)

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à modifier' }, { status: 400 })
  }

  const { data: produit, error: dbErr } = await supabase
    .from('produits')
    .update(allowed)
    .eq('id', id)
    .select('id, nom, categorie, photo_url, actif, ordre')
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ produit })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { error, status, supabase } = await assertDirecteur()
  if (error || !supabase) return NextResponse.json({ error }, { status })

  // Vérifier qu'aucune ligne_commande ne référence ce produit
  const { count } = await supabase
    .from('lignes_commande')
    .select('id', { count: 'exact', head: true })
    .eq('produit_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Ce produit est référencé dans des commandes existantes' },
      { status: 409 },
    )
  }

  const { error: dbErr } = await supabase.from('produits').delete().eq('id', id)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
