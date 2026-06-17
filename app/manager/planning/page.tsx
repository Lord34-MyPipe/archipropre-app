export const dynamic = 'force-dynamic'

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

export default async function ManagerPlanning() {
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

  const { data: agents } = await supabase
    .from('profiles').select('id,nom,prenom')
    .eq('manager_id', user.id).eq('actif', true).order('nom')

  const agentIds = (agents ?? []).map(a => a.id)
  const ids = agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000']

  // Congés et absences des agents pour la semaine
  const [{ data: congesRaw }, { data: absencesRaw }] = await Promise.all([
    supabase.from('conges')
      .select('agent_id, date_debut, date_fin, statut, motif')
      .in('agent_id', ids)
      .lte('date_debut', fin).gte('date_fin', debut),
    supabase.from('absences')
      .select('agent_id, date_debut, date_fin, statut, motif')
      .in('agent_id', ids)
      .lte('date_debut', fin).gte('date_fin', debut),
  ])

  // Construit un Set "agentId|dateStr" pour les jours couverts par un congé ou absence validé
  const congeKeys = new Set<string>()
  const congeMotifs: Record<string, string> = {}
  const allConges = [...(congesRaw ?? []), ...(absencesRaw ?? [])]
  allConges.forEach(c => {
    const statutStr = (c.statut ?? '').toLowerCase()
    const isRejected = ['refuse','rejeté','rejete','annule','annulé'].some(s => statutStr.includes(s))
    if (isRejected) return
    const dStart = new Date(c.date_debut + 'T00:00:00')
    const dEnd   = new Date(c.date_fin   + 'T00:00:00')
    const cur = new Date(dStart)
    while (cur <= dEnd) {
      const ds = cur.toISOString().split('T')[0]
      const key = `${c.agent_id}|${ds}`
      congeKeys.add(key)
      if (!congeMotifs[key]) congeMotifs[key] = c.motif ?? 'Congé'
      cur.setDate(cur.getDate() + 1)
    }
  })

  // Source unique : table interventions (nouveau système)
  const { data: intersRaw } = await supabase.from('interventions')
    .select('id, agent_id, residence_id, date_prevue, heure_debut_prevue, heure_fin_prevue, statut, residences(nom)')
    .in('agent_id', ids)
    .gte('date_prevue', debut).lte('date_prevue', fin)
    .order('heure_debut_prevue')

  const inters = intersRaw ?? []
  const totalSemaine = inters.length

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Planning de la semaine</h1>
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

        {/* Légende */}
        <div className="flex gap-3 mt-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-400"/>
            <span className="text-xs text-blue-200">Planifiée</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-amber-400"/>
            <span className="text-xs text-blue-200">En cours</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-400"/>
            <span className="text-xs text-blue-200">Terminée</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-orange-300"/>
            <span className="text-xs text-blue-200">🏖️ Congé</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-red-400"/>
            <span className="text-xs text-blue-200">⚠️ Conflit congé</span>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-8 pb-24 md:pb-8 space-y-4">

        {totalSemaine === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-slate-600 font-medium">Aucune intervention cette semaine</p>
            <p className="text-slate-400 text-sm mt-1">
              Allez dans une résidence → générer le planning
            </p>
            <Link href="/manager/residences"
              className="inline-block mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
              Gérer les résidences →
            </Link>
          </div>
        )}

        {/* Grille hebdomadaire */}
        {totalSemaine > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 w-32 sticky left-0 bg-white">
                    Agent
                  </th>
                  {semaine.map((d, i) => {
                    const dateStr = d.toISOString().split('T')[0]
                    const isToday = dateStr === new Date().toISOString().split('T')[0]
                    return (
                      <th key={i} className={`px-2 py-3 text-center text-xs font-semibold w-24 ${isToday ? 'text-[#1A5FA8]' : 'text-slate-500'}`}>
                        <div>{JOURS[i]}</div>
                        <div className={`text-base font-bold mt-0.5 ${
                          isToday
                            ? 'w-7 h-7 rounded-full bg-[#1A5FA8] text-white flex items-center justify-center mx-auto'
                            : 'text-slate-800'
                        }`}>
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
                  })
                  if (!hasAnything) return null

                  return (
                    <tr key={agent.id}>
                      <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-50">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#1A5FA8] flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {agent.prenom[0]}{agent.nom[0]}
                          </div>
                          <span className="text-sm font-medium text-slate-700 truncate">
                            {agent.prenom}
                          </span>
                        </div>
                      </td>
                      {semaine.map((d, j) => {
                        const dateStr      = d.toISOString().split('T')[0]
                        const dayInters    = inters.filter(i => i.agent_id === agent.id && i.date_prevue === dateStr)
                        const isOnLeave    = congeKeys.has(`${agent.id}|${dateStr}`)
                        const leaveLabel   = congeMotifs[`${agent.id}|${dateStr}`] ?? 'Congé'
                        const hasConflict  = isOnLeave && dayInters.length > 0
                        return (
                          <td key={j} className={`px-1 py-2 align-top min-w-[80px] ${isOnLeave ? 'bg-orange-50/60' : ''}`}>
                            <div className="space-y-1">
                              {isOnLeave && (
                                <div className={`px-1.5 py-1 rounded-lg text-[10px] font-semibold leading-tight flex items-center gap-1 ${
                                  hasConflict
                                    ? 'bg-red-100 text-red-700 border border-red-300'
                                    : 'bg-orange-100 text-orange-700 border border-orange-200'
                                }`}>
                                  {hasConflict ? '⚠️' : '🏖️'}
                                  <span className="truncate">{hasConflict ? 'Conflit congé' : leaveLabel}</span>
                                </div>
                              )}
                              {dayInters.map(i => (
                                <div key={i.id}
                                  className={`px-1.5 py-1.5 rounded-lg text-[10px] font-medium leading-tight ${
                                    isOnLeave
                                      ? 'bg-red-50 text-red-800 border border-red-300'
                                      : (STATUT_BG[i.statut] ?? 'bg-slate-100 text-slate-600 border border-slate-200')
                                  }`}>
                                  <div className="truncate font-semibold">
                                    {(i as { residences?: { nom?: string } }).residences?.nom ?? '—'}
                                  </div>
                                  {i.heure_debut_prevue && (
                                    <div className="text-[9px] opacity-70 mt-0.5">
                                      {i.heure_debut_prevue.slice(0,5)}
                                      {(i as { heure_fin_prevue?: string | null }).heure_fin_prevue
                                        ? ` → ${(i as { heure_fin_prevue: string }).heure_fin_prevue.slice(0,5)}`
                                        : ' → ?'}
                                    </div>
                                  )}
                                  <div className="text-[9px] opacity-60 mt-0.5">
                                    {STATUT_LABEL[i.statut] ?? i.statut}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {/* Agents sans intervention cette semaine */}
                {(agents ?? []).filter(agent =>
                  !semaine.some(d => {
                    const ds = d.toISOString().split('T')[0]
                    return inters.some(i => i.agent_id === agent.id && i.date_prevue === ds)
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

                {!agents?.length && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-slate-400 text-sm">
                      Aucun agent dans votre équipe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Liste détaillée */}
        {totalSemaine > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">Détail de la semaine</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {semaine.map(d => {
                const dateStr       = d.toISOString().split('T')[0]
                const dayInters     = inters.filter(i => i.date_prevue === dateStr)
                const agentsEnConge = (agents ?? []).filter(a => congeKeys.has(`${a.id}|${dateStr}`))
                if (!dayInters.length && !agentsEnConge.length) return null
                return (
                  <div key={dateStr}>
                    <div className="px-5 py-2.5 bg-slate-50 flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        {d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
                      </p>
                      {dayInters.length > 0 && (
                        <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-full text-xs text-slate-500 font-medium">
                          {dayInters.length} intervention{dayInters.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {agentsEnConge.map(a => (
                        <span key={a.id} className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                          dayInters.some(i => i.agent_id === a.id)
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : 'bg-orange-100 text-orange-700 border border-orange-200'
                        }`}>
                          🏖️ {a.prenom} {a.nom}
                          {dayInters.some(i => i.agent_id === a.id) && (
                            <span className="text-red-600 font-bold"> ⚠️</span>
                          )}
                        </span>
                      ))}
                    </div>
                    {dayInters.map(i => {
                      const agent = (agents ?? []).find(a => a.id === i.agent_id)
                      return (
                        <div key={i.id} className="px-5 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#1A5FA8] flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {agent ? agent.prenom[0] + agent.nom[0] : '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {(i as { residences?: { nom?: string } }).residences?.nom ?? '—'}
                            </p>
                            <p className="text-xs text-slate-500">
                              {agent ? `${agent.prenom} ${agent.nom}` : ''}
                              {i.heure_debut_prevue ? ` · ${i.heure_debut_prevue.slice(0,5)}` : ''}
                              {i.heure_debut_prevue
                                ? ((i as { heure_fin_prevue?: string | null }).heure_fin_prevue
                                    ? ` → ${(i as { heure_fin_prevue: string }).heure_fin_prevue.slice(0,5)}`
                                    : ' → ?')
                                : ''}
                            </p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${STATUT_BG[i.statut] ?? 'bg-slate-100 text-slate-600'}`}>
                            {STATUT_LABEL[i.statut] ?? i.statut}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
