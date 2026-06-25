import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contratId = req.nextUrl.searchParams.get('contratId') ?? undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const admin = await createAdminClient()

  // Ownership
  const { data: res } = await admin.from('residences').select('id').eq('id', id).eq('manager_id', user.id).single()
  if (!res) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const dateLimit = new Date()
  dateLimit.setDate(dateLimit.getDate() - 30)
  const dateLimitStr = dateLimit.toISOString().split('T')[0]

  // Contrat — explicite si contratId fourni, sinon guess (rétrocompat)
  let contrat: Record<string, unknown> | null = null
  if (contratId) {
    const { data } = await admin.from('contrats_residences')
      .select('*')
      .eq('id', contratId)
      .eq('residence_id', id)
      .single()
    contrat = data ?? null
  } else {
    const { data } = await admin.from('contrats_residences')
      .select('*')
      .eq('residence_id', id)
      .eq('actif', true)
      .maybeSingle()
    contrat = data ?? null
  }

  // Tâches — filtrées par zones du contrat si contratId fourni
  let taches: Record<string, unknown>[] = []
  if (contratId) {
    const { data: zones } = await admin.from('zones_residence')
      .select('id')
      .eq('contrat_id', contratId)
    const zoneIds = (zones ?? []).map((z: { id: string }) => z.id)
    if (zoneIds.length > 0) {
      const { data: t } = await admin.from('taches_template')
        .select('*')
        .in('zone_id', zoneIds)
        .order('zone_id').order('ordre')
      taches = t ?? []
    }
  } else {
    const { data: t } = await admin.from('taches_template')
      .select('*')
      .eq('residence_id', id)
      .order('zone_id').order('ordre')
    taches = t ?? []
  }

  // Paramètres société
  const { data: parametres } = await admin.from('parametres_societe')
    .select('taux_horaire_agent, cout_km, frais_generaux_mois')
    .limit(1)
    .maybeSingle()

  // Interventions réelles (30 derniers jours) — scopées par contrat
  let intersQuery = supabase.from('interventions')
    .select('heure_scan, heure_fin')
    .eq('residence_id', id)
    .eq('statut', 'terminee')
    .not('heure_scan', 'is', null)
    .not('heure_fin', 'is', null)
    .gte('date_prevue', dateLimitStr)

  if (contratId) intersQuery = intersQuery.eq('contrat_id', contratId)

  const { data: intersReel } = await intersQuery

  let statsReel: { totalMin: number; count: number } | null = null
  const intersReelData = intersReel ?? []
  if (intersReelData.length > 0) {
    let totalMin = 0
    for (const i of intersReelData) {
      const diff = (new Date(i.heure_fin as string).getTime() - new Date(i.heure_scan as string).getTime()) / 60000
      if (diff > 0 && diff < 600) totalMin += diff
    }
    if (totalMin > 0) statsReel = { totalMin, count: intersReelData.length }
  }

  return NextResponse.json({ taches, contrat, parametres, statsReel })
}
