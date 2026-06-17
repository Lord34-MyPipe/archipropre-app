import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { geocoder } from '@/lib/geocodage'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { adresse } = await req.json() as { adresse?: string }
  if (!adresse?.trim()) {
    return NextResponse.json({ error: 'Champ "adresse" manquant' }, { status: 400 })
  }

  const resultat = await geocoder(adresse)

  if (!resultat) {
    return NextResponse.json({ error: 'Adresse introuvable ou Nominatim indisponible' }, { status: 404 })
  }

  return NextResponse.json(resultat)
}
