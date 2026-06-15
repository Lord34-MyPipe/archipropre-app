import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const STATUT_BG: Record<string, string> = {
  planifiee:    'bg-blue-100 text-blue-700 border border-blue-200',
  en_cours:     'bg-amber-100 text-amber-700 border border-amber-200',
  terminee:     'bg-green-100 text-green-700 border border-green-200',
  non_demarree: 'bg-red-100 text-red-700 border border-red-200',
}
const STATUT_LABEL: Record<string, string> = {
  planifiee: 'Planifiée', en_cours: 'En cours', terminee: 'Terminée', non_demarree: 'En retard',
}
const JOURS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

interface Props {
  searchParams: Promise<{ manager?: string }>
}

export default async function DirecteurPlanning({ searchParams }: Props) {
  const { manager: filterManagerId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Semaine courante (lundi → dimanche)
  const lundi = new Date()
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7))
  const semaine = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi)
    d.setDate(lundi.getDate() + i)
    return d
  })
  const debut = semaine[0].toISOString().split('T')[0]
  const fin   = semaine[6].toISOString().split('T')[0]

  // Tous les managers pour le filtre
  const { data: managers } = await supabase.from('profiles')
    .select('id, nom, prenom').eq('role', 'manager').eq('actif', true).order('nom')

  // Tous les agents (ou filtrés par manager)
  let agentsQuery = supabase.from('profiles').select('id,nom,prenom,manager_id').eq('role', 'agent').eq('actif', true).order('nom')
  if (filterManagerId) agentsQuery = agentsQuery.eq('manager_id', filterManagerId)
  const { data: agents } = await agentsQuery

  const agentIds = (agents ?? []).map(a => a.id)
  const ids = agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000']

  // Tous les plannings publiés (ou filtrés par manager)
  let planQuery = supabase.from('plannings').select('id').eq('statut', 'publie')
  if (filterManagerId) planQuery = planQuery.eq('manager_id', filterManagerId)
  const { data: allPlannings } = await planQuery
  const planningIds = (allPlannings ?? []).map(p => p.id)

  // Congés et absences
  const [{ data: congesRaw }, { data: absencesRaw }] = await Promise.all([
    supabase.from('conges').select('agent_id, date_debut, date_fin, statut, motif')
      .in('agent_id', ids).lte('date_debut', fin).gte('date_fin', debut),
    supabase.from('absences').select('agent_id, date_debut, date_fin, statut, motif')
      .in('agent_id', ids).lte('date_debut', fin).gte('date_fin', debut),
  ])

  const congeKeys = new Set<string>()
  const congeMotifs: Record<string, string> = {}
  ;[...(congesRaw ?? []), ...(absencesRaw ?? [])].forEach(c => {
    const s = (c.statut ?? '').toLowerCase()
    if (['refuse','rejeté','rejete','annule','annulé'].some(x => s.includes(x))) return
    const cur = new Date(c.date_debut + 'T00:00:00')
    const end_ = new Date(c.date_fin + 'T00:00:00')
    while (cur <= end_) {
      const ds = cur.toISOString().split('T')[0]
      const key = `${c.agent_id}|${ds}`
      congeKeys.add(key)
      if (!congeMotifs[key]) congeMotifs[key] = c.motif ?? 'Congé'
      cur.setDate(cur.getDate() + 1)
    }
  })

  // Interventions
  const [{ data: intersRaw }, planifieesResult] = await Promise.all([
    supabase.from('interventions')
      .select('id, agent_id, date_prevue, heure_debut_prevue, statut, residences(nom)')
      .in('agent_id', ids).gte('date_prevue', debut).lte('date_prevue', fin).order('heure_debut_prevue'),
    planningIds.length > 0
      ? supabase.from('interventions_planifiees')
          .select('id, agent_id, date, heure_debut, heure_fin, recurrence, residence_id, residences(nom)')
          .in('planning_id', planningIds).in('agent_id', ids)
          .gte('date', debut).lte('date', fin).order('heure_debut')
      : Promise.resolve({ data: [] as unknown as null, error: null }),
  ])

  const inters = intersRaw ?? []
  const seen = new Set<string>()
  const planifiees = (planifieesResult.data ?? []).filter(p => {
    const key = `${p.agent_id}|${p.date}|${p.residence_id}`
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  const realKeys = new Set(inters.map(i => `${i.agent_id}|${i.date_prevue}|${(i as { residence_id?: string }).residence_id ?? ''}`))
  const planifieesFiltered = planifiees.filter(p => !realKeys.has(`${p.agent_id}|${p.date}|${p.residence_id}`))

  const totalSemaine = inters.length + planifieesFiltered.length

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Planning — toutes les équipes</h1>
            <p className="text-blue-300 text-sm mt-1">
              {semaine[0].toLocaleDateString('fr-FR',{day:'numeric',month:'long'})} –{' '}
              {semaine[6].toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-bold">{totalSemaine}</p>
            <p className="text-blue-300 text-xs">interventions</p>
          </div>
        </div>
      </div>

      {/* Filtre manager */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-slate-500 font-medium">Filtrer par manager :</span>
        <Link href="/directeur/planning"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${!filterManagerId ? 'bg-[#0A2E5A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Tous
        </Link>
        {(managers ?? []).map(m => (
          <Link key={m.id} href={`/directeur/planning?manager=${m.id}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filterManagerId === m.id ? 'bg-[#0A2E5A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {m.prenom} {m.nom}
          </Link>
        ))}
      </div>

      <div className="p-4 md:p-8 pb-8 space-y-4">
        {totalSemaine === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-slate-600 font-medium">Aucune intervention cette semaine</p>
          </div>
        )}

        {totalSemaine > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 w-36 sticky left-0 bg-white">Agent</th>
                  {semaine.map((d, i) => {
                    const dateStr = d.toISOString().split('T')[0]
                    const isToday = dateStr === new Date().toISOString().split('T')[0]
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
                {(agents ?? []).map(agent => {
                  const hasAnything = semaine.some(d => {
                    const ds = d.toISOString().split('T')[0]
                    return inters.some(i => i.agent_id === agent.id && i.date_prevue === ds)
                        || planifieesFiltered.some(p => p.agent_id === agent.id && p.date === ds)
                        || congeKeys.has(`${agent.id}|${ds}`)
                  })
                  if (!hasAnything) return null
                  return (
                    <tr key={agent.id}>
                      <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-50">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#1A5FA8] flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {agent.prenom[0]}{agent.nom[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">{agent.prenom}</p>
                            {!filterManagerId && (
                              <p className="text-[10px] text-slate-400 truncate">
                                {(managers ?? []).find(m => m.id === (agent as { manager_id?: string }).manager_id)?.prenom ?? ''}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      {semaine.map((d, j) => {
                        const dateStr = d.toISOString().split('T')[0]
                        const dayInters   = inters.filter(i => i.agent_id === agent.id && i.date_prevue === dateStr)
                        const dayPlanifie = planifieesFiltered.filter(p => p.agent_id === agent.id && p.date === dateStr)
                        const isOnLeave   = congeKeys.has(`${agent.id}|${dateStr}`)
                        const hasConflict = isOnLeave && (dayInters.length > 0 || dayPlanifie.length > 0)
                        return (
                          <td key={j} className={`px-1 py-2 align-top min-w-[80px] ${isOnLeave ? 'bg-orange-50/60' : ''}`}>
                            <div className="space-y-1">
                              {isOnLeave && (
                                <div className={`px-1.5 py-1 rounded-lg text-[10px] font-semibold leading-tight flex items-center gap-1 ${hasConflict ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-orange-100 text-orange-700 border border-orange-200'}`}>
                                  {hasConflict ? '⚠️' : '🏖️'}
                                  <span className="truncate">{hasConflict ? 'Conflit' : congeMotifs[`${agent.id}|${dateStr}`] ?? 'Congé'}</span>
                                </div>
                              )}
                              {dayInters.map(i => (
                                <div key={i.id} className={`px-1.5 py-1.5 rounded-lg text-[10px] font-medium leading-tight ${isOnLeave ? 'bg-red-50 text-red-800 border border-red-300' : (STATUT_BG[i.statut] ?? 'bg-slate-100 text-slate-600 border border-slate-200')}`}>
                                  <div className="truncate font-semibold">{(i as { residences?: { nom?: string } }).residences?.nom ?? '—'}</div>
                                  {i.heure_debut_prevue && <div className="text-[9px] opacity-70 mt-0.5">{i.heure_debut_prevue.slice(0,5)}</div>}
                                  <div className="text-[9px] opacity-60 mt-0.5">{STATUT_LABEL[i.statut] ?? i.statut}</div>
                                </div>
                              ))}
                              {dayPlanifie.map(p => {
                                const isCH = p.recurrence === 'contrainte_horaire'
                                return (
                                  <div key={p.id} className={`px-1.5 py-1.5 rounded-lg text-[10px] font-medium leading-tight ${isOnLeave ? 'bg-red-50 text-red-800 border border-red-300' : isCH ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-[#0BBFBF]/10 text-[#0A5F5F] border border-[#0BBFBF]/30'}`}>
                                    <div className="truncate font-semibold">{(p as { residences?: { nom?: string } }).residences?.nom ?? '—'}</div>
                                    {p.heure_debut && <div className="text-[9px] opacity-80 mt-0.5">{String(p.heure_debut).slice(0,5)}{p.heure_fin ? ` → ${String(p.heure_fin).slice(0,5)}` : ''}</div>}
                                    <div className="text-[9px] opacity-60 mt-0.5">{isOnLeave ? '⚠️ Conflit' : isCH ? '🕐 Horaire' : '📅 Planifié'}</div>
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {(agents ?? []).filter(agent =>
                  !semaine.some(d => {
                    const ds = d.toISOString().split('T')[0]
                    return inters.some(i => i.agent_id === agent.id && i.date_prevue === ds)
                        || planifieesFiltered.some(p => p.agent_id === agent.id && p.date === ds)
                        || congeKeys.has(`${agent.id}|${ds}`)
                  })
                ).map(agent => (
                  <tr key={`empty-${agent.id}`}>
                    <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-50">
                      <div className="flex items-center gap-2 opacity-40">
                        <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {agent.prenom[0]}{agent.nom[0]}
                        </div>
                        <span className="text-sm font-medium text-slate-500 truncate">{agent.prenom}</span>
                      </div>
                    </td>
                    {semaine.map((_, j) => (
                      <td key={j} className="px-1 py-3">
                        <div className="h-4 flex items-center justify-center">
                          <div className="w-1 h-1 rounded-full bg-slate-200"/>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
