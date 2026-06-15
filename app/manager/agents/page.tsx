import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types'
import AgentsClient from '@/components/manager/AgentsClient'

export default async function ManagerAgents() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: agents } = await supabase
    .from('profiles')
    .select('*')
    .eq('manager_id', user.id)
    .order('nom') as { data: Profile[] | null }

  const today = new Date().toISOString().split('T')[0]
  const agentIds = (agents ?? []).map(a => a.id)

  const { data: statsRaw } = await supabase
    .from('interventions')
    .select('agent_id, statut')
    .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('date_prevue', today)

  const statsMap: Record<string, { total: number; terminees: number }> = {}
  for (const i of (statsRaw ?? [])) {
    if (!statsMap[i.agent_id]) statsMap[i.agent_id] = { total: 0, terminees: 0 }
    statsMap[i.agent_id].total++
    if (i.statut === 'terminee') statsMap[i.agent_id].terminees++
  }

  const agentsWithStats = (agents ?? []).map(a => ({
    ...a,
    stats: statsMap[a.id] ?? { total: 0, terminees: 0 },
  }))

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <h1 className="text-2xl font-bold">Mon équipe</h1>
        <p className="text-blue-300 text-sm mt-0.5">{agentsWithStats.length} agent(s)</p>
      </div>
      <AgentsClient agents={agentsWithStats} />
    </div>
  )
}
