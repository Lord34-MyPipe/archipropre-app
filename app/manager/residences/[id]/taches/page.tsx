import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence, ZoneResidence, TacheTemplate, ContratResidence } from '@/lib/types'
import TachesClient from './TachesClient'

interface Props {
  params: Promise<{ id: string }>
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

export default async function TachesPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()

  const dateLimit = new Date()
  dateLimit.setDate(dateLimit.getDate() - 30)
  const dateLimitStr = dateLimit.toISOString().split('T')[0]

  const [r1, r2, r3, r4, r5, r6] = await Promise.all([
    supabase.from('residences').select('*').eq('id', id).eq('manager_id', user.id).single(),
    supabase.from('zones_residence').select('*').eq('residence_id', id).order('ordre'),
    supabase.from('taches_template').select('*').eq('residence_id', id).order('zone_id').order('ordre'),
    supabase.from('contrats_residences').select('*').eq('residence_id', id).eq('actif', true).maybeSingle(),
    admin.from('parametres_societe').select('*').limit(1).maybeSingle(),
    supabase.from('interventions')
      .select('heure_scan, heure_fin')
      .eq('residence_id', id)
      .eq('statut', 'terminee')
      .not('heure_scan', 'is', null)
      .not('heure_fin', 'is', null)
      .gte('date_prevue', dateLimitStr),
  ])

  if (!r1.data) redirect('/manager/residences')

  let statsReel: StatsReel | null = null
  const intersReel = r6.data ?? []
  if (intersReel.length > 0) {
    let totalMin = 0
    for (const i of intersReel) {
      const diff = (new Date(i.heure_fin as string).getTime() - new Date(i.heure_scan as string).getTime()) / 60000
      if (diff > 0 && diff < 600) totalMin += diff
    }
    if (totalMin > 0) statsReel = { totalMin, count: intersReel.length }
  }

  return (
    <TachesClient
      residence={r1.data as Residence}
      zones={(r2.data ?? []) as ZoneResidence[]}
      taches={(r3.data ?? []) as TacheTemplate[]}
      contrat={(r4.data ?? null) as ContratResidence | null}
      parametres={(r5.data ?? null) as ParametresSociete | null}
      statsReel={statsReel}
    />
  )
}
