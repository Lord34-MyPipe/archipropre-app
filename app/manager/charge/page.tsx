import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ChargeClient from './ChargeClient'

export interface ChargeAgent {
  agent_id: string
  nom_complet: string
  capacite_theorique: number
  seuil_cible_pct: number
  mode_deplacement: string | null
  secteur_libelle: string | null
  heures_conges: number
  heures_absences: number
  heures_nettoyage: number
  heures_trajets_est: number
  capacite_disponible: number
  taux_remplissage_pct: number
  binome_nom: string | null
  binome_heures_hebdo: number | null
}

export default async function ChargePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') redirect('/login')

  const admin = await createAdminClient()

  // Récupère les IDs des agents de ce manager
  const { data: myAgents } = await supabase
    .from('profiles')
    .select('id')
    .eq('manager_id', user.id)
    .eq('role', 'agent')
    .eq('actif', true)

  const agentIds = (myAgents ?? []).map(a => a.id)

  let agents: ChargeAgent[] = []
  if (agentIds.length > 0) {
    const { data } = await admin
      .from('v_charge_agent')
      .select('*')
      .in('agent_id', agentIds)
    agents = (data ?? []) as ChargeAgent[]

    // Enrichir avec le nom du binôme
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, binome_agent_id, nom, prenom')
      .in('id', agentIds)
    const binomeIds = (profiles ?? []).map(p => p.binome_agent_id).filter(Boolean) as string[]
    let binomeProfiles: { id: string; nom: string; prenom: string; contrat_heures_hebdo: number }[] = []
    if (binomeIds.length > 0) {
      const { data: bp } = await admin.from('profiles').select('id, nom, prenom, contrat_heures_hebdo').in('id', binomeIds)
      binomeProfiles = (bp ?? []) as { id: string; nom: string; prenom: string; contrat_heures_hebdo: number }[]
    }
    agents = agents.map(a => {
      const p = profiles?.find(x => x.id === a.agent_id)
      const b = p?.binome_agent_id ? binomeProfiles.find(x => x.id === p.binome_agent_id) : null
      return {
        ...a,
        binome_nom:          b ? `${b.prenom} ${b.nom}` : null,
        binome_heures_hebdo: b ? b.contrat_heures_hebdo : null,
      }
    })
  }

  return <ChargeClient agents={agents} managerId={user.id} />
}
