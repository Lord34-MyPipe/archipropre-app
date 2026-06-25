import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import PlanningClient from './PlanningClient'
import type { Creneau } from '@/components/manager/ContratModal'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ contratId?: string }>
}

export interface InterventionRow {
  id: string
  date_prevue: string
  heure_debut_prevue: string | null
  heure_fin_prevue: string | null
  statut: string
  agent_id: string
  agent_nom: string | null
  contrat_id: string | null
  contrat_libelle: string | null
}

export default async function PlanningPage({ params, searchParams }: Props) {
  const { id } = await params
  const { contratId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()

  // Résidence (ownership)
  const { data: residence } = await supabase.from('residences')
    .select('id, nom, agent_prefere_id, actif')
    .eq('id', id).eq('manager_id', user.id).single()
  if (!residence) redirect('/manager/residences')

  // Contrat : explicite si contratId fourni, sinon créneaux du plus récent (affichage uniquement)
  let creneaux: Creneau[] = []
  let contratLibelle: string | undefined
  let agentSourceId: string | null = residence.agent_prefere_id

  if (contratId) {
    const { data: contrat } = await admin.from('contrats_residences')
      .select('id, libelle, creneaux_acceptes, agent_prefere_id')
      .eq('id', contratId)
      .eq('residence_id', id)
      .single()
    if (contrat) {
      creneaux = (contrat.creneaux_acceptes ?? []) as Creneau[]
      contratLibelle = contrat.libelle ?? undefined
      agentSourceId = contrat.agent_prefere_id ?? residence.agent_prefere_id
    }
  } else {
    const { data: contrat } = await admin.from('contrats_residences')
      .select('creneaux_acceptes')
      .eq('residence_id', id)
      .eq('actif', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    creneaux = (contrat?.creneaux_acceptes ?? []) as Creneau[]
  }

  // Agent (pour l'en-tête en vue par contrat)
  let agentNom: string | null = null
  if (agentSourceId && contratId) {
    const { data: agent } = await admin.from('profiles')
      .select('prenom, nom').eq('id', agentSourceId).single()
    if (agent) agentNom = `${agent.prenom} ${agent.nom}`
  }

  // Interventions — tous statuts pour l'agenda (pas seulement planifiée/en_cours)
  let interventionsQuery = admin.from('interventions')
    .select('id, date_prevue, heure_debut_prevue, heure_fin_prevue, statut, agent_id, contrat_id')
    .eq('residence_id', id)
    .in('statut', ['planifiee', 'en_cours', 'terminee', 'validee', 'annulee', 'non_demarree'])
    .order('date_prevue', { ascending: true })

  if (contratId) interventionsQuery = interventionsQuery.eq('contrat_id', contratId)

  const { data: rawInters } = await interventionsQuery

  // Noms des agents
  const agentIds = [...new Set((rawInters ?? []).map(i => i.agent_id).filter(Boolean))]
  const agentMap = new Map<string, string>()
  if (agentIds.length > 0) {
    const { data: agents } = await admin.from('profiles')
      .select('id, prenom, nom').in('id', agentIds)
    ;(agents ?? []).forEach(a => agentMap.set(a.id, `${a.prenom} ${a.nom}`))
  }

  // Libellés des contrats (pour l'agenda multi-contrats)
  const contratIds = [...new Set((rawInters ?? []).map(i => i.contrat_id).filter(Boolean))]
  const contratLabelMap = new Map<string, string>()
  if (contratIds.length > 0) {
    const { data: contrats } = await admin.from('contrats_residences')
      .select('id, libelle').in('id', contratIds)
    ;(contrats ?? []).forEach(c => contratLabelMap.set(c.id, c.libelle ?? c.id.slice(0, 8)))
  }

  const interventions: InterventionRow[] = (rawInters ?? []).map(i => ({
    id:                  i.id,
    date_prevue:         i.date_prevue,
    heure_debut_prevue:  i.heure_debut_prevue ?? null,
    heure_fin_prevue:    i.heure_fin_prevue   ?? null,
    statut:              i.statut,
    agent_id:            i.agent_id,
    agent_nom:           agentMap.get(i.agent_id) ?? null,
    contrat_id:          i.contrat_id ?? null,
    contrat_libelle:     i.contrat_id ? (contratLabelMap.get(i.contrat_id) ?? null) : null,
  }))

  // Stats (pour l'en-tête)
  const now        = new Date().toISOString().split('T')[0]
  const monthStart = now.slice(0, 7) + '-01'
  const monthEnd   = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  const prochaine  = interventions.find(i => i.date_prevue >= now && i.statut === 'planifiee')?.date_prevue ?? null
  const ceMois     = interventions.filter(i =>
    i.date_prevue >= monthStart && i.date_prevue <= monthEnd && i.statut === 'planifiee'
  ).length

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
      contratId={contratId}
      contratLibelle={contratLibelle}
    />
  )
}
