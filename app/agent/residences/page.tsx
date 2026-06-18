import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence } from '@/lib/types'
import AgentResidencesClient from '@/components/agent/AgentResidencesClient'
import type { ResidenceMapItem } from '@/components/shared/ResidencesMap'

function mapStatut(s: string): 'terminee' | 'en_cours' | 'planifiee' {
  if (s === 'terminee') return 'terminee'
  if (s === 'en_cours') return 'en_cours'
  return 'planifiee'
}

export default async function AgentResidences() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })

  const [{ data: profile }, { data: todayInterventions }] = await Promise.all([
    supabase.from('profiles').select('residences_attitrees').eq('id', user.id).single(),
    supabase.from('interventions').select('id, residence_id, statut, heure_debut_prevue').eq('agent_id', user.id).eq('date_prevue', today),
  ])

  const attitreeIds: string[] = profile?.residences_attitrees ?? []
  const todayIds = (todayInterventions ?? []).map(i => i.residence_id).filter(Boolean) as string[]
  const allIds = [...new Set([...attitreeIds, ...todayIds])]

  let residencesWithMeta: ResidenceMapItem[] = []

  if (allIds.length > 0) {
    const { data: residences } = await supabase
      .from('residences')
      .select('*')
      .in('id', allIds)
      .order('nom') as { data: Residence[] | null }

    const statusByResidence = new Map(
      (todayInterventions ?? []).map(i => [i.residence_id, { statut: i.statut, heureDebut: i.heure_debut_prevue }])
    )

    residencesWithMeta = (residences ?? []).map(r => {
      const info = statusByResidence.get(r.id)
      return {
        ...r,
        interventionStatut: info ? mapStatut(info.statut) : null,
        heureDebut: info?.heureDebut ?? null,
      }
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-[#0A2E5A] text-white px-5 py-5">
        <h1 className="text-xl font-bold">Mes résidences</h1>
        <p className="text-blue-300 text-sm mt-0.5">{residencesWithMeta.length} résidence(s) assignée(s)</p>
      </div>
      <AgentResidencesClient residences={residencesWithMeta} />
    </div>
  )
}
