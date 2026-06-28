export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Intervention, Residence, Profile } from '@/lib/types'
import { wazeUrl } from '@/lib/navigation'
import PassageCarte from './PassageCarte'

const ADRESSE_SIEGE_DEFAUT = '123 Rue de la Bandido, 34160 Castries'

type InterventionJoined = Intervention & {
  residences: Residence
  contrats_residences: { libelle: string | null } | null
}

// ── Helpers date (toujours en Europe/Paris, jamais new Date() brut pour dériver) ──

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
}

function labelJourLong(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z')
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
}

// ── Statut badge ─────────────────────────────────────────────────────────────

const STATUT_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  planifiee:    { label: 'Planifiée',    dot: 'bg-blue-400',   bg: 'bg-blue-50',   text: 'text-blue-700' },
  en_cours:     { label: 'En cours',     dot: 'bg-amber-400',  bg: 'bg-amber-50',  text: 'text-amber-700' },
  terminee:     { label: 'Terminée',     dot: 'bg-green-400',  bg: 'bg-green-50',  text: 'text-green-700' },
  non_demarree: { label: 'Non démarrée', dot: 'bg-red-400',    bg: 'bg-red-50',    text: 'text-red-700' },
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

// ── Page ─────────────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function AgentDashboard({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single() as { data: Profile | null }

  // Date du jour en Europe/Paris
  const todayStr  = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
  const maxDateStr = addDays(todayStr, 7)

  // Date sélectionnée — bornée [aujourd'hui, J+7]
  const sp = await searchParams
  let selectedDate = sp.date ?? todayStr
  if (selectedDate < todayStr)  selectedDate = todayStr
  if (selectedDate > maxDateStr) selectedDate = maxDateStr

  const isToday  = selectedDate === todayStr
  const prevDate = addDays(selectedDate, -1)
  const nextDate = addDays(selectedDate, 1)
  const labelJour = isToday ? 'Aujourd\'hui' : labelJourLong(selectedDate)

  // Interventions du jour sélectionné
  const { data: interventions } = await supabase
    .from('interventions')
    .select('*, residences(*), contrats_residences(libelle)')
    .eq('agent_id', user.id)
    .eq('date_prevue', selectedDate)
    .order('heure_debut_prevue', { ascending: true }) as { data: InterventionJoined[] | null }

  // Passages siège du jour sélectionné
  const [{ data: passagesRaw }, adminClient] = await Promise.all([
    supabase
      .from('passages_siege')
      .select('id, heure_prevue, motif, statut')
      .eq('agent_id', user.id)
      .eq('date', selectedDate)
      .in('statut', ['planifie', 'confirme'])
      .eq('est_livraison_manager', false)
      .order('heure_prevue', { ascending: true }),
    createAdminClient(),
  ])
  const { data: paramsRaw } = await adminClient
    .from('parametres_societe').select('adresse_siege').limit(1).maybeSingle()
  const adresseSiege = (paramsRaw as Record<string, unknown> | null)?.adresse_siege as string | null
    ?? ADRESSE_SIEGE_DEFAUT

  type PassageSiege = {
    id: string; heure_prevue: string; motif: string; statut: string; adresse_siege: string
  }
  const passages = ((passagesRaw ?? []) as Record<string, unknown>[]).map(p => ({
    id:            p.id as string,
    heure_prevue:  p.heure_prevue as string,
    motif:         p.motif as string,
    statut:        p.statut as string,
    adresse_siege: adresseSiege,
  }))

  const { data: alertes } = await supabase
    .from('alertes')
    .select('id')
    .eq('destinataire_id', user.id)
    .eq('lue', false)

  const enCours    = interventions?.filter(i => i.statut === 'en_cours')   ?? []
  const planifiees = interventions?.filter(i => i.statut === 'planifiee')   ?? []
  const terminees  = interventions?.filter(i => i.statut === 'terminee')    ?? []

  type Item = { kind: 'intervention'; data: InterventionJoined } | { kind: 'passage'; data: PassageSiege }
  const byHeure = (a: Item, b: Item) => {
    const ha = a.kind === 'intervention' ? (a.data.heure_debut_prevue ?? '23:59') : a.data.heure_prevue
    const hb = b.kind === 'intervention' ? (b.data.heure_debut_prevue ?? '23:59') : b.data.heure_prevue
    return ha.localeCompare(hb)
  }
  const todayItems: Item[] = [
    ...(interventions?.filter(i => i.statut !== 'en_cours') ?? []).map(data => ({ kind: 'intervention' as const, data })),
    ...passages.map(data => ({ kind: 'passage' as const, data })),
  ].sort(byHeure)
  const futurItems: Item[] = [
    ...(interventions ?? []).map(data => ({ kind: 'intervention' as const, data })),
    ...passages.map(data => ({ kind: 'passage' as const, data })),
  ].sort(byHeure)

  const prenom = profile?.prenom ?? 'Agent'
  const h = parseInt(new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }), 10)
  const salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'

  return (
    <div className="fade-up min-h-screen">
      {/* Header dégradé */}
      <div className="px-5 pt-10 pb-8 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg,#0A2E5A 0%,#1A5FA8 100%)' }}>
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

        {/* KPIs — aujourd'hui uniquement */}
        {isToday && (
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
        )}

        {/* KPI futur — nb interventions + heure de début */}
        {!isToday && (interventions?.length ?? 0) > 0 && (
          <div className="bg-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
            <p className="text-2xl font-bold text-white">{interventions!.length}</p>
            <div>
              <p className="text-blue-200 text-xs">intervention{interventions!.length > 1 ? 's' : ''} planifiée{interventions!.length > 1 ? 's' : ''}</p>
              {interventions![0]?.heure_debut_prevue && (
                <p className="text-white text-sm font-semibold">
                  1er RDV à {interventions![0].heure_debut_prevue.slice(0, 5)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-5 space-y-4">

        {/* ── Navigation date ── */}
        <div className="flex items-center gap-2">
          {/* Flèche précédente — désactivée sur aujourd'hui */}
          {isToday ? (
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
              </svg>
            </div>
          ) : (
            <Link href={`/agent/dashboard?date=${prevDate}`}
              className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-50 transition-colors shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
              </svg>
            </Link>
          )}

          {/* Libellé central */}
          <div className="flex-1 text-center">
            <p className="font-bold text-slate-800 text-base capitalize">{labelJour}</p>
            {!isToday && (
              <Link href="/agent/dashboard" className="text-xs font-medium" style={{ color: '#0BBFBF' }}>
                ← Retour à aujourd'hui
              </Link>
            )}
          </div>

          {/* Flèche suivante — désactivée sur J+7 */}
          {selectedDate === maxDateStr ? (
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
              </svg>
            </div>
          ) : (
            <Link href={`/agent/dashboard?date=${nextDate}`}
              className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:bg-slate-50 transition-colors shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
              </svg>
            </Link>
          )}
        </div>

        {/* ── Mode aujourd'hui : intervention en cours ── */}
        {isToday && enCours.map(inter => (
          <Link key={inter.id} href={`/agent/intervention/${inter.id}`}>
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 active:scale-[0.98] transition-all">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 pulse-dot" />
                <span className="text-amber-700 text-sm font-semibold">En cours — continuer</span>
              </div>
              <p className="text-lg font-bold text-slate-800">{inter.residences?.nom}</p>
              {inter.contrats_residences?.libelle && (
                <p className="text-sm font-semibold mt-0.5" style={{ color: '#0BBFBF' }}>{inter.contrats_residences.libelle}</p>
              )}
              <p className="text-sm text-slate-500 mt-0.5">{inter.residences?.adresse}</p>
              {inter.heure_debut_prevue && (
                <p className="text-xs text-slate-400 mt-1">
                  Prévu : {inter.heure_debut_prevue.slice(0,5)} → {inter.heure_fin_prevue?.slice(0,5)}
                </p>
              )}
            </div>
          </Link>
        ))}

        {/* ── Bouton scanner ── */}
        {isToday ? (
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
        ) : (
          <button disabled
            className="w-full h-14 rounded-2xl text-white/60 font-semibold text-base flex items-center justify-center gap-3 cursor-not-allowed opacity-50"
            style={{ background: 'linear-gradient(135deg,#0BBFBF,#1A5FA8)' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/>
            </svg>
            Scan disponible le jour de l'intervention
          </button>
        )}

        {/* ── Liste des interventions ── */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 capitalize">
            {labelJour}
          </h2>

          {!interventions?.length && passages.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
              <p className="text-4xl mb-3">{isToday ? '🎉' : '📅'}</p>
              <p className="font-semibold text-slate-700">
                {isToday ? 'Aucune intervention aujourd\'hui' : 'Aucune intervention ce jour'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {isToday ? 'Profitez de votre journée !' : 'Naviguez vers un autre jour'}
              </p>
            </div>
          ) : isToday ? (
            /* ── Mode aujourd'hui : vue complète avec statuts ── */
            <div className="space-y-3">
              {todayItems.map(item =>
                item.kind === 'passage' ? (
                  <PassageCarte key={item.data.id} passage={item.data} />
                ) : (
                  <div key={item.data.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <Link href={`/agent/intervention/${item.data.id}`}>
                      <div className="p-4 flex items-center gap-4 active:bg-slate-50 transition-colors">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: '#EFF6FF' }}>
                          <svg className="w-6 h-6 text-[#1A5FA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{item.data.residences?.nom}</p>
                          {item.data.contrats_residences?.libelle && (
                            <p className="text-xs font-semibold truncate" style={{ color: '#0BBFBF' }}>{item.data.contrats_residences.libelle}</p>
                          )}
                          <p className="text-sm text-slate-500 truncate">{item.data.residences?.adresse}</p>
                          {item.data.heure_debut_prevue && (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {item.data.heure_debut_prevue.slice(0,5)}
                              {item.data.heure_fin_prevue ? ` → ${item.data.heure_fin_prevue.slice(0,5)}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <StatutBadge statut={item.data.statut} />
                          <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                          </svg>
                        </div>
                      </div>
                    </Link>
                    {item.data.residences && (
                      <div className="px-4 pb-4 pt-0">
                        <a href={wazeUrl(item.data.residences)} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full h-11 rounded-xl font-semibold text-sm text-white active:opacity-80 transition-opacity"
                          style={{ background: 'linear-gradient(135deg,#0BBFBF,#0A8F8F)' }}>
                          🧭 Itinéraire Waze
                        </a>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          ) : (
            /* ── Mode futur : aperçu léger, lecture seule ── */
            <div className="space-y-3">
              {futurItems.map(item =>
                item.kind === 'passage' ? (
                  <PassageCarte key={item.data.id} passage={item.data} />
                ) : (
                  <div key={item.data.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: '#EFF6FF' }}>
                        <svg className="w-6 h-6 text-[#1A5FA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{item.data.residences?.nom}</p>
                        {item.data.contrats_residences?.libelle && (
                          <p className="text-xs font-semibold truncate" style={{ color: '#0BBFBF' }}>{item.data.contrats_residences.libelle}</p>
                        )}
                        <p className="text-sm text-slate-500 truncate">{item.data.residences?.adresse}</p>
                        {item.data.heure_debut_prevue && (
                          <p className="text-sm font-semibold mt-1" style={{ color: '#0BBFBF' }}>
                            {item.data.heure_debut_prevue.slice(0,5)}
                            {item.data.heure_fin_prevue ? ` → ${item.data.heure_fin_prevue.slice(0,5)}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    {item.data.residences && (
                      <div className="px-4 pb-4 pt-0">
                        <a href={wazeUrl(item.data.residences)} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full h-11 rounded-xl font-semibold text-sm text-white active:opacity-80 transition-opacity"
                          style={{ background: 'linear-gradient(135deg,#0BBFBF,#0A8F8F)' }}>
                          🧭 Itinéraire Waze
                        </a>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
