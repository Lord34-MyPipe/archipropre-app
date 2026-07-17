import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { construireRapportSyndic, isValidDate } from '@/lib/rapportSyndicData'

export const dynamic = 'force-dynamic'

// Rapport syndic (P3-2, étape S5) — création d'un lien web sécurisé. Le
// snapshot fige le payload S1 (mêmes données, même construction) à l'instant
// présent. Si avec_photos=false, les entrées photos sont RETIRÉES du JSON
// stocké (pas juste masquées à l'affichage) — défense en profondeur.
// Aucune signed URL n'est stockée ici : seuls les chemins storage bruts le
// sont, signés à la volée à chaque vue de la page publique.

interface RouteContext { params: Promise<{ id: string }> }

// GET — liste des liens déjà générés pour cette résidence (sans le snapshot,
// juste les métadonnées) : permet au manager de voir/révoquer ses liens.
export async function GET(req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id: residenceId } = await params
  const admin = await createAdminClient()

  const { data: residence } = await admin
    .from('residences')
    .select('id')
    .eq('id', residenceId)
    .eq('manager_id', user.id)
    .maybeSingle()
  if (!residence) return NextResponse.json({ error: 'Résidence introuvable' }, { status: 404 })

  const { data: liens } = await admin
    .from('rapports_syndic_liens')
    .select('id, token, periode_debut, periode_fin, avec_photos, actif, created_at')
    .eq('residence_id', residenceId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ liens: liens ?? [] })
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id: residenceId } = await params
  const body = await req.json().catch(() => ({})) as {
    debut?: string; fin?: string; contratId?: string | null; avecPhotos?: boolean
  }
  const { debut, fin, contratId, avecPhotos = true } = body

  if (!isValidDate(debut) || !isValidDate(fin)) {
    return NextResponse.json({ error: 'Paramètres debut/fin requis (format YYYY-MM-DD)' }, { status: 400 })
  }
  if (debut > fin) {
    return NextResponse.json({ error: 'debut doit être antérieur ou égal à fin' }, { status: 400 })
  }

  const admin = await createAdminClient()

  // Ownership : la résidence doit appartenir à ce manager
  const { data: residence } = await admin
    .from('residences')
    .select('id')
    .eq('id', residenceId)
    .eq('manager_id', user.id)
    .maybeSingle()
  if (!residence) return NextResponse.json({ error: 'Résidence introuvable' }, { status: 404 })

  const payload = await construireRapportSyndic(admin, { residenceId, debut, fin, contratId })
  if (!payload) return NextResponse.json({ error: 'Résidence introuvable' }, { status: 404 })

  // Garde-fou "sans photos" : retirer physiquement les entrées, pas les cacher.
  const batimentsSnapshot = avecPhotos
    ? payload.batiments
    : payload.batiments.map(b => ({ ...b, photos: [] }))

  const snapshot = { ...payload, batiments: batimentsSnapshot }

  const { data: lien, error } = await admin
    .from('rapports_syndic_liens')
    .insert({
      residence_id:  residenceId,
      contrat_id:    contratId || null,
      periode_debut: debut,
      periode_fin:   fin,
      snapshot,
      avec_photos:   avecPhotos,
      created_by:    user.id,
    })
    .select('token')
    .single()

  if (error || !lien) return NextResponse.json({ error: error?.message ?? 'Échec de la création du lien' }, { status: 500 })

  const url = `${req.nextUrl.origin}/rapport/${lien.token}`
  return NextResponse.json({ token: lien.token, url })
}
