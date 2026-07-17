export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Intervention, Residence, Profile } from '@/lib/types'
import { wazeUrl } from '@/lib/navigation'
import PassageCarte from './PassageCarte'
import { FEATURES } from '@/lib/features'

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

function mondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short',
  }).formatToParts(d)
  const weekdayPart = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const ISO_DAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const isoDay = ISO_DAY[weekdayPart] ?? 1
  // daysToMonday: Mon=0, Tue=-1, Wed=-2, Thu=-3, Fri=-4, Sat=-5, Sun=-6
  const daysToMonday = isoDay === 0 ? -6 : 1 - isoDay
  return addDays(dateStr, daysToMonday)
}

function sundayOfNextWeek(dateStr: string): string {
  // lundi semaine courante + 13 = dimanche semaine suivante
  return addDays(mondayOfWeek(dateStr), 13)
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

// ── Regroupement par résidence/contrat (une résidence multi-bâtiments = 1 mission) ──

type Mission = {
  key: string
  residence: Residence | null
  contratLibelle: string | null
  contratId: string | null
  primaryId: string
  batiments: number
  heureDebut: string | null
  heureFin: string | null
  statut: string
}

function statutMission(statuts: string[]): string {
  if (statuts.some(s => s === 'en_cours')) return 'en_cours'
  if (statuts.every(s => s === 'terminee')) return 'terminee'
  if (statuts.every(s => s === 'planifiee')) return 'planifiee'
  if (statuts.every(s => s === 'non_demarree' || s === 'planifiee') && statuts.some(s => s === 'non_demarree')) return 'non_demarree'
  // Mixte (ex. certains bâtiments terminés, d'autres pas encore démarrés) → travail en cours sur la résidence
  return 'en_cours'
}

function groupMissions(inters: InterventionJoined[]): Mission[] {
  const map = new Map<string, InterventionJoined[]>()
  for (const i of inters) {
    const key = `${i.residence_id}::${i.contrat_id ?? i.id}`
    const arr = map.get(key)
    if (arr) arr.push(i)
    else map.set(key, [i])
  }
  const missions: Mission[] = []
  for (const group of map.values()) {
    const first = group[0]
    let heureDebut: string | null = null
    let heureFin: string | null = null
    for (const i of group) {
      if (i.heure_debut_prevue && (!heureDebut || i.heure_debut_prevue < heureDebut)) heureDebut = i.heure_debut_prevue
      if (i.heure_fin_prevue && (!heureFin || i.heure_fin_prevue > heureFin)) heureFin = i.heure_fin_prevue
    }
    missions.push({
      key: `${first.residence_id}::${first.contrat_id ?? first.id}`,
      residence: first.residences ?? null,
      contratLibelle: first.contrats_residences?.libelle ?? null,
      contratId: first.contrat_id ?? null,
      primaryId: first.id,
      batiments: group.length,
      heureDebut,
      heureFin,
      statut: statutMission(group.map(i => i.statut)),
    })
  }
  return missions.sort((a, b) => (a.heureDebut ?? '23:59').localeCompare(b.heureDebut ?? '23:59'))
}

function missionHref(m: Mission): string {
  return m.batiments > 1 && m.contratId ? `/agent/mission/${m.contratId}` : `/agent/intervention/${m.primaryId}`
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
  const todayStr   = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
  const minDateStr = mondayOfWeek(todayStr)      // lundi de la semaine courante
  const maxDateStr = sundayOfNextWeek(todayStr)  // dimanche de la semaine suivante

  // Date sélectionnée — bornée [lundi semaine courante, dimanche semaine suivante]
  const sp = await searchParams
  let selectedDate = sp.date ?? todayStr
  if (selectedDate < minDateStr) selectedDate = minDateStr
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
  const passages: PassageSiege[] = FEATURES.passagesSiege
    ? ((passagesRaw ?? []) as Record<string, unknown>[]).map(p => ({
        id:            p.id as string,
        heure_prevue:  p.heure_prevue as string,
        motif:         p.motif as string,
        statut:        p.statut as string,
        adresse_siege: adresseSiege,
      }))
    : []

  const { data: alertes } = await supabase
    .from('alertes')
    .select('id')
    .eq('destinataire_id', user.id)
    .eq('lue', false)

  // Regroupement par résidence/contrat : une résidence multi-bâtiments = une seule mission
  const missions = groupMissions(interventions ?? [])
  const missionsEnCours    = missions.filter(m => m.statut === 'en_cours')
  const missionsPlanifiees = missions.filter(m => m.statut === 'planifiee')
  const missionsTerminees  = missions.filter(m => m.statut === 'terminee')

  type Item = { kind: 'mission'; data: Mission } | { kind: 'passage'; data: PassageSiege }
  const byHeure = (a: Item, b: Item) => {
    const ha = a.kind === 'mission' ? (a.data.heureDebut ?? '23:59') : a.data.heure_prevue
    const hb = b.kind === 'mission' ? (b.data.heureDebut ?? '23:59') : b.data.heure_prevue
    return ha.localeCompare(hb)
  }
  const todayItems: Item[] = [
    ...missions.filter(m => m.statut !== 'en_cours').map(data => ({ kind: 'mission' as const, data })),
    ...passages.map(data => ({ kind: 'passage' as const, data })),
  ].sort(byHeure)
  const futurItems: Item[] = [
    ...missions.map(data => ({ kind: 'mission' as const, data })),
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
              { n: missionsPlanifiees.length, label: 'Planifiée(s)', color: 'bg-white/10' },
              { n: missionsEnCours.length,    label: 'En cours',     color: 'bg-[#0BBFBF]/20' },
              { n: missionsTerminees.length,  label: 'Terminée(s)',  color: 'bg-green-500/20' },
            ].map(s => (
              <div key={s.label} className={`flex-1 ${s.color} rounded-2xl px-3 py-3 text-center`}>
                <p className="text-2xl font-bold text-white">{s.n}</p>
                <p className="text-[10px] text-blue-200 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* KPI futur — nb missions (résidences) + heure de début */}
        {!isToday && missions.length > 0 && (
          <div className="bg-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
            <p className="text-2xl font-bold text-white">{missions.length}</p>
            <div>
              <p className="text-blue-200 text-xs">chantier{missions.length > 1 ? 's' : ''} planifié{missions.length > 1 ? 's' : ''}</p>
              {missions[0]?.heureDebut && (
                <p className="text-white text-sm font-semibold">
                  1er RDV à {missions[0].heureDebut.slice(0, 5)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-5 space-y-4">

        {/* ── Navigation date ── */}
        <div className="flex items-center gap-2">
          {/* Flèche précédente — désactivée sur le lundi de la semaine courante */}
          {selectedDate === minDateStr ? (
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

        {/* ── Mode aujourd'hui : mission (résidence) en cours ── */}
        {isToday && missionsEnCours.map(m => (
          <Link key={m.key} href={missionHref(m)}>
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 active:scale-[0.98] transition-all">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 pulse-dot" />
                <span className="text-amber-700 text-sm font-semibold">En cours — continuer</span>
              </div>
              <p className="text-lg font-bold text-slate-800">{m.residence?.nom}</p>
              {m.contratLibelle && (
                <p className="text-sm font-semibold mt-0.5" style={{ color: '#0BBFBF' }}>{m.contratLibelle}</p>
              )}
              <p className="text-sm text-slate-500 mt-0.5">{m.residence?.adresse}</p>
              <div className="flex items-center gap-2 mt-1">
                {m.heureDebut && (
                  <p className="text-xs text-slate-400">
                    Prévu : {m.heureDebut.slice(0,5)} → {m.heureFin?.slice(0,5) ?? ''}
                  </p>
                )}
                {m.batiments > 1 && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                    {m.batiments} bâtiments
                  </span>
                )}
              </div>
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

          {!missions.length && passages.length === 0 ? (
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
                  <div key={item.data.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <Link href={missionHref(item.data)}>
                      <div className="p-4 flex items-center gap-4 active:bg-slate-50 transition-colors">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: '#EFF6FF' }}>
                          <svg className="w-6 h-6 text-[#1A5FA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{item.data.residence?.nom}</p>
                          {item.data.contratLibelle && (
                            <p className="text-xs font-semibold truncate" style={{ color: '#0BBFBF' }}>{item.data.contratLibelle}</p>
                          )}
                          <p className="text-sm text-slate-500 truncate">{item.data.residence?.adresse}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {item.data.heureDebut && (
                              <p className="text-xs text-slate-400">
                                {item.data.heureDebut.slice(0,5)}
                                {item.data.heureFin ? ` → ${item.data.heureFin.slice(0,5)}` : ''}
                              </p>
                            )}
                            {item.data.batiments > 1 && (
                              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                                {item.data.batiments} bâtiments
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <StatutBadge statut={item.data.statut} />
                          <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                          </svg>
                        </div>
                      </div>
                    </Link>
                    {item.data.residence && (
                      <div className="px-4 pb-4 pt-0">
                        <a href={wazeUrl(item.data.residence)} target="_blank" rel="noopener noreferrer"
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
                  <div key={item.data.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: '#EFF6FF' }}>
                        <svg className="w-6 h-6 text-[#1A5FA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{item.data.residence?.nom}</p>
                        {item.data.contratLibelle && (
                          <p className="text-xs font-semibold truncate" style={{ color: '#0BBFBF' }}>{item.data.contratLibelle}</p>
                        )}
                        <p className="text-sm text-slate-500 truncate">{item.data.residence?.adresse}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {item.data.heureDebut && (
                            <p className="text-sm font-semibold" style={{ color: '#0BBFBF' }}>
                              {item.data.heureDebut.slice(0,5)}
                              {item.data.heureFin ? ` → ${item.data.heureFin.slice(0,5)}` : ''}
                            </p>
                          )}
                          {item.data.batiments > 1 && (
                            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                              {item.data.batiments} bâtiments
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {item.data.residence && (
                      <div className="px-4 pb-4 pt-0">
                        <a href={wazeUrl(item.data.residence)} target="_blank" rel="noopener noreferrer"
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
