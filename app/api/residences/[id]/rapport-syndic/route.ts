import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { construireRapportSyndic, signerPhotos, isValidDate } from '@/lib/rapportSyndicData'

export const dynamic = 'force-dynamic'

// Rapport syndic (P3-2, étape S1 + S3) — vue manager live. Construction du
// payload et signature des photos déléguées à lib/rapportSyndicData.ts,
// partagée avec la génération de lien (S5) pour ne jamais diverger.

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id: residenceId } = await params
  const debut = req.nextUrl.searchParams.get('debut')
  const fin = req.nextUrl.searchParams.get('fin')
  const contratId = req.nextUrl.searchParams.get('contratId')

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

  payload.batiments = await signerPhotos(admin, payload.batiments)

  return NextResponse.json(payload)
}
