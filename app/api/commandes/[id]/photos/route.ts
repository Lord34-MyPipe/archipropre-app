import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: commandeId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profil } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profil || !['manager', 'directeur'].includes(profil.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // Vérifier ownership via résidence
  const { data: cmd } = await supabase
    .from('commandes_produits')
    .select('id, residences(manager_id)')
    .eq('id', commandeId)
    .maybeSingle()
  if (!cmd) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  const residenceRaw = (cmd as Record<string, unknown>).residences
  const res = Array.isArray(residenceRaw) ? residenceRaw[0] : residenceRaw
  if ((res as { manager_id: string } | null)?.manager_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { data: lignes } = await supabase
    .from('lignes_commande')
    .select('id, photo_avant_path, photo_apres_path')
    .eq('commande_id', commandeId)

  const paths = (lignes ?? [])
    .flatMap(l => [l.photo_avant_path, l.photo_apres_path])
    .filter(Boolean) as string[]

  if (paths.length === 0) return NextResponse.json({ photos: {} })

  const admin = await createAdminClient()
  const photos: Record<string, string> = {}

  await Promise.all(
    paths.map(async (path) => {
      const { data } = await admin.storage
        .from('photos-ampoules')
        .createSignedUrl(path, 3600)
      if (data?.signedUrl) photos[path] = data.signedUrl
    }),
  )

  return NextResponse.json({ photos })
}
