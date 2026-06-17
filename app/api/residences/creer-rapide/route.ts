import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['manager', 'directeur'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json() as {
    nom?:               string
    adresse?:           string
    lat?:               number | null
    lng?:               number | null
    adresse_normalisee?: string
  }

  const nom     = body.nom?.trim()
  const adresse = (body.adresse_normalisee ?? body.adresse)?.trim()

  if (!nom)     return NextResponse.json({ error: 'Champ "nom" manquant' },     { status: 400 })
  if (!adresse) return NextResponse.json({ error: 'Champ "adresse" manquant' }, { status: 400 })

  const admin = await createAdminClient()

  const { data: residence, error } = await admin
    .from('residences')
    .insert({
      nom,
      adresse,
      lat:        body.lat  ?? null,
      lng:        body.lng  ?? null,
      manager_id: user.id,
      actif:      true,
    })
    .select()
    .single()

  if (error) {
    console.error('[creer-rapide] Supabase insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(residence, { status: 201 })
}
