import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Profile, Intervention, Residence } from '@/lib/types'

type InterJoined = Intervention & { residences: Residence; profiles: Profile }

export default async function ManagerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: manager } = await supabase
    .from('profiles').select('*').eq('id', user.id).single() as { data: Profile | null }

  // Agents de l'équipe
  const { data: agents } = await supabase
    .from('profiles').select('*').eq('manager_id', user.id).eq('actif', true) as { data: Profile[] | null }

  const agentIds = (agents ?? []).map(a => a.id)
  const today    = new Date().toISOString().split('T')[0]

  const { data: interventions } = await supabase
    .from('interventions')
    .select('*, residences(*), profiles!interventions_agent_id_fkey(*)')
    .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('date_prevue', today)
    .order('heure_debut_prevue') as { data: InterJoined[] | null }

  const { data: alertes } = await supabase
    .from('alertes').select('*').eq('destinataire_id', user.id).eq('lue', false)
    .order('envoyee_at', { ascending: false })

  const inters = interventions ?? []
  const kpis = {
    total:      inters.length,
    enCours:    inters.filter(i => i.statut === 'en_cours').length,
    terminees:  inters.filter(i => i.statut === 'terminee').length,
    enRetard:   inters.filter(i => i.statut === 'non_demarree').length,
    disponibles: inters.filter(i => i.disponible_apres_fin).length,
  }

  const STATUT_COULEUR: Record<string, string> = {
    planifiee:    'bg-blue-100 text-blue-700',
    en_cours:     'bg-amber-100 text-amber-700',
    terminee:     'bg-green-100 text-green-700',
    non_demarree: 'bg-red-100 text-red-700',
    disponible:   'bg-purple-100 text-purple-700',
  }
  const STATUT_LABEL: Record<string, string> = {
    planifiee: 'Planifiée', en_cours: 'En cours',
    terminee: 'Terminée', non_demarree: 'En retard', disponible: 'Disponible',
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
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
            {alertes!.map(al => (
              <div key={al.id} className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                <span className="text-xl mt-0.5">🚨</span>
                <div className="flex-1">
                  <p className="font-semibold text-red-800 text-sm">{al.type.replace(/_/g,' ')}</p>
                  <p className="text-red-700 text-sm mt-0.5">{al.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total aujourd\'hui', n: kpis.total,     bg: 'bg-white',          icon: '📋' },
            { label: 'En cours',           n: kpis.enCours,   bg: 'bg-amber-50',       icon: '⚡' },
            { label: 'Terminées',          n: kpis.terminees, bg: 'bg-green-50',        icon: '✅' },
            { label: 'En retard',          n: kpis.enRetard,  bg: 'bg-red-50',          icon: '⚠️' },
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
              <span>🟢</span> Agents disponibles maintenant ({kpis.disponibles})
            </h2>
            <div className="space-y-2">
              {inters.filter(i => i.disponible_apres_fin).map(i => (
                <div key={i.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-[#0BBFBF]/20">
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">
                      {i.profiles?.prenom} {i.profiles?.nom}
                    </p>
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

        {/* Liste interventions du jour */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Interventions du jour</h2>
            <Link href="/manager/planning" className="text-sm text-[#1A5FA8] font-medium">Voir planning →</Link>
          </div>
          {!inters.length ? (
            <div className="px-5 py-8 text-center text-slate-400">
              <p className="text-3xl mb-2">📅</p>
              <p>Aucune intervention planifiée aujourd'hui.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {inters.map(i => (
                <div key={i.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] flex items-center justify-center shrink-0">
                    <span className="text-lg">🏢</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{i.residences?.nom}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {i.profiles?.prenom} {i.profiles?.nom}
                      {i.heure_debut_prevue ? ` · ${i.heure_debut_prevue.slice(0,5)}` : ''}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${STATUT_COULEUR[i.statut] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUT_LABEL[i.statut] ?? i.statut}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Équipe */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Mon équipe ({agents?.length ?? 0})</h2>
            <Link href="/manager/agents" className="text-sm text-[#1A5FA8] font-medium">Gérer →</Link>
          </div>
          <div className="divide-y divide-slate-50">
            {(agents ?? []).map(agent => {
              const agentInter = inters.filter(i => i.agent_id === agent.id)
              const statut = agentInter.find(i => i.statut === 'en_cours')
                ? 'en_cours'
                : agentInter.find(i => i.statut === 'terminee')
                ? 'terminee'
                : agentInter.length > 0 ? 'planifiee' : 'libre'

              const dotColor: Record<string,string> = {
                en_cours: 'bg-amber-400', terminee: 'bg-green-400',
                planifiee: 'bg-blue-400', libre: 'bg-slate-300'
              }
              return (
                <div key={agent.id} className="px-5 py-4 flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-[#1A5FA8] flex items-center justify-center text-white font-bold text-sm">
                      {agent.prenom[0]}{agent.nom[0]}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${dotColor[statut]}`}/>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-800 text-sm">{agent.prenom} {agent.nom}</p>
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
              <div className="px-5 py-8 text-center text-slate-400 text-sm">
                Aucun agent dans votre équipe.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
