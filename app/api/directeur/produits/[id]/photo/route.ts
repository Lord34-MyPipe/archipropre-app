import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'directeur') return NextResponse.json({ error: 'Accès réservé au directeur' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })

  const storagePath = `${id}/${Date.now()}_${file.name.replace(/[^a-z0-9._-]/gi, '_')}`

  const admin = await createAdminClient()
  const { error: uploadError } = await admin.storage
    .from('photos-produits')
    .upload(storagePath, file, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: publicData } = admin.storage
    .from('photos-produits')
    .getPublicUrl(storagePath)

  const photoUrl = publicData.publicUrl

  const { data: produit, error: dbErr } = await supabase
    .from('produits')
    .update({ photo_url: photoUrl })
    .eq('id', id)
    .select('id, nom, categorie, photo_url, actif, ordre')
    .single()
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ photo_url: photoUrl, produit })
}
