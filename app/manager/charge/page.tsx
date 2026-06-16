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
  }

  return <ChargeClient agents={agents} managerId={user.id} />
}
