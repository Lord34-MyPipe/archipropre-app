import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import PlanningClient from './PlanningClient'
import type { Creneau } from '@/components/manager/ContratModal'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export interface InterventionRow {
  id: string
  date_prevue: string
  heure_debut_prevue: string | null
  heure_fin_prevue: string | null
  statut: string
  agent_id: string
  agent_nom: string | null
}

export default async function PlanningPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()

  // Résidence (ownership)
  const { data: residence } = await supabase.from('residences')
    .select('id, nom, agent_prefere_id, actif')
    .eq('id', id).eq('manager_id', user.id).single()
  if (!residence) redirect('/manager/residences')

  // Agent attitré
  let agentNom: string | null = null
  if (residence.agent_prefere_id) {
    const { data: agent } = await admin.from('profiles')
      .select('prenom, nom').eq('id', residence.agent_prefere_id).single()
    if (agent) agentNom = `${agent.prenom} ${agent.nom}`
  }

  // Créneaux du contrat actif
  const { data: contrat } = await admin.from('contrats_residences')
    .select('creneaux_acceptes')
    .eq('residence_id', id)
    .eq('actif', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const creneaux: Creneau[] = contrat?.creneaux_acceptes ?? []

  // Interventions planifiées et en cours
  const { data: rawInters } = await admin.from('interventions')
    .select('id, date_prevue, heure_debut_prevue, heure_fin_prevue, statut, agent_id')
    .eq('residence_id', id)
    .in('statut', ['planifiee', 'en_cours'])
    .order('date_prevue', { ascending: true })

  // Nom des agents
  const agentIds = [...new Set((rawInters ?? []).map(i => i.agent_id).filter(Boolean))]
  const agentMap = new Map<string, string>()
  if (agentIds.length > 0) {
    const { data: agents } = await admin.from('profiles')
      .select('id, prenom, nom').in('id', agentIds)
    ;(agents ?? []).forEach(a => agentMap.set(a.id, `${a.prenom} ${a.nom}`))
  }

  const interventions: InterventionRow[] = (rawInters ?? []).map(i => ({
    id:                  i.id,
    date_prevue:         i.date_prevue,
    heure_debut_prevue:  i.heure_debut_prevue ?? null,
    heure_fin_prevue:    i.heure_fin_prevue   ?? null,
    statut:              i.statut,
    agent_id:            i.agent_id,
    agent_nom:           agentMap.get(i.agent_id) ?? null,
  }))

  // Stats
  const now       = new Date().toISOString().split('T')[0]
  const monthStart = now.slice(0, 7) + '-01'
  const monthEnd   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  const prochaine  = interventions.find(i => i.date_prevue >= now)?.date_prevue ?? null
  const ceMois     = interventions.filter(i => i.date_prevue >= monthStart && i.date_prevue <= monthEnd).length

  return (
    <PlanningClient
      residenceId={id}
      residenceNom={residence.nom}
      residenceActif={residence.actif}
      agentNom={agentNom}
      creneaux={creneaux}
      interventions={interventions}
      total={interventions.length}
      prochaine={prochaine}
      ceMois={ceMois}
    />
  )
}
