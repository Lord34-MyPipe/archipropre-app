import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence, ZoneResidence, TacheTemplate, ContratResidence } from '@/lib/types'
import TachesClient from './TachesClient'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ contratId?: string }>
}

export interface ParametresSociete {
  taux_horaire_agent: number
  cout_km: number
  frais_generaux_mois: number
}
export interface StatsReel {
  totalMin: number
  count: number
}

export default async function TachesPage({ params, searchParams }: Props) {
  const { id } = await params
  const { contratId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()

  const dateLimit = new Date()
  dateLimit.setDate(dateLimit.getDate() - 30)
  const dateLimitStr = dateLimit.toISOString().split('T')[0]

  // Ownership + params société (toujours en parallèle)
  const [r1, r5] = await Promise.all([
    supabase.from('residences').select('*').eq('id', id).eq('manager_id', user.id).single(),
    admin.from('parametres_societe').select('*').limit(1).maybeSingle(),
  ])
  if (!r1.data) redirect('/manager/residences')

  let zones: ZoneResidence[]
  let taches: TacheTemplate[]
  let contrat: ContratResidence | null
  let contratLibelle: string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let statsSource: any[] = []

  if (contratId) {
    // Zones de ce contrat (nécessaire avant les tâches pour avoir les IDs)
    const { data: zonesData } = await admin
      .from('zones_residence').select('*').eq('contrat_id', contratId).order('ordre')
    zones = (zonesData ?? []) as ZoneResidence[]
    const zoneIds = zones.map(z => z.id)

    const [r3, r4, r6] = await Promise.all([
      zoneIds.length > 0
        ? admin.from('taches_template').select('*').in('zone_id', zoneIds).order('zone_id').order('ordre')
        : { data: [] },
      admin.from('contrats_residences').select('*').eq('id', contratId).single(),
      supabase.from('interventions')
        .select('heure_scan, heure_fin')
        .eq('residence_id', id)
        .eq('contrat_id', contratId)
        .eq('statut', 'terminee')
        .not('heure_scan', 'is', null)
        .not('heure_fin', 'is', null)
        .gte('date_prevue', dateLimitStr),
    ])

    taches = (r3.data ?? []) as TacheTemplate[]
    contrat = (r4.data ?? null) as ContratResidence | null
    contratLibelle = contrat?.libelle ?? undefined
    statsSource = r6.data ?? []
  } else {
    const [r2, r3, r4, r6] = await Promise.all([
      supabase.from('zones_residence').select('*').eq('residence_id', id).order('ordre'),
      supabase.from('taches_template').select('*').eq('residence_id', id).order('zone_id').order('ordre'),
      supabase.from('contrats_residences').select('*').eq('residence_id', id).eq('actif', true).maybeSingle(),
      supabase.from('interventions')
        .select('heure_scan, heure_fin')
        .eq('residence_id', id)
        .eq('statut', 'terminee')
        .not('heure_scan', 'is', null)
        .not('heure_fin', 'is', null)
        .gte('date_prevue', dateLimitStr),
    ])

    zones = (r2.data ?? []) as ZoneResidence[]
    taches = (r3.data ?? []) as TacheTemplate[]
    contrat = (r4.data ?? null) as ContratResidence | null
    statsSource = r6.data ?? []
  }

  let statsReel: StatsReel | null = null
  if (statsSource.length > 0) {
    let totalMin = 0
    for (const i of statsSource) {
      const diff = (new Date(i.heure_fin as string).getTime() - new Date(i.heure_scan as string).getTime()) / 60000
      if (diff > 0 && diff < 600) totalMin += diff
    }
    if (totalMin > 0) statsReel = { totalMin, count: statsSource.length }
  }

  return (
    <TachesClient
      residence={r1.data as Residence}
      zones={zones}
      taches={taches}
      contrat={contrat}
      parametres={(r5.data ?? null) as ParametresSociete | null}
      statsReel={statsReel}
      contratId={contratId}
      contratLibelle={contratLibelle}
    />
  )
}
