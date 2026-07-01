'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Profile } from '@/lib/types'
import { Car, Users, MoreHorizontal, MapPin } from 'lucide-react'
import AgentFormModal from './AgentFormModal'
import AgentAbsenceDrawer from './AgentAbsenceDrawer'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface AgentWithStats extends Profile {
  stats: { total: number; terminees: number }
}

type RenderItem =
  | { type: 'solo';   agent: AgentWithStats }
  | { type: 'binome'; primary: AgentWithStats; secondary: AgentWithStats }

interface Props {
  agents: AgentWithStats[]
}

type GeoState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; success: number; errors: number }

// ── Carte agent compacte ──────────────────────────────────────────────────────

function AgentCard({
  agent,
  isLoading,
  onEdit,
  onToggle,
  onCongés,
}: {
  agent: AgentWithStats
  isLoading: boolean
  onEdit: () => void
  onToggle: () => void
  onCongés: () => void
}) {
  const taux = agent.stats.total
    ? Math.round((agent.stats.terminees / agent.stats.total) * 100)
    : null

  return (
    <div className={`bg-white rounded-xl border border-slate-100 flex flex-col transition-opacity ${!agent.actif ? 'opacity-60' : ''}`}>

      {/* ── En-tête ── */}
      <div className="flex items-start gap-3 p-4 pb-0">
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${
          agent.actif ? 'bg-[#1A5FA8]' : 'bg-slate-300'
        }`}>
          {agent.prenom?.[0]}{agent.nom?.[0]}
        </div>

        {/* Nom + badge */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 leading-snug">
            {agent.prenom} {agent.nom}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`px-1.5 py-px text-[10px] font-semibold rounded-full ${
              agent.actif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
            }`}>
              {agent.actif ? 'Actif' : 'Inactif'}
            </span>
            {agent.vehicule && <Car className="w-3 h-3 text-slate-400" />}
            <span className="text-[10px] text-slate-400 ml-auto">{agent.contrat_heures_hebdo}h/sem</span>
          </div>
        </div>

        {/* Toggle actif */}
        <button onClick={onToggle} disabled={isLoading}
          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 mt-0.5 ${
            agent.actif ? 'bg-[#0BBFBF]' : 'bg-slate-300'
          }`}>
          {isLoading
            ? <span className="absolute inset-0 flex items-center justify-center">
                <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              </span>
            : <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${agent.actif ? 'translate-x-4' : ''}`}/>
          }
        </button>
      </div>

      {/* Email */}
      <p className="px-4 mt-2 text-[11px] text-slate-400 truncate">{agent.email}</p>

      {/* ── Stats ── */}
      {agent.stats.total === 0 ? (
        <p className="px-4 mt-3 text-[11px] text-slate-400 italic">Aucune intervention aujourd'hui</p>
      ) : (
        <div className="px-4 mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Auj.", value: agent.stats.total },
            { label: 'Term.', value: agent.stats.terminees },
            { label: 'Taux',  value: taux !== null ? `${taux}%` : '—' },
          ].map(s => (
            <div key={s.label} className="text-center bg-slate-50 rounded-lg py-1.5">
              <p className="text-sm font-bold text-[#1A5FA8]">{s.value}</p>
              <p className="text-[9px] text-slate-400 mt-px">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="px-4 py-4 mt-auto flex gap-2">
        <button onClick={onEdit}
          title="Modifier"
          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-medium hover:bg-slate-200 transition-colors">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
          </svg>
          Modifier
        </button>
        <button onClick={onCongés}
          title="Congés"
          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-[11px] font-medium hover:bg-amber-100 transition-colors">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5"/>
          </svg>
          Congés
        </button>
        <Link href={`/manager/planning?agent=${agent.id}`}
          title="Planning"
          className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-medium hover:bg-slate-200 transition-colors">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5"/>
          </svg>
          Planning
        </Link>
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function AgentsClient({ agents: initial }: Props) {
  const router = useRouter()
  const [agents, setAgents]               = useState(initial)
  const [search, setSearch]               = useState('')
  const [modalOpen, setModalOpen]         = useState(false)
  const [editing, setEditing]             = useState<Profile | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<Profile | null>(null)
  const [loading, setLoading]             = useState<string | null>(null)
  const [absenceDrawerAgent, setAbsenceDrawerAgent] = useState<Profile | null>(null)
  const [geoState, setGeoState]           = useState<GeoState>({ status: 'idle' })
  const [menuOpen, setMenuOpen]           = useState(false)

  void setAgents // évite unused-var si jamais le refresh ne touche pas le state local

  const agentsAGeocoder = useMemo(
    () => agents.filter(a => a.adresse_domicile && !a.depart_lat),
    [agents]
  )

  async function lancerGeocodage() {
    if (geoState.status === 'running') return
    const cibles = agentsAGeocoder
    if (!cibles.length) return

    setGeoState({ status: 'running', done: 0, total: cibles.length })
    const supabase = createClient()
    let success = 0
    let errors = 0

    for (let i = 0; i < cibles.length; i++) {
      const agent = cibles[i]
      try {
        const res = await fetch(`/api/geocoder?adresse=${encodeURIComponent(agent.adresse_domicile!)}`)
        const data = await res.json()
        if (data.lat && data.lng) {
          await supabase.from('profiles').update({ depart_lat: data.lat, depart_lng: data.lng }).eq('id', agent.id)
          success++
        } else {
          errors++
        }
      } catch {
        errors++
      }
      setGeoState({ status: 'running', done: i + 1, total: cibles.length })
      if (i < cibles.length - 1) await new Promise(r => setTimeout(r, 1200))
    }

    setGeoState({ status: 'done', success, errors })
    router.refresh()
  }

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(a: Profile) { setEditing(a); setModalOpen(true) }
  function onSaved() { setModalOpen(false); router.refresh() }

  async function toggleActif(agent: Profile) {
    if (agent.actif) { setConfirmDeactivate(agent); return }
    if (!window.confirm(`Réactiver ${agent.prenom} ${agent.nom} ?`)) return
    setLoading(agent.id)
    await fetch('/api/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: agent.id, actif: true }),
    })
    setLoading(null)
    router.refresh()
  }

  async function confirmDeactivateAgent() {
    if (!confirmDeactivate) return
    setLoading(confirmDeactivate.id)
    setConfirmDeactivate(null)
    await fetch('/api/agents', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: confirmDeactivate.id }),
    })
    setLoading(null)
    router.refresh()
  }

  // ── Filtrage recherche ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return agents
    return agents.filter(a =>
      `${a.prenom} ${a.nom}`.toLowerCase().includes(q) ||
      (a.email ?? '').toLowerCase().includes(q)
    )
  }, [agents, search])

  // ── Groupage binômes ──────────────────────────────────────────────────────
  const renderItems = useMemo<RenderItem[]>(() => {
    const agentMap = new Map(filtered.map(a => [a.id, a]))
    const done = new Set<string>()
    const items: RenderItem[] = []

    for (const agent of filtered) {
      if (done.has(agent.id)) continue
      const partnerId = agent.binome_agent_id
      const partner = partnerId ? agentMap.get(partnerId) : undefined

      if (partner && !done.has(partner.id)) {
        const primary   = agent.id < partner.id ? agent : partner
        const secondary = agent.id < partner.id ? partner : agent
        items.push({ type: 'binome', primary, secondary })
        done.add(agent.id)
        done.add(partner.id)
      } else {
        items.push({ type: 'solo', agent })
        done.add(agent.id)
      }
    }
    return items
  }, [filtered])

  return (
    <>
      <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-4">

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-2 flex-wrap">

          {/* Recherche */}
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un agent…"
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent"
            />
          </div>

          {/* Résultat géocodage */}
          {geoState.status === 'done' && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm bg-green-50 border border-green-200 text-green-700">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {geoState.success} géocodée{geoState.success > 1 ? 's' : ''}
              {geoState.errors > 0 && <span className="text-amber-600 ml-1">· {geoState.errors} échec{geoState.errors > 1 ? 's' : ''}</span>}
            </div>
          )}

          {/* Menu ⋯ */}
          {agentsAGeocoder.length > 0 && geoState.status !== 'done' && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
                aria-label="Plus d'options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-[220px]">
                  <button
                    onClick={() => { setMenuOpen(false); lancerGeocodage() }}
                    disabled={geoState.status === 'running'}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-left"
                  >
                    {geoState.status === 'running' ? (
                      <>
                        <svg className="w-4 h-4 animate-spin text-[#0BBFBF] shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        {geoState.done}/{geoState.total} adresses…
                      </>
                    ) : (
                      <>
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        Géocoder ({agentsAGeocoder.length})
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Ajouter */}
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-sm active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Ajouter un agent
          </button>
        </div>

        {/* ── Grille ── */}
        {renderItems.length === 0 && (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">
            <Users className="w-12 h-12 mb-3 text-slate-300 mx-auto" />
            <p>{search ? 'Aucun agent trouvé.' : 'Aucun agent dans votre équipe.'}</p>
            {!search && (
              <button onClick={openCreate} className="mt-4 px-4 py-2 bg-[#1A5FA8] text-white rounded-xl text-sm font-medium">
                Ajouter le premier agent
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
          {renderItems.map(item => {
            if (item.type === 'solo') {
              return (
                <AgentCard
                  key={item.agent.id}
                  agent={item.agent}
                  isLoading={loading === item.agent.id}
                  onEdit={() => openEdit(item.agent)}
                  onToggle={() => toggleActif(item.agent)}
                  onCongés={() => setAbsenceDrawerAgent(item.agent)}
                />
              )
            }

            // Binôme : occupe 2 colonnes
            const { primary, secondary } = item
            const facteur = primary.facteur_binome ?? 0.60
            const gainPct = Math.round((1 - facteur) * 100)

            return (
              <div key={`binome-${primary.id}`}
                style={{ gridColumn: 'span 2' }}
                className="rounded-xl border-2 border-[#0BBFBF]/30 bg-[#0BBFBF]/5 p-2.5 space-y-2">
                {/* Header binôme */}
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-[#0BBFBF] text-white text-[10px] font-semibold rounded-full">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
                    </svg>
                    Binôme
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">
                    {primary.prenom} &amp; {secondary.prenom}
                    {gainPct > 0 && <span className="ml-1 text-[#0BBFBF]">⚡ {gainPct}% +rapide</span>}
                  </span>
                </div>

                {/* Les 2 cartes en sous-grille */}
                <div className="grid grid-cols-2 gap-2">
                  <AgentCard
                    agent={primary}
                    isLoading={loading === primary.id}
                    onEdit={() => openEdit(primary)}
                    onToggle={() => toggleActif(primary)}
                    onCongés={() => setAbsenceDrawerAgent(primary)}
                  />
                  <AgentCard
                    agent={secondary}
                    isLoading={loading === secondary.id}
                    onEdit={() => openEdit(secondary)}
                    onToggle={() => toggleActif(secondary)}
                    onCongés={() => setAbsenceDrawerAgent(secondary)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Drawer congés/absences */}
      {absenceDrawerAgent && (
        <AgentAbsenceDrawer
          agent={absenceDrawerAgent}
          onClose={() => setAbsenceDrawerAgent(null)}
        />
      )}

      {/* Modal création/édition */}
      {modalOpen && (
        <AgentFormModal
          agent={editing}
          agents={agents}
          onClose={() => setModalOpen(false)}
          onSaved={onSaved}
        />
      )}

      {/* Confirmation désactivation */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDeactivate(null)}/>
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full">
            <p className="font-semibold text-slate-800 mb-2">Désactiver l'agent ?</p>
            <p className="text-sm text-slate-500 mb-5">
              <strong>{confirmDeactivate.prenom} {confirmDeactivate.nom}</strong> sera marqué(e) inactif(ve).
              Les interventions planifiées restent inchangées.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeactivate(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium">
                Annuler
              </button>
              <button onClick={confirmDeactivateAgent}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold">
                Désactiver
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
