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

  // Paramètres société (commun aux deux modes)
  const { data: parametres } = await admin.from('parametres_societe')
    .select('taux_horaire_agent, cout_km, frais_generaux_mois')
    .limit(1)
    .maybeSingle()

  if (contratId) {
    // ── MODE CONTRAT ──────────────────────────────────────────────────────────
    const { data: contratRaw } = await admin.from('contrats_residences')
      .select('*')
      .eq('id', contratId)
      .eq('residence_id', id)
      .single()

    let taches: Record<string, unknown>[] = []
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

    const { data: intersReel } = await supabase.from('interventions')
      .select('heure_scan, heure_fin')
      .eq('residence_id', id)
      .eq('contrat_id', contratId)
      .eq('statut', 'terminee')
      .not('heure_scan', 'is', null)
      .not('heure_fin', 'is', null)
      .gte('date_prevue', dateLimitStr)

    const statsReel = buildStatsReel(intersReel ?? [])

    return NextResponse.json({ taches, contrat: contratRaw ?? null, parametres, statsReel })
  }

  // ── MODE GLOBAL (agrégé, tous les contrats actifs) ────────────────────────
  const { data: contratsActifs } = await admin.from('contrats_residences')
    .select('id, libelle, montant_mensuel, nb_interventions_mois, actif')
    .eq('residence_id', id)
    .eq('actif', true)
    .order('created_at', { ascending: true })

  const contrats = contratsActifs ?? []

  // CA agrégé = somme des montants mensuels
  const montantTotal = contrats.reduce((s, c) => s + (c.montant_mensuel ?? 0), 0)
  const contratAgg = {
    libelle: null,
    montant_mensuel: montantTotal,
    nb_interventions_mois: null,
  }

  // Tâches : toutes les zones de tous les contrats actifs
  let taches: Record<string, unknown>[] = []
  if (contrats.length > 0) {
    const contratIds = contrats.map(c => c.id)
    const { data: zones } = await admin.from('zones_residence')
      .select('id')
      .in('contrat_id', contratIds)
    const zoneIds = (zones ?? []).map((z: { id: string }) => z.id)
    if (zoneIds.length > 0) {
      const { data: t } = await admin.from('taches_template')
        .select('*')
        .in('zone_id', zoneIds)
        .order('zone_id').order('ordre')
      taches = t ?? []
    }
  }

  // Interventions réelles : toutes les interventions terminées de la résidence
  const { data: intersReel } = await supabase.from('interventions')
    .select('heure_scan, heure_fin')
    .eq('residence_id', id)
    .eq('statut', 'terminee')
    .not('heure_scan', 'is', null)
    .not('heure_fin', 'is', null)
    .gte('date_prevue', dateLimitStr)

  const statsReel = buildStatsReel(intersReel ?? [])

  return NextResponse.json({ taches, contrat: contratAgg, parametres, statsReel })
}

function buildStatsReel(
  rows: { heure_scan: string | null; heure_fin: string | null }[]
): { totalMin: number; count: number } | null {
  if (rows.length === 0) return null
  let totalMin = 0
  for (const i of rows) {
    if (!i.heure_scan || !i.heure_fin) continue
    const diff = (new Date(i.heure_fin).getTime() - new Date(i.heure_scan).getTime()) / 60000
    if (diff > 0 && diff < 600) totalMin += diff
  }
  return totalMin > 0 ? { totalMin, count: rows.length } : null
}
