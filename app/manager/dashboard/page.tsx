import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Profile, Intervention, Residence, Absence, Conge } from '@/lib/types'
import InterventionsDuJourSection from '@/components/manager/InterventionsDuJourSection'
import AlerteReorganisationButton from '@/components/manager/AlerteReorganisationButton'

type InterJoined = Intervention & { residences: Residence; profiles: Profile }

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export default async function ManagerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: manager } = await supabase
    .from('profiles').select('*').eq('id', user.id).single() as { data: Profile | null }

  const { data: agents } = await supabase
    .from('profiles').select('*').eq('manager_id', user.id).eq('actif', true) as { data: Profile[] | null }

  const agentIds = (agents ?? []).map(a => a.id)
  const today    = new Date().toISOString().split('T')[0]
  const in7days  = addDays(today, 7)

  const [
    { data: interventions },
    { data: alertes },
    { data: absencesAujourd },
    { data: congesProchains },
    { data: absencesProchaines },
  ] = await Promise.all([
    supabase.from('interventions')
      .select('*, residences(*), profiles!interventions_agent_id_fkey(*)')
      .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('date_prevue', today)
      .order('heure_debut_prevue'),
    supabase.from('alertes').select('*').eq('destinataire_id', user.id).eq('lue', false)
      .order('envoyee_at', { ascending: false }),
    // Absences actives aujourd'hui
    supabase.from('absences').select('agent_id, date_debut, date_fin, type')
      .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
      .lte('date_debut', today).gte('date_fin', today).eq('valide', true),
    // Congés validés dans les 7 prochains jours
    supabase.from('conges').select('agent_id, date_debut, date_fin, statut')
      .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
      .lte('date_debut', in7days).gte('date_fin', today).eq('statut', 'valide'),
    // Absences dans les 7 prochains jours
    supabase.from('absences').select('agent_id, date_debut, date_fin, type')
      .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
      .lte('date_debut', in7days).gte('date_fin', today).eq('valide', true),
  ])

  const inters = (interventions ?? []) as InterJoined[]

  // Sets des agents absents aujourd'hui
  const absentsAujourdhuiIds = new Set((absencesAujourd ?? []).map(a => a.agent_id))
  // Sets des agents avec congé dans les 7 jours
  const congeProchainIds = new Set([
    ...(congesProchains ?? []).map(c => c.agent_id),
    ...(absencesProchaines ?? []).filter(a => !absentsAujourdhuiIds.has(a.agent_id)).map(a => a.agent_id),
  ])

  // Section "absences à venir cette semaine" — entrées uniques par agent
  const agentMap = new Map((agents ?? []).map(a => [a.id, a]))
  const absencesSeeds = [
    ...(absencesAujourd ?? []).map(a => ({ ...a, tableType: 'absence' as const })),
    ...(congesProchains ?? []).map(c => ({ ...c, type: 'conge' as const, tableType: 'conge' as const })),
    ...(absencesProchaines ?? []).filter(a => !absencesAujourd?.some(x => x.agent_id === a.agent_id)).map(a => ({ ...a, tableType: 'absence' as const })),
  ]
  // Dédupliquer par agent_id
  const seenAgent = new Set<string>()
  const absencesSemaine = absencesSeeds.filter(a => {
    if (seenAgent.has(a.agent_id)) return false
    seenAgent.add(a.agent_id)
    return true
  })

  const kpis = {
    total:       inters.length,
    enCours:     inters.filter(i => i.statut === 'en_cours').length,
    terminees:   inters.filter(i => i.statut === 'terminee').length,
    enRetard:    inters.filter(i => i.statut === 'non_demarree').length,
    disponibles: inters.filter(i => i.disponible_apres_fin).length,
  }

  const TYPE_LABELS: Record<string, string> = {
    maladie: 'Arrêt maladie', absence_justifiee: 'Absence justifiée',
    absence_injustifiee: 'Absence injustifiée', jour_ferie: 'Jour férié',
    formation: 'Formation', conge: 'Congés payés',
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <p className="text-blue-300 text-sm">Bonjour,</p>
        <h1 className="text-2xl font-bold mt-0.5">{manager?.prenom} {manager?.nom}</h1>
        <p className="text-blue-300 text-sm mt-1">
          {new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
        </p>
      </div>

      <div className="px-4 py-6 md:px-8 space-y-6 md:pb-6 pb-24">

        {/* Alertes */}
        {(alertes?.length ?? 0) > 0 && (
          <div className="space-y-2">
            {alertes!.map(al => {
              if (al.type === 'reorganisation_proposee') {
                return (
                  <div key={al.id} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                    <span className="text-xl mt-0.5">🤖</span>
                    <div className="flex-1">
                      <p className="font-semibold text-amber-800 text-sm">Réorganisation requise</p>
                      <p className="text-amber-700 text-sm mt-0.5">{al.message}</p>
                    </div>
                    <AlerteReorganisationButton alerteId={al.id} message={al.message ?? ''} />
                  </div>
                )
              }
              return (
                <div key={al.id} className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                  <span className="text-xl mt-0.5">🚨</span>
                  <div className="flex-1">
                    <p className="font-semibold text-red-800 text-sm">{al.type.replace(/_/g,' ')}</p>
                    <p className="text-red-700 text-sm mt-0.5">{al.message}</p>
                  </div>
                  {al.type === 'rapport_soumis' && al.intervention_id && (
                    <Link
                      href={`/manager/interventions/${al.intervention_id}/rapport`}
                      className="shrink-0 text-sm font-semibold whitespace-nowrap hover:underline"
                      style={{ color: '#0BBFBF' }}
                    >
                      Voir le rapport →
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Absences à venir cette semaine */}
        {absencesSemaine.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-100 flex items-center gap-2">
              <span className="text-lg">📅</span>
              <h2 className="font-semibold text-amber-800">Absences cette semaine</h2>
              <span className="ml-auto px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-semibold">
                {absencesSemaine.length}
              </span>
            </div>
            <div className="divide-y divide-amber-100">
              {absencesSemaine.map((a, i) => {
                const agent = agentMap.get(a.agent_id)
                const isToday = a.date_debut <= today && a.date_fin >= today
                return (
                  <div key={i} className="px-5 py-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${isToday ? 'bg-red-500' : 'bg-amber-400'}`}>
                      {agent?.prenom?.[0]}{agent?.nom?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{agent?.prenom} {agent?.nom}</p>
                      <p className="text-xs text-amber-700">
                        {TYPE_LABELS[a.type as string] ?? a.type} · du{' '}
                        {new Date(a.date_debut + 'T00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
                        {' au '}
                        {new Date(a.date_fin + 'T00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
                      </p>
                    </div>
                    {isToday && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold shrink-0">
                        Aujourd'hui
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="px-5 py-3 border-t border-amber-100">
              <Link href="/manager/agents" className="text-sm text-amber-700 font-medium hover:underline">
                Gérer les congés & absences →
              </Link>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total aujourd'hui", n: kpis.total,     bg: 'bg-white',    icon: '📋' },
            { label: 'En cours',          n: kpis.enCours,   bg: 'bg-amber-50', icon: '⚡' },
            { label: 'Terminées',         n: kpis.terminees, bg: 'bg-green-50', icon: '✅' },
            { label: 'En retard',         n: kpis.enRetard,  bg: 'bg-red-50',   icon: '⚠️' },
          ].map(kpi => (
            <div key={kpi.label} className={`${kpi.bg} rounded-2xl p-4 border border-slate-100`}>
              <span className="text-2xl">{kpi.icon}</span>
              <p className="text-3xl font-bold text-slate-800 mt-2">{kpi.n}</p>
              <p className="text-xs text-slate-500 mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Agents disponibles */}
        {kpis.disponibles > 0 && (
          <div className="bg-[#0BBFBF]/10 border border-[#0BBFBF]/30 rounded-2xl p-4">
            <h2 className="font-semibold text-[#0A2E5A] mb-3 flex items-center gap-2">
              <span>🟢</span> Agents disponibles ({kpis.disponibles})
            </h2>
            <div className="space-y-2">
              {inters.filter(i => i.disponible_apres_fin).map(i => (
                <div key={i.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-[#0BBFBF]/20">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{i.profiles?.prenom} {i.profiles?.nom}</p>
                    <p className="text-xs text-slate-400">Libre depuis {
                      i.heure_fin
                        ? new Date(i.heure_fin).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
                        : '—'
                    }</p>
                  </div>
                  {i.profiles?.telephone && (
                    <a href={`tel:${i.profiles.telephone}`}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#0BBFBF] text-white rounded-xl text-xs font-semibold">
                      📞 Appeler
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interventions du jour */}
        <InterventionsDuJourSection
          initialInters={inters as Parameters<typeof InterventionsDuJourSection>[0]['initialInters']}
          absentIds={[...absentsAujourdhuiIds]}
        />

        {/* Équipe avec badges absence */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Mon équipe ({agents?.length ?? 0})</h2>
            <Link href="/manager/agents" className="text-sm text-[#1A5FA8] font-medium">Gérer →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {(agents ?? []).map(agent => {
              const agentInter = inters.filter(i => i.agent_id === agent.id)
              const isAbsent   = absentsAujourdhuiIds.has(agent.id)
              const hasConge   = !isAbsent && congeProchainIds.has(agent.id)
              const statut = agentInter.find(i => i.statut === 'en_cours') ? 'en_cours'
                : agentInter.find(i => i.statut === 'terminee') ? 'terminee'
                : agentInter.length > 0 ? 'planifiee' : 'libre'
              const dotColor: Record<string,string> = {
                en_cours: 'bg-amber-400', terminee: 'bg-green-400',
                planifiee: 'bg-blue-400', libre: 'bg-slate-300'
              }
              return (
                <div key={agent.id} className={`px-5 py-4 flex items-center gap-3 ${isAbsent ? 'opacity-60' : ''}`}>
                  <div className="relative">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${isAbsent ? 'bg-slate-400' : 'bg-[#1A5FA8]'}`}>
                      {agent.prenom[0]}{agent.nom[0]}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isAbsent ? 'bg-red-500' : dotColor[statut]}`}/>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-medium text-slate-800 text-sm">{agent.prenom} {agent.nom}</p>
                      {isAbsent && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full font-semibold">Absent</span>
                      )}
                      {hasConge && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-semibold">Congé &lt;7j</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{agentInter.length} intervention(s) ce jour</p>
                  </div>
                  {agent.telephone && (
                    <a href={`tel:${agent.telephone}`}
                      className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-[#0BBFBF] hover:text-white transition-colors">
                      📞
                    </a>
                  )}
                </div>
              )
            })}
            {!agents?.length && (
              <div className="px-5 py-8 text-center text-slate-400 text-sm">Aucun agent.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
