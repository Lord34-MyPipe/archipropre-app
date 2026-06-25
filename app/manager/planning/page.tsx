export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────
type Vue = 'jour' | 'semaine' | 'mois'

interface Intervention {
  id: string
  agent_id: string
  residence_id: string
  date_prevue: string
  heure_debut_prevue: string | null
  heure_fin_prevue: string | null
  statut: string
  agent_prenom: string
  agent_nom_str: string
  residence_nom: string
  contrat_libelle: string | null
}

interface AgentRow { id: string; nom: string; prenom: string; binome_agent_id?: string | null }

// ── Constants ──────────────────────────────────────────────────────────────
const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet',
  'août','septembre','octobre','novembre','décembre']
const JOURS_LONG = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
const JOURS_COL  = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

const STATUT_BG: Record<string, string> = {
  planifiee:    'bg-blue-100 text-blue-700 border-blue-200',
  en_cours:     'bg-amber-100 text-amber-700 border-amber-200',
  terminee:     'bg-green-100 text-green-700 border-green-200',
  validee:      'border',
  non_demarree: 'bg-red-100 text-red-700 border-red-200',
}
const STATUT_STYLE: Record<string, { background?: string; color?: string; borderColor?: string }> = {
  validee: { background: '#C0DD97', color: '#27500A', borderColor: '#9CC46A' },
}
const STATUT_LABEL: Record<string, string> = {
  planifiee: 'Planifiée', en_cours: 'En cours', terminee: 'Terminée',
  validee: 'Validé', non_demarree: 'En retard',
}

// ── Date helpers ───────────────────────────────────────────────────────────
function toStr(d: Date) { return d.toISOString().split('T')[0] }

function getMonday(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0)
  const day = r.getDay()
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1))
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function parseDate(s: string | undefined, fb: Date): Date {
  if (!s) return fb
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? fb : d
}

// ── Main ───────────────────────────────────────────────────────────────────
interface Props {
  searchParams: Promise<{ vue?: string; date?: string }>
}

export default async function ManagerPlanning({ searchParams }: Props) {
  const sp  = await searchParams
  const vue: Vue = (['jour','semaine','mois'].includes(sp.vue ?? '') ? sp.vue as Vue : 'semaine')

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr = toStr(today)

  // ── Compute range based on view ──────────────────────────────────────────
  let dateBase: Date, debut: Date, fin: Date
  let prevDate: string, nextDate: string, todayRef: string, title: string

  if (vue === 'semaine') {
    dateBase = getMonday(parseDate(sp.date, getMonday(today)))
    debut = dateBase; fin = addDays(dateBase, 6)
    prevDate = toStr(addDays(dateBase, -7)); nextDate = toStr(addDays(dateBase, 7))
    todayRef = toStr(getMonday(today))
    title = debut.getMonth() === fin.getMonth()
      ? `Semaine du ${debut.getDate()} au ${fin.getDate()} ${MOIS_FR[debut.getMonth()]} ${debut.getFullYear()}`
      : `${debut.getDate()} ${MOIS_FR[debut.getMonth()]} — ${fin.getDate()} ${MOIS_FR[fin.getMonth()]} ${fin.getFullYear()}`
  } else if (vue === 'jour') {
    dateBase = parseDate(sp.date, today); dateBase.setHours(0, 0, 0, 0)
    debut = dateBase; fin = dateBase
    prevDate = toStr(addDays(dateBase, -1)); nextDate = toStr(addDays(dateBase, 1))
    todayRef = todayStr
    title = `${JOURS_LONG[dateBase.getDay()]} ${dateBase.getDate()} ${MOIS_FR[dateBase.getMonth()]} ${dateBase.getFullYear()}`
  } else {
    const raw = parseDate(sp.date, today)
    dateBase = new Date(raw.getFullYear(), raw.getMonth(), 1)
    debut = dateBase; fin = new Date(dateBase.getFullYear(), dateBase.getMonth() + 1, 0)
    prevDate = toStr(addMonths(dateBase, -1)); nextDate = toStr(addMonths(dateBase, 1))
    todayRef = toStr(new Date(today.getFullYear(), today.getMonth(), 1))
    const m = MOIS_FR[dateBase.getMonth()]
    title = m.charAt(0).toUpperCase() + m.slice(1) + ' ' + dateBase.getFullYear()
  }

  const debutStr    = toStr(debut)
  const finStr      = toStr(fin)
  const dateBaseStr = toStr(dateBase)
  const isCurrent   = dateBaseStr === todayRef

  // ── Supabase ─────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: agentsRaw } = await supabase
    .from('profiles').select('id,nom,prenom,binome_agent_id')
    .eq('manager_id', user.id).eq('actif', true).order('nom')

  const agents: AgentRow[] = agentsRaw ?? []
  const safeIds = agents.length ? agents.map(a => a.id) : ['00000000-0000-0000-0000-000000000000']

  const [{ data: congesRaw }, { data: absRaw }, { data: intersRaw }] = await Promise.all([
    supabase.from('conges').select('agent_id,date_debut,date_fin,statut,motif')
      .in('agent_id', safeIds).lte('date_debut', finStr).gte('date_fin', debutStr),
    supabase.from('absences').select('agent_id,date_debut,date_fin,statut,motif')
      .in('agent_id', safeIds).lte('date_debut', finStr).gte('date_fin', debutStr),
    supabase.from('interventions')
      .select('id,agent_id,residence_id,date_prevue,heure_debut_prevue,heure_fin_prevue,statut,residences(nom),contrats_residences(libelle)')
      .in('agent_id', safeIds).gte('date_prevue', debutStr).lte('date_prevue', finStr)
      .neq('statut', 'annulee')
      .order('heure_debut_prevue'),
  ])

  // Build conge keys
  const congeKeys   = new Set<string>()
  const congeMotifs: Record<string, string> = {}
  ;[...(congesRaw ?? []), ...(absRaw ?? [])].forEach(c => {
    const s = (c.statut ?? '').toLowerCase()
    if (['refuse','rejeté','rejete','annule'].some(x => s.includes(x))) return
    const cur = new Date(c.date_debut + 'T00:00:00')
    const end = new Date(c.date_fin   + 'T00:00:00')
    while (cur <= end) {
      const k = `${c.agent_id}|${toStr(cur)}`
      congeKeys.add(k); if (!congeMotifs[k]) congeMotifs[k] = c.motif ?? 'Congé'
      cur.setDate(cur.getDate() + 1)
    }
  })

  // Normalize interventions
  const agentMap = new Map(agents.map(a => [a.id, a]))
  type IR = {
    id: string; agent_id: string; residence_id: string; date_prevue: string
    heure_debut_prevue: string | null; heure_fin_prevue: string | null
    statut: string; residences?: { nom: string } | null
    contrats_residences?: { libelle: string | null } | null
  }
  const inters: Intervention[] = ((intersRaw as unknown as IR[]) ?? []).map(i => {
    const a = agentMap.get(i.agent_id)
    return {
      id: i.id, agent_id: i.agent_id, residence_id: i.residence_id, date_prevue: i.date_prevue,
      heure_debut_prevue: i.heure_debut_prevue, heure_fin_prevue: i.heure_fin_prevue,
      statut: i.statut,
      agent_prenom: a?.prenom ?? '?', agent_nom_str: a?.nom ?? '',
      residence_nom: i.residences?.nom ?? '—',
      contrat_libelle: i.contrats_residences?.libelle ?? null,
    }
  })

  const vueBtnLabel: Record<Vue, string> = { jour: 'Jour', semaine: 'Semaine', mois: 'Mois' }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ── Header ── */}
      <div className="bg-[#0A2E5A] text-white px-6 py-5 md:px-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">

          {/* Navigation temporelle */}
          <div className="flex items-center gap-2">
            <Link href={`?vue=${vue}&date=${prevDate}`}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-xl leading-none select-none">
              ‹
            </Link>
            <div className="text-center px-1 min-w-[210px]">
              <p className="font-semibold text-sm md:text-base leading-snug">{title}</p>
              {!isCurrent ? (
                <Link href={`?vue=${vue}&date=${todayRef}`}
                  className="text-[#0BBFBF] text-xs hover:underline">
                  Aujourd'hui
                </Link>
              ) : (
                <p className="text-blue-300/60 text-xs">Période actuelle</p>
              )}
            </div>
            <Link href={`?vue=${vue}&date=${nextDate}`}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-xl leading-none select-none">
              ›
            </Link>
          </div>

          {/* Vue switcher + compteur */}
          <div className="flex items-center gap-3">
            <span className="text-blue-300/80 text-sm hidden sm:block">
              {inters.length} intervention{inters.length !== 1 ? 's' : ''}
            </span>
            <div className="flex rounded-xl overflow-hidden border border-white/20 text-xs font-semibold">
              {(['jour','semaine','mois'] as Vue[]).map(v => (
                <Link key={v} href={`?vue=${v}&date=${dateBaseStr}`}
                  className={`px-3 py-2 transition-colors ${
                    vue === v ? 'bg-[#1A5FA8] text-white' : 'text-blue-200 hover:bg-white/10'
                  }`}>
                  {vueBtnLabel[v]}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Légende */}
        <div className="flex gap-3 mt-3 flex-wrap text-xs text-blue-200">
          {[['bg-blue-400','Planifiée'],['bg-amber-400','En cours'],['bg-green-400','Terminée'],
            ['','Validé','#C0DD97'],['bg-orange-300','🏖️ Congé'],['bg-red-400','⚠️ Conflit']].map(([c,l,bg]) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${c}`} style={bg ? { background: bg } : undefined}/>
              <span>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-4 md:p-8 pb-24 md:pb-8">
        {vue === 'semaine' && (
          <VueSemaine
            dates={Array.from({length:7}, (_,i) => toStr(addDays(debut, i)))}
            inters={inters}
            agents={agents}
            congeKeys={congeKeys}
            congeMotifs={congeMotifs}
            todayStr={todayStr}
          />
        )}
        {vue === 'jour' && (
          <VueJour
            dateStr={debutStr}
            inters={inters}
            agents={agents}
            congeKeys={congeKeys}
            congeMotifs={congeMotifs}
          />
        )}
        {vue === 'mois' && (
          <VueMois
            debut={debut}
            fin={fin}
            inters={inters}
            todayStr={todayStr}
          />
        )}
      </div>
    </div>
  )
}

// ── Vue Semaine ─────────────────────────────────────────────────────────────
function VueSemaine({ dates, inters, agents, congeKeys, congeMotifs, todayStr }: {
  dates: string[]
  inters: Intervention[]
  agents: AgentRow[]
  congeKeys: Set<string>
  congeMotifs: Record<string, string>
  todayStr: string
}) {
  // ── Groupage binômes ─────────────────────────────────────────────────────
  type RowEntry =
    | { kind: 'solo';             agent: AgentRow }
    | { kind: 'binome-primary';   agent: AgentRow; partner: AgentRow }
    | { kind: 'binome-secondary'; agent: AgentRow }

  const agentMap = new Map(agents.map(a => [a.id, a]))
  const done     = new Set<string>()
  const allRows: RowEntry[] = []

  for (const agent of agents) {
    if (done.has(agent.id)) continue
    const partner = agent.binome_agent_id ? agentMap.get(agent.binome_agent_id) : undefined
    if (partner && !done.has(partner.id)) {
      const [primary, secondary] = agent.nom.localeCompare(partner.nom) <= 0
        ? [agent, partner] : [partner, agent]
      allRows.push({ kind: 'binome-primary',   agent: primary, partner: secondary })
      allRows.push({ kind: 'binome-secondary',  agent: secondary })
      done.add(primary.id); done.add(secondary.id)
    } else {
      allRows.push({ kind: 'solo', agent })
      done.add(agent.id)
    }
  }

  // Agents actifs cette semaine (avec intervention ou congé)
  const activeIds = new Set<string>()
  agents.forEach(a => {
    if (dates.some(d =>
      inters.some(i => i.agent_id === a.id && i.date_prevue === d) ||
      congeKeys.has(`${a.id}|${d}`)
    )) activeIds.add(a.id)
  })

  // Binôme : afficher la paire si l'UN des deux est actif
  const shownIds = new Set<string>()
  allRows.forEach(r => {
    if (r.kind === 'solo') {
      if (activeIds.has(r.agent.id)) shownIds.add(r.agent.id)
    } else if (r.kind === 'binome-primary') {
      if (activeIds.has(r.agent.id) || activeIds.has(r.partner.id)) {
        shownIds.add(r.agent.id); shownIds.add(r.partner.id)
      }
    }
  })

  const visibleRows    = allRows.filter(r => shownIds.has(r.agent.id))
  const inactiveAgents = agents.filter(a => !shownIds.has(a.id))

  const hasData = inters.length > 0 ||
    dates.some(d => agents.some(a => congeKeys.has(`${a.id}|${d}`)))

  if (!hasData) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
        <p className="text-4xl mb-3">📅</p>
        <p className="text-slate-600 font-medium">Aucune intervention cette semaine</p>
        <p className="text-slate-400 text-sm mt-1">Allez dans une résidence pour générer le planning</p>
        <Link href="/manager/residences"
          className="inline-block mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
          Gérer les résidences →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Grille */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 w-36 sticky left-0 bg-white">
                Agent
              </th>
              {dates.map((dateStr, i) => {
                const d = new Date(dateStr + 'T00:00:00')
                const isToday = dateStr === todayStr
                return (
                  <th key={i} className={`px-2 py-3 text-center text-xs font-semibold w-24 ${isToday ? 'text-[#1A5FA8]' : 'text-slate-500'}`}>
                    <Link href={`?vue=jour&date=${dateStr}`} className="hover:opacity-70 transition-opacity block">
                      <div>{JOURS_COL[i]}</div>
                      <div className={`text-base font-bold mt-0.5 ${
                        isToday
                          ? 'w-7 h-7 rounded-full bg-[#1A5FA8] text-white flex items-center justify-center mx-auto'
                          : 'text-slate-800'
                      }`}>
                        {d.getDate()}
                      </div>
                    </Link>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIdx) => {
              const agent       = row.agent
              const isPrimary   = row.kind === 'binome-primary'
              const isSecondary = row.kind === 'binome-secondary'
              const isBinome    = isPrimary || isSecondary
              // Supprimer le séparateur entre primary et secondary
              const nextRow     = visibleRows[rowIdx + 1]
              const noBottomBorder = isPrimary && nextRow?.kind === 'binome-secondary'

              return (
                <tr
                  key={agent.id}
                  className={`${noBottomBorder ? '' : 'border-b border-slate-50'} ${isBinome ? 'bg-[#f5fffe]' : ''}`}
                >
                  {/* Colonne agent */}
                  <td className={`px-4 py-3 sticky left-0 border-r border-slate-50 ${
                    isBinome
                      ? 'bg-[#f5fffe] border-l-[3px] border-l-[#0BBFBF]'
                      : 'bg-white'
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                        isBinome ? 'bg-[#0BBFBF]' : 'bg-[#1A5FA8]'
                      }`}>
                        {agent.prenom[0]}{agent.nom[0]}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-700 truncate block">{agent.prenom}</span>
                        {isPrimary && (
                          <span className="text-[9px] text-[#0BBFBF] font-semibold leading-none">👥 Binôme</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Colonnes jours */}
                  {dates.map((dateStr, j) => {
                    const dayInters   = inters.filter(i => i.agent_id === agent.id && i.date_prevue === dateStr)
                    const isOnLeave   = congeKeys.has(`${agent.id}|${dateStr}`)
                    const leaveLabel  = congeMotifs[`${agent.id}|${dateStr}`] ?? 'Congé'
                    const hasConflict = isOnLeave && dayInters.length > 0
                    return (
                      <td key={j} className={`px-1 py-2 align-top ${isOnLeave ? 'bg-orange-50/60' : ''}`}>
                        <div className="space-y-1">
                          {isOnLeave && (
                            <div className={`px-1.5 py-1 rounded-lg text-[10px] font-semibold leading-tight flex items-center gap-1 border ${
                              hasConflict ? 'bg-red-100 text-red-700 border-red-300' : 'bg-orange-100 text-orange-700 border-orange-200'
                            }`}>
                              {hasConflict ? '⚠️' : '🏖️'}
                              <span className="truncate">{hasConflict ? 'Conflit' : leaveLabel}</span>
                            </div>
                          )}
                          {dayInters.map(i => {
                            const cardCls = `relative px-1.5 py-1.5 rounded-lg text-[10px] font-medium leading-tight border ${
                              isOnLeave
                                ? 'bg-red-50 text-red-800 border-red-300'
                                : (STATUT_BG[i.statut] ?? 'bg-slate-100 text-slate-600 border-slate-200')
                            }`
                            const cardContent = (
                              <>
                                {isBinome && (
                                  <span className="absolute top-0.5 right-0.5 text-[8px] leading-none opacity-70">👥</span>
                                )}
                                <div className="truncate font-semibold pr-3">{i.residence_nom}</div>
                                {i.contrat_libelle && (
                                  <div className="truncate text-[9px] font-semibold opacity-80">{i.contrat_libelle}</div>
                                )}
                                {i.heure_debut_prevue && (
                                  <div className="text-[9px] opacity-70 mt-0.5">
                                    {i.heure_debut_prevue.slice(0,5)}
                                    {i.heure_fin_prevue ? ` → ${i.heure_fin_prevue.slice(0,5)}` : ' → ?'}
                                  </div>
                                )}
                                <div className="text-[9px] opacity-60 mt-0.5">{STATUT_LABEL[i.statut] ?? i.statut}</div>
                              </>
                            )
                            const href = ['terminee','validee'].includes(i.statut)
                              ? `/manager/interventions/${i.id}/rapport`
                              : `/manager/residences/${i.residence_id}`
                            return !isOnLeave ? (
                              <Link key={i.id} href={href} className={`block ${cardCls}`} style={STATUT_STYLE[i.statut]}>
                                {cardContent}
                              </Link>
                            ) : (
                              <div key={i.id} className={cardCls} style={STATUT_STYLE[i.statut]}>
                                {cardContent}
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

            {/* Agents sans activité cette semaine */}
            {inactiveAgents.map(agent => (
              <tr key={`empty-${agent.id}`} className="border-b border-slate-50">
                <td className="px-4 py-3 sticky left-0 bg-white border-r border-slate-50">
                  <div className="flex items-center gap-2 opacity-35">
                    <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {agent.prenom[0]}{agent.nom[0]}
                    </div>
                    <span className="text-sm font-medium text-slate-500 truncate">{agent.prenom}</span>
                  </div>
                </td>
                {dates.map((_,j) => (
                  <td key={j} className="px-1 py-3">
                    <div className="flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-slate-200"/>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Détail par jour */}
      {inters.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Détail de la semaine</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {dates.map(dateStr => {
              const d = new Date(dateStr + 'T00:00:00')
              const dayInters     = inters.filter(i => i.date_prevue === dateStr)
              const agentsEnConge = agents.filter(a => congeKeys.has(`${a.id}|${dateStr}`))
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
                      <span key={a.id} className={`px-2 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 border ${
                        dayInters.some(i => i.agent_id === a.id)
                          ? 'bg-red-100 text-red-700 border-red-200'
                          : 'bg-orange-100 text-orange-700 border-orange-200'
                      }`}>
                        🏖️ {a.prenom} {a.nom}
                        {dayInters.some(i => i.agent_id === a.id) && <span className="font-bold"> ⚠️</span>}
                      </span>
                    ))}
                  </div>
                  {dayInters.map(i => (
                    <div key={i.id} className="px-5 py-3 flex items-center gap-3 border-b border-slate-50 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-[#1A5FA8] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {i.agent_prenom[0]}{i.agent_nom_str[0] ?? ''}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{i.residence_nom}</p>
                        <p className="text-xs text-slate-500">
                          {i.agent_prenom} {i.agent_nom_str}
                          {i.heure_debut_prevue ? ` · ${i.heure_debut_prevue.slice(0,5)}` : ''}
                          {i.heure_debut_prevue && (i.heure_fin_prevue ? ` → ${i.heure_fin_prevue.slice(0,5)}` : ' → ?')}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 border ${STATUT_BG[i.statut] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`} style={STATUT_STYLE[i.statut]}>
                        {STATUT_LABEL[i.statut] ?? i.statut}
                      </span>
                      {['terminee','validee'].includes(i.statut) && (
                        <Link href={`/manager/interventions/${i.id}/rapport`}
                          className="text-xs font-semibold shrink-0 whitespace-nowrap hover:underline"
                          style={{ color: '#0BBFBF' }}>
                          Voir →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Vue Jour ────────────────────────────────────────────────────────────────
const HOURS = Array.from({length: 16}, (_, i) => `${String(i + 7).padStart(2, '0')}:00`)

function VueJour({ dateStr, inters, agents, congeKeys, congeMotifs }: {
  dateStr: string
  inters: Intervention[]
  agents: AgentRow[]
  congeKeys: Set<string>
  congeMotifs: Record<string, string>
}) {
  const agentsEnConge = agents.filter(a => congeKeys.has(`${a.id}|${dateStr}`))
  const sorted = [...inters].sort((a, b) =>
    (a.heure_debut_prevue ?? '00:00').localeCompare(b.heure_debut_prevue ?? '00:00')
  )

  if (sorted.length === 0 && agentsEnConge.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center">
        <p className="text-4xl mb-3">📅</p>
        <p className="text-slate-600 font-medium">Aucune intervention ce jour</p>
        <p className="text-slate-400 text-sm mt-1">Naviguez vers une autre date ou générez un planning</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Congés du jour */}
      {agentsEnConge.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-orange-800 font-semibold">🏖️ Absents :</span>
          {agentsEnConge.map(a => (
            <span key={a.id} className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              sorted.some(i => i.agent_id === a.id)
                ? 'bg-red-100 text-red-700 border-red-300'
                : 'bg-orange-100 text-orange-700 border-orange-200'
            }`}>
              {sorted.some(i => i.agent_id === a.id) ? '⚠️ ' : ''}
              {a.prenom} {a.nom}
              {congeMotifs[`${a.id}|${dateStr}`] ? ` — ${congeMotifs[`${a.id}|${dateStr}`]}` : ''}
            </span>
          ))}
        </div>
      )}

      {/* Grille horaire */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Planning de la journée</h2>
          <span className="text-sm text-slate-400">
            {sorted.length} intervention{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div>
          {HOURS.map(hour => {
            const hourNum    = parseInt(hour)
            const hourInters = sorted.filter(i => {
              if (!i.heure_debut_prevue) return false
              return parseInt(i.heure_debut_prevue.slice(0, 2)) === hourNum
            })
            const hasInter = hourInters.length > 0

            return (
              <div key={hour} className={`flex border-b border-slate-50 last:border-0 ${
                hasInter ? '' : 'opacity-25 hover:opacity-50 transition-opacity'
              }`}>
                {/* Heure */}
                <div className={`w-16 shrink-0 border-r border-slate-100 text-xs font-mono text-slate-400 flex items-start justify-center ${
                  hasInter ? 'pt-3 pb-2' : 'py-1'
                }`}>
                  {hour}
                </div>
                {/* Interventions */}
                <div className={`flex-1 ${hasInter ? 'p-2.5 space-y-2' : 'py-1'}`}>
                  {hourInters.map(i => {
                    const isConflict = congeKeys.has(`${i.agent_id}|${dateStr}`)
                    const cardCls = `px-4 py-3 rounded-xl border flex items-start justify-between gap-3 ${
                      isConflict
                        ? 'bg-red-50 text-red-800 border-red-300'
                        : (STATUT_BG[i.statut] ?? 'bg-slate-50 text-slate-700 border-slate-200')
                    }`
                    const cardContent = (
                      <>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-6 h-6 rounded-full bg-[#1A5FA8]/10 flex items-center justify-center text-[10px] font-bold text-[#1A5FA8] shrink-0">
                              {i.agent_prenom[0]}{i.agent_nom_str[0] ?? ''}
                            </div>
                            <p className="text-sm font-semibold truncate">{i.residence_nom}</p>
                            {isConflict && (
                              <span className="text-red-600 text-xs font-bold shrink-0">⚠️ Congé</span>
                            )}
                          </div>
                          <p className="text-xs opacity-70 pl-8">{i.agent_prenom} {i.agent_nom_str}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-mono font-semibold">
                            {i.heure_debut_prevue?.slice(0, 5) ?? '?'}
                            {i.heure_fin_prevue ? ` → ${i.heure_fin_prevue.slice(0, 5)}` : ''}
                          </p>
                          <p className="text-[10px] opacity-60 mt-0.5">{STATUT_LABEL[i.statut] ?? i.statut}</p>
                        </div>
                      </>
                    )
                    const href = ['terminee','validee'].includes(i.statut)
                      ? `/manager/interventions/${i.id}/rapport`
                      : `/manager/residences/${i.residence_id}`
                    return !isConflict ? (
                      <Link key={i.id} href={href} className={cardCls} style={STATUT_STYLE[i.statut]}>
                        {cardContent}
                      </Link>
                    ) : (
                      <div key={i.id} className={cardCls} style={STATUT_STYLE[i.statut]}>
                        {cardContent}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Vue Mois ────────────────────────────────────────────────────────────────
function VueMois({ debut, fin, inters, todayStr }: {
  debut: Date
  fin: Date
  inters: Intervention[]
  todayStr: string
}) {
  // Build calendar grid (Mon-based, pad with prev/next month days)
  const firstDow = debut.getDay()
  const padStart = firstDow === 0 ? 6 : firstDow - 1

  const cells: Array<{ dateStr: string; isCurrentMonth: boolean }> = []
  const cur = addDays(debut, -padStart)
  while (cells.length < 42) {
    const ds = toStr(cur)
    cells.push({ dateStr: ds, isCurrentMonth: cur >= debut && cur <= fin })
    cur.setDate(cur.getDate() + 1)
  }
  // Drop trailing row if fully outside current month
  while (cells.length > 35 && !cells.slice(-7).some(c => c.isCurrentMonth)) {
    cells.splice(-7)
  }

  const countByDay = new Map<string, number>()
  const agentsByDay = new Map<string, Set<string>>()
  inters.forEach(i => {
    countByDay.set(i.date_prevue, (countByDay.get(i.date_prevue) ?? 0) + 1)
    if (!agentsByDay.has(i.date_prevue)) agentsByDay.set(i.date_prevue, new Set())
    agentsByDay.get(i.date_prevue)!.add(i.agent_id)
  })

  const totalMois   = inters.length
  const joursActifs = countByDay.size

  return (
    <div className="space-y-4">
      {/* Résumé */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4">
          <p className="text-2xl font-bold text-[#1A5FA8]">{totalMois}</p>
          <p className="text-xs text-slate-500 mt-0.5">Interventions</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4">
          <p className="text-2xl font-bold text-[#0BBFBF]">{joursActifs}</p>
          <p className="text-xs text-slate-500 mt-0.5">Jours actifs</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4">
          <p className="text-2xl font-bold text-slate-700">
            {totalMois > 0 ? Math.round(totalMois / Math.max(joursActifs, 1)) : 0}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">Moy. / jour</p>
        </div>
      </div>

      {/* Grille calendrier */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {/* En-têtes */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {JOURS_COL.map(j => (
            <div key={j} className="py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {j}
            </div>
          ))}
        </div>
        {/* Cases */}
        <div className="grid grid-cols-7">
          {cells.map(({ dateStr, isCurrentMonth }) => {
            const count   = countByDay.get(dateStr) ?? 0
            const nAgents = agentsByDay.get(dateStr)?.size ?? 0
            const isToday = dateStr === todayStr
            const d       = new Date(dateStr + 'T00:00:00')

            return (
              <Link key={dateStr} href={`?vue=jour&date=${dateStr}`}
                className={`min-h-[80px] p-2 border-b border-r border-slate-50 transition-colors group ${
                  !isCurrentMonth ? 'bg-slate-50/50' : 'hover:bg-blue-50/40'
                }`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold mb-1.5 transition-colors ${
                  isToday
                    ? 'bg-[#1A5FA8] text-white'
                    : isCurrentMonth
                      ? 'text-slate-700 group-hover:bg-[#1A5FA8]/10 group-hover:text-[#1A5FA8]'
                      : 'text-slate-300'
                }`}>
                  {d.getDate()}
                </div>
                {count > 0 && isCurrentMonth && (
                  <div>
                    <div className="inline-flex items-center gap-1 bg-[#1A5FA8]/10 text-[#1A5FA8] text-[10px] font-semibold px-1.5 py-0.5 rounded-md">
                      {count} inter{count > 1 ? 's' : ''}
                    </div>
                    {nAgents > 1 && (
                      <div className="text-[9px] text-slate-400 mt-0.5">{nAgents} agents</div>
                    )}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Liste détaillée du mois */}
      {inters.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Toutes les interventions du mois</h2>
          </div>
          <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
            {Array.from(countByDay.keys()).sort().map(ds => {
              const d = new Date(ds + 'T00:00:00')
              const dayInters = inters.filter(i => i.date_prevue === ds)
              return (
                <div key={ds}>
                  <Link href={`?vue=jour&date=${ds}`}
                    className="block px-5 py-2 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      {d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}
                      <span className="ml-2 text-slate-400 normal-case font-normal">
                        {dayInters.length} intervention{dayInters.length > 1 ? 's' : ''}
                      </span>
                    </p>
                  </Link>
                  {dayInters.map(i => (
                    <div key={i.id} className="px-5 py-2.5 flex items-center gap-3 border-b border-slate-50 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-[#1A5FA8] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {i.agent_prenom[0]}{i.agent_nom_str[0] ?? ''}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{i.residence_nom}</p>
                        <p className="text-xs text-slate-500">
                          {i.agent_prenom} {i.agent_nom_str}
                          {i.heure_debut_prevue ? ` · ${i.heure_debut_prevue.slice(0,5)}` : ''}
                          {i.heure_debut_prevue && (i.heure_fin_prevue ? ` → ${i.heure_fin_prevue.slice(0,5)}` : ' → ?')}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${STATUT_BG[i.statut] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {STATUT_LABEL[i.statut] ?? i.statut}
                      </span>
                      {['terminee','validee'].includes(i.statut) && (
                        <Link href={`/manager/interventions/${i.id}/rapport`}
                          className="text-[10px] font-semibold shrink-0 whitespace-nowrap hover:underline"
                          style={{ color: '#0BBFBF' }}>
                          Voir →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
