import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types'

export default async function ManagerAgents() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: agents } = await supabase
    .from('profiles').select('*').eq('manager_id', user.id)
    .order('nom') as { data: Profile[] | null }

  const today = new Date().toISOString().split('T')[0]
  const agentIds = (agents ?? []).map(a => a.id)
  const { data: statsRaw } = await supabase
    .from('interventions')
    .select('agent_id,statut')
    .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('date_prevue', today)

  const statsParAgent: Record<string, { total: number; terminees: number }> = {}
  for (const i of (statsRaw ?? [])) {
    if (!statsParAgent[i.agent_id]) statsParAgent[i.agent_id] = { total: 0, terminees: 0 }
    statsParAgent[i.agent_id].total++
    if (i.statut === 'terminee') statsParAgent[i.agent_id].terminees++
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <h1 className="text-2xl font-bold">Mon équipe</h1>
        <p className="text-blue-300 text-sm mt-0.5">{agents?.length ?? 0} agent(s)</p>
      </div>

      <div className="p-4 md:p-8 pb-24 md:pb-8">
        <div className="space-y-3">
          {(agents ?? []).map(agent => {
            const stats = statsParAgent[agent.id] ?? { total: 0, terminees: 0 }
            return (
              <div key={agent.id} className="bg-white rounded-2xl border border-slate-100 p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#1A5FA8] flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {agent.prenom[0]}{agent.nom[0]}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">{agent.prenom} {agent.nom}</h3>
                    <p className="text-sm text-slate-500">{agent.email}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${agent.actif ? 'bg-green-400' : 'bg-slate-300'}`}/>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Aujourd\'hui', value: stats.total },
                    { label: 'Terminées',    value: stats.terminees },
                    { label: 'Taux',         value: stats.total ? `${Math.round(stats.terminees/stats.total*100)}%` : '—' },
                  ].map(s => (
                    <div key={s.label} className="text-center bg-slate-50 rounded-xl py-2">
                      <p className="text-lg font-bold text-[#1A5FA8]">{s.value}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {agent.vehicule && <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg">🚗 Véhicule</span>}
                  {agent.telephone && (
                    <a href={`tel:${agent.telephone}`}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#0BBFBF]/10 text-[#0A2E5A] rounded-lg font-medium hover:bg-[#0BBFBF]/20 transition-colors">
                      📞 {agent.telephone}
                    </a>
                  )}
                  {(agent.competences ?? []).map((c: string) => (
                    <span key={c} className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg">{c}</span>
                  ))}
                </div>
              </div>
            )
          })}

          {!agents?.length && (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-100">
              <p className="text-4xl mb-3">👥</p>
              <p>Aucun agent dans votre équipe.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
