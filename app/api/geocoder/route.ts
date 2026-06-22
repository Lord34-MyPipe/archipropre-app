import { NextRequest, NextResponse } from 'next/server'
import { geocoder } from '@/lib/geocodage'
import { createClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const adresse = req.nextUrl.searchParams.get('adresse')
  if (!adresse) return NextResponse.json({ error: 'adresse manquante' }, { status: 400 })

  const result = await geocoder(adresse)
  return NextResponse.json(result ?? { error: 'introuvable' })
}
