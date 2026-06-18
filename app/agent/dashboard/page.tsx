import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Intervention, Residence, Profile } from '@/lib/types'

type InterventionJoined = Intervention & { residences: Residence }

const STATUT_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  planifiee:    { label: 'Planifiée',    dot: 'bg-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-700' },
  en_cours:     { label: 'En cours',     dot: 'bg-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-700' },
  terminee:     { label: 'Terminée',     dot: 'bg-green-400',  bg: 'bg-green-50',  text: 'text-green-700' },
  non_demarree: { label: 'Non démarrée', dot: 'bg-red-400',    bg: 'bg-red-50',    text: 'text-red-700' },
  disponible:   { label: 'Disponible',   dot: 'bg-purple-400', bg: 'bg-purple-50', text: 'text-purple-700' },
}

function StatutBadge({ statut }: { statut: string }) {
  const c = STATUT_CONFIG[statut] ?? { label: statut, dot: 'bg-slate-400', bg: 'bg-slate-50', text: 'text-slate-700' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${statut === 'en_cours' ? 'pulse-dot' : ''}`} />
      {c.label}
    </span>
  )
}

export default async function AgentDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single() as { data: Profile | null }

  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })

  const { data: interventions } = await supabase
    .from('interventions')
    .select('*, residences(*)')
    .eq('agent_id', user.id)
    .eq('date_prevue', today)
    .order('heure_debut_prevue', { ascending: true }) as { data: InterventionJoined[] | null }

  const { data: alertes } = await supabase
    .from('alertes')
    .select('id')
    .eq('destinataire_id', user.id)
    .eq('lue', false)

  const enCours   = interventions?.filter(i => i.statut === 'en_cours')   ?? []
  const planifiees = interventions?.filter(i => i.statut === 'planifiee')  ?? []
  const terminees  = interventions?.filter(i => i.statut === 'terminee')   ?? []

  const prenom   = profile?.prenom ?? 'Agent'
  const h = parseInt(new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }), 10)
  const salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'

  return (
    <div className="fade-up min-h-screen">
      {/* Header dégradé */}
      <div className="px-5 pt-10 pb-8 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#0A2E5A 0%,#1A5FA8 100%)' }}>
        {/* Cercles décoratifs */}
        <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/5" />
        <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-[#0BBFBF]/10" />

        <div className="relative flex items-start justify-between mb-4">
          <div>
            <p className="text-blue-200 text-sm">{salut},</p>
            <h1 className="text-2xl font-bold text-white mt-0.5">{prenom} 👋</h1>
          </div>
          {(alertes?.length ?? 0) > 0 && (
            <div className="relative mt-1">
              <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/>
                </svg>
              </div>
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white font-bold flex items-center justify-center">
                {alertes?.length}
              </span>
            </div>
          )}
        </div>

        {/* Résumé du jour */}
        <div className="flex gap-3">
          {[
            { n: planifiees.length, label: 'Planifiée(s)', color: 'bg-white/10' },
            { n: enCours.length,    label: 'En cours',     color: 'bg-[#0BBFBF]/20' },
            { n: terminees.length,  label: 'Terminée(s)',  color: 'bg-green-500/20' },
          ].map(s => (
            <div key={s.label} className={`flex-1 ${s.color} rounded-2xl px-3 py-3 text-center`}>
              <p className="text-2xl font-bold text-white">{s.n}</p>
              <p className="text-[10px] text-blue-200 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* Intervention en cours */}
        {enCours.map(inter => (
          <Link key={inter.id} href={`/agent/intervention/${inter.id}`}>
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 active:scale-[0.98] transition-all">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 pulse-dot" />
                <span className="text-amber-700 text-sm font-semibold">En cours — continuer</span>
              </div>
              <p className="text-lg font-bold text-slate-800">{inter.residences?.nom}</p>
              <p className="text-sm text-slate-500 mt-0.5">{inter.residences?.adresse}</p>
              {inter.heure_debut_prevue && (
                <p className="text-xs text-slate-400 mt-1">
                  Prévu : {inter.heure_debut_prevue.slice(0,5)} → {inter.heure_fin_prevue?.slice(0,5)}
                </p>
              )}
            </div>
          </Link>
        ))}

        {/* Bouton scanner */}
        <Link href="/agent/scan">
          <button className="w-full h-14 rounded-2xl text-white font-semibold text-base flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-lg shadow-[#0BBFBF]/20"
            style={{ background: 'linear-gradient(135deg,#0BBFBF,#1A5FA8)' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/>
            </svg>
            Scanner un chantier
          </button>
        </Link>

        {/* Liste du jour */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Interventions du jour · {new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
          </h2>

          {!interventions?.length ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
              <p className="text-4xl mb-3">🎉</p>
              <p className="font-semibold text-slate-700">Aucune intervention aujourd'hui</p>
              <p className="text-sm text-slate-400 mt-1">Profitez de votre journée !</p>
            </div>
          ) : (
            <div className="space-y-3">
              {interventions.filter(i => i.statut !== 'en_cours').map(inter => (
                <Link key={inter.id} href={`/agent/intervention/${inter.id}`}>
                  <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm active:scale-[0.98] transition-all flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: '#EFF6FF' }}>
                      <svg className="w-6 h-6 text-[#1A5FA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{inter.residences?.nom}</p>
                      <p className="text-sm text-slate-500 truncate">{inter.residences?.adresse}</p>
                      {inter.heure_debut_prevue && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {inter.heure_debut_prevue.slice(0,5)}
                          {inter.heure_fin_prevue ? ` → ${inter.heure_fin_prevue.slice(0,5)}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StatutBadge statut={inter.statut} />
                      <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
