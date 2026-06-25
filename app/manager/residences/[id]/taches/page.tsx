import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
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

  // Ownership check
  const { data: residence } = await supabase.from('residences')
    .select('id, nom').eq('id', id).eq('manager_id', user.id).single()
  if (!residence) redirect('/manager/residences')

  // Sans contratId → écran de sélection (empêche zones orphelines)
  if (!contratId) {
    const { data: contrats } = await admin.from('contrats_residences')
      .select('id, libelle, type_contrat, actif')
      .eq('residence_id', id)
      .eq('actif', true)
      .order('created_at', { ascending: true })
    return (
      <div className="min-h-screen bg-[#F4F7FB] flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-md w-full">
          <p className="text-xl font-bold text-[#0A2E5A] mb-1">{residence.nom}</p>
          <p className="text-slate-500 text-sm mb-6">
            Sélectionnez un contrat pour gérer ses tâches.
          </p>
          <div className="flex flex-col gap-3">
            {(contrats ?? []).map(c => (
              <Link
                key={c.id}
                href={`/manager/residences/${id}/taches?contratId=${c.id}`}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 hover:border-[#1A5FA8] hover:bg-[#EAF2FF] transition-colors"
              >
                <span className="font-semibold text-slate-700 text-sm">
                  {c.libelle ?? c.type_contrat ?? 'Contrat'}
                </span>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
              </Link>
            ))}
            {(!contrats || contrats.length === 0) && (
              <p className="text-slate-400 text-sm text-center py-4">
                Aucun contrat actif sur cette résidence.
              </p>
            )}
          </div>
          <Link
            href={`/manager/residences/${id}`}
            className="mt-6 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Retour à la fiche résidence
          </Link>
        </div>
      </div>
    )
  }

  const dateLimit = new Date()
  dateLimit.setDate(dateLimit.getDate() - 30)
  const dateLimitStr = dateLimit.toISOString().split('T')[0]

  // Ownership + params société (toujours en parallèle)
  const [r1, r5] = await Promise.all([
    supabase.from('residences').select('*').eq('id', id).eq('manager_id', user.id).single(),
    admin.from('parametres_societe').select('*').limit(1).maybeSingle(),
  ])
  if (!r1.data) redirect('/manager/residences')

  // contratId est toujours défini ici (le cas sans contratId retourne plus haut)
  const { data: zonesData } = await admin
    .from('zones_residence').select('*').eq('contrat_id', contratId).order('ordre')
  const zones = (zonesData ?? []) as ZoneResidence[]
  const zoneIds = zones.map(z => z.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const taches = (r3.data ?? []) as TacheTemplate[]
  const contrat = (r4.data ?? null) as ContratResidence | null
  const contratLibelle = contrat?.libelle ?? undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsSource: any[] = r6.data ?? []

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
