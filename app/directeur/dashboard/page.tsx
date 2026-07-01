import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { HardHat, ClipboardList, Building2, Zap, CheckCircle2, AlertTriangle } from 'lucide-react'

export default async function DirecteurDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const [
    { count: totalAgents },
    { count: totalManagers },
    { count: totalResidences },
    { data: intersJour },
    { data: intersMois },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'agent').eq('actif', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'manager').eq('actif', true),
    supabase.from('residences').select('*', { count: 'exact', head: true }).eq('actif', true),
    supabase.from('interventions').select('statut').eq('date_prevue', today),
    supabase.from('interventions').select('statut').gte('date_prevue', startOfMonth),
  ])

  const kpisJour = {
    total:     intersJour?.length ?? 0,
    enCours:   intersJour?.filter(i => i.statut === 'en_cours').length   ?? 0,
    terminees: intersJour?.filter(i => i.statut === 'terminee').length   ?? 0,
    retards:   intersJour?.filter(i => i.statut === 'non_demarree').length ?? 0,
  }
  const kpisMois = {
    total:     intersMois?.length ?? 0,
    terminees: intersMois?.filter(i => i.statut === 'terminee').length ?? 0,
  }
  const tauxMois = kpisMois.total > 0 ? Math.round((kpisMois.terminees / kpisMois.total) * 100) : 0

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-8 py-8">
        <p className="text-blue-300 text-sm">Direction générale</p>
        <h1 className="text-3xl font-bold mt-0.5">Vue d'ensemble</h1>
        <p className="text-blue-300 text-sm mt-1">
          {new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
        </p>
      </div>

      <div className="px-8 py-8 space-y-8">
        {/* KPIs société */}
        <section>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Société</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Agents actifs',    n: totalAgents ?? 0,    icon: <HardHat className="w-8 h-8" />,       color: 'from-[#0A2E5A] to-[#1A5FA8]' },
              { label: 'Managers',          n: totalManagers ?? 0,  icon: <ClipboardList className="w-8 h-8" />, color: 'from-[#1A5FA8] to-[#0BBFBF]' },
              { label: 'Résidences',        n: totalResidences ?? 0,icon: <Building2 className="w-8 h-8" />,     color: 'from-[#0BBFBF] to-[#059669]' },
            ].map(k => (
              <div key={k.label}
                className={`bg-gradient-to-br ${k.color} text-white rounded-2xl p-6`}>
                <p className="mb-2 opacity-80">{k.icon}</p>
                <p className="text-4xl font-bold">{k.n}</p>
                <p className="text-white/70 text-sm mt-1">{k.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* KPIs du jour */}
        <section>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Aujourd'hui</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Interventions',  n: kpisJour.total,     bg: 'bg-white',        icon: <ClipboardList className="w-6 h-6 text-slate-400" /> },
              { label: 'En cours',       n: kpisJour.enCours,   bg: 'bg-amber-50',     icon: <Zap className="w-6 h-6 text-amber-400" /> },
              { label: 'Terminées',      n: kpisJour.terminees, bg: 'bg-green-50',     icon: <CheckCircle2 className="w-6 h-6 text-green-500" /> },
              { label: 'En retard',      n: kpisJour.retards,   bg: 'bg-red-50',       icon: <AlertTriangle className="w-6 h-6 text-red-400" /> },
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-2xl border border-slate-100 p-5`}>
                <p className="mb-2">{k.icon}</p>
                <p className="text-3xl font-bold text-slate-800">{k.n}</p>
                <p className="text-slate-500 text-sm mt-1">{k.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* KPIs du mois */}
        <section>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Ce mois</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-6">
              <p className="text-slate-500 text-sm mb-1">Total interventions</p>
              <p className="text-4xl font-bold text-slate-800">{kpisMois.total}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6">
              <p className="text-slate-500 text-sm mb-1">Terminées</p>
              <p className="text-4xl font-bold text-green-600">{kpisMois.terminees}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-6">
              <p className="text-slate-500 text-sm mb-1">Taux de complétion</p>
              <div className="flex items-end gap-2 mt-1">
                <p className="text-4xl font-bold text-[#0BBFBF]">{tauxMois}%</p>
              </div>
              <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#0BBFBF] rounded-full transition-all" style={{ width: `${tauxMois}%` }}/>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
