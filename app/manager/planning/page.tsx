import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function ManagerPlanning() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const lundi = new Date()
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7))
  const semaine = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi)
    d.setDate(lundi.getDate() + i)
    return d
  })

  const { data: agents } = await supabase
    .from('profiles').select('id,nom,prenom').eq('manager_id', user.id).eq('actif', true)

  const agentIds = (agents ?? []).map(a => a.id)
  const debut = semaine[0].toISOString().split('T')[0]
  const fin   = semaine[6].toISOString().split('T')[0]

  const { data: inters } = await supabase
    .from('interventions')
    .select('*, residences(nom)')
    .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('date_prevue', debut)
    .lte('date_prevue', fin)

  const JOURS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
  const STATUT_BG: Record<string,string> = {
    planifiee:'bg-blue-100 text-blue-700', en_cours:'bg-amber-100 text-amber-700',
    terminee:'bg-green-100 text-green-700', non_demarree:'bg-red-100 text-red-700',
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <h1 className="text-2xl font-bold">Planning de la semaine</h1>
        <p className="text-blue-300 text-sm mt-1">
          {semaine[0].toLocaleDateString('fr-FR',{day:'numeric',month:'long'})} –{' '}
          {semaine[6].toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}
        </p>
      </div>

      <div className="p-4 md:p-8 pb-24 md:pb-8">
        {/* Grille semaine */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 w-32">Agent</th>
                {semaine.map((d, i) => {
                  const isToday = d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
                  return (
                    <th key={i} className={`px-2 py-3 text-center text-xs font-semibold w-24 ${isToday ? 'text-[#1A5FA8]' : 'text-slate-500'}`}>
                      <div>{JOURS[i]}</div>
                      <div className={`text-base font-bold mt-0.5 ${isToday ? 'w-7 h-7 rounded-full bg-[#1A5FA8] text-white flex items-center justify-center mx-auto' : 'text-slate-800'}`}>
                        {d.getDate()}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(agents ?? []).map(agent => (
                <tr key={agent.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#1A5FA8] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {agent.prenom[0]}{agent.nom[0]}
                      </div>
                      <span className="text-sm font-medium text-slate-700 truncate">{agent.prenom}</span>
                    </div>
                  </td>
                  {semaine.map((d, j) => {
                    const dateStr = d.toISOString().split('T')[0]
                    const dayInters = (inters ?? []).filter(i => i.agent_id === agent.id && i.date_prevue === dateStr)
                    return (
                      <td key={j} className="px-1 py-2 align-top">
                        <div className="space-y-1">
                          {dayInters.map(i => (
                            <div key={i.id} className={`px-1.5 py-1 rounded-lg text-[10px] font-medium truncate ${STATUT_BG[i.statut] ?? 'bg-slate-100 text-slate-600'}`}>
                              {(i as { residences?: { nom?: string } }).residences?.nom ?? '—'}
                            </div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {!agents?.length && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400 text-sm">Aucun agent dans votre équipe.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
