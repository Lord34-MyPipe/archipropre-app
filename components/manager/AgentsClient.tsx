'use client'

import { useState, useMemo } from 'react'
import type { Profile } from '@/lib/types'
import AgentFormModal from './AgentFormModal'
import AgentAbsenceDrawer from './AgentAbsenceDrawer'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const JOURS_LABELS: Record<string, string> = {
  lundi: 'L', mardi: 'M', mercredi: 'Me',
  jeudi: 'J', vendredi: 'V', samedi: 'S', dimanche: 'D',
}

interface AgentWithStats extends Profile {
  stats: { total: number; terminees: number }
}

type RenderItem =
  | { type: 'solo';   agent: AgentWithStats }
  | { type: 'binome'; primary: AgentWithStats; secondary: AgentWithStats }

interface Props {
  agents: AgentWithStats[]
}

// ── Carte agent individuelle ──────────────────────────────────────────────────

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
  const dispo = agent.disponibilites as Record<string, boolean> | null
  const joursActifs = Object.entries(dispo ?? {}).filter(([, v]) => v).map(([k]) => k)

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 p-5 transition-opacity ${!agent.actif ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${
          agent.actif ? 'bg-[#1A5FA8]' : 'bg-slate-300'
        }`}>
          {agent.prenom?.[0]}{agent.nom?.[0]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-800">{agent.prenom} {agent.nom}</h3>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Agent</span>
            {agent.vehicule && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">🚗</span>}
            {!agent.actif && <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-xs rounded-full">Inactif</span>}
          </div>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{agent.email}</p>
          {agent.telephone && (
            <a href={`tel:${agent.telephone}`} className="text-sm text-[#0BBFBF] font-medium hover:underline mt-0.5 block">
              {agent.telephone}
            </a>
          )}
        </div>

        {/* Toggle actif */}
        <button onClick={onToggle} disabled={isLoading}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
            agent.actif ? 'bg-[#0BBFBF]' : 'bg-slate-300'
          }`}>
          {isLoading
            ? <span className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              </span>
            : <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${agent.actif ? 'translate-x-5' : ''}`}/>
          }
        </button>
      </div>

      {/* Stats jour */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: "Aujourd'hui", value: agent.stats.total },
          { label: 'Terminées',   value: agent.stats.terminees },
          { label: 'Taux',        value: agent.stats.total ? `${Math.round(agent.stats.terminees / agent.stats.total * 100)}%` : '—' },
        ].map(s => (
          <div key={s.label} className="text-center bg-slate-50 rounded-xl py-2">
            <p className="text-lg font-bold text-[#1A5FA8]">{s.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tags */}
      {((agent.competences ?? []).length > 0 || (agent.zones_geo ?? []).length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(agent.zones_geo ?? []).map(z => (
            <span key={z} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">{z}</span>
          ))}
          {(agent.competences ?? []).map(c => (
            <span key={c} className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">{c}</span>
          ))}
        </div>
      )}

      {/* Disponibilités */}
      {joursActifs.length > 0 && (
        <div className="mt-3 flex gap-1.5">
          {['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'].map(j => (
            <div key={j}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                joursActifs.includes(j) ? 'bg-[#1A5FA8] text-white' : 'bg-slate-100 text-slate-300'
              }`}>
              {JOURS_LABELS[j]}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2 pt-3 border-t border-slate-100">
        <button onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
          </svg>
          Modifier
        </button>
        <button onClick={onCongés}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12V9zm0 3.75h.008v.008H12v-.008zm0 3.75h.008v.008H12v-.008z"/>
          </svg>
          Congés
        </button>
        <a href={`/manager/planning?agent=${agent.id}`}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5"/>
          </svg>
          Planning
        </a>
        <span className="ml-auto text-xs text-slate-400 self-center">{agent.contrat_heures_hebdo}h/sem</span>
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────

type GeoState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; success: number; errors: number }

export default function AgentsClient({ agents: initial }: Props) {
  const router = useRouter()
  const [agents, setAgents]               = useState(initial)
  const [modalOpen, setModalOpen]         = useState(false)
  const [editing, setEditing]             = useState<Profile | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<Profile | null>(null)
  const [loading, setLoading]             = useState<string | null>(null)
  const [absenceDrawerAgent, setAbsenceDrawerAgent] = useState<Profile | null>(null)
  const [geoState, setGeoState]           = useState<GeoState>({ status: 'idle' })

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
        const res = await fetch(
          `/api/geocoder?adresse=${encodeURIComponent(agent.adresse_domicile!)}`
        )
        const data = await res.json()
        if (data.lat && data.lng) {
          await supabase
            .from('profiles')
            .update({ depart_lat: data.lat, depart_lng: data.lng })
            .eq('id', agent.id)
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

  // ── Groupage binômes ──────────────────────────────────────────────────────
  const renderItems = useMemo<RenderItem[]>(() => {
    const agentMap = new Map(agents.map(a => [a.id, a]))
    const done = new Set<string>()
    const items: RenderItem[] = []

    for (const agent of agents) {
      if (done.has(agent.id)) continue
      const partnerId = agent.binome_agent_id
      const partner = partnerId ? agentMap.get(partnerId) : undefined

      if (partner && !done.has(partner.id)) {
        // Afficher une seule fois : primary = UUID lexicalement plus petit
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
  }, [agents])

  return (
    <>
      <div className="p-4 md:p-8 pb-24 md:pb-8 space-y-4">
        {/* Barre d'actions */}
        <div className="flex items-center gap-3 flex-wrap justify-end">

          {/* Bouton géocodage — visible seulement si des adresses sont à géocoder */}
          {agentsAGeocoder.length > 0 && geoState.status !== 'done' && (
            <button
              onClick={lancerGeocodage}
              disabled={geoState.status === 'running'}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {geoState.status === 'running' ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-[#0BBFBF]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  {geoState.done}/{geoState.total} adresses…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/>
                  </svg>
                  Géocoder les adresses ({agentsAGeocoder.length})
                </>
              )}
            </button>
          )}

          {/* Résultat géocodage */}
          {geoState.status === 'done' && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm bg-green-50 border border-green-200 text-green-700">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {geoState.success} géocodée{geoState.success > 1 ? 's' : ''}
              {geoState.errors > 0 && (
                <span className="text-amber-600 ml-1">· {geoState.errors} échec{geoState.errors > 1 ? 's' : ''}</span>
              )}
            </div>
          )}

          <button onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Ajouter un agent
          </button>
        </div>

        {/* Liste */}
        <div className="space-y-3">
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

            // Carte binôme englobante
            const { primary, secondary } = item
            const facteur = primary.facteur_binome ?? 0.60
            const gainPct = Math.round((1 - facteur) * 100)

            return (
              <div key={`binome-${primary.id}`}
                className="rounded-2xl border-2 border-[#0BBFBF]/30 bg-[#0BBFBF]/5 p-3 space-y-2">
                {/* Header binôme */}
                <div className="flex items-center gap-2 px-1">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0BBFBF] text-white text-xs font-semibold rounded-full">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
                    </svg>
                    Binôme
                  </span>
                  <span className="text-xs text-slate-500">
                    {primary.prenom} {primary.nom} &amp; {secondary.prenom} {secondary.nom}
                  </span>
                </div>

                {/* Agent principal */}
                <AgentCard
                  agent={primary}
                  isLoading={loading === primary.id}
                  onEdit={() => openEdit(primary)}
                  onToggle={() => toggleActif(primary)}
                  onCongés={() => setAbsenceDrawerAgent(primary)}
                />

                {/* Agent secondaire */}
                <AgentCard
                  agent={secondary}
                  isLoading={loading === secondary.id}
                  onEdit={() => openEdit(secondary)}
                  onToggle={() => toggleActif(secondary)}
                  onCongés={() => setAbsenceDrawerAgent(secondary)}
                />

                {/* Footer vitesse */}
                <div className="flex items-center gap-2 px-2 pt-1">
                  <span className="text-xs text-[#0BBFBF]">
                    ⚡ Vitesse binôme : ×{facteur.toFixed(2)}
                    {gainPct > 0 ? ` (${gainPct}% plus rapide à deux)` : ' (aucun gain)'}
                  </span>
                </div>
              </div>
            )
          })}

          {agents.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">
              <p className="text-4xl mb-3">👥</p>
              <p>Aucun agent dans votre équipe.</p>
              <button onClick={openCreate} className="mt-4 px-4 py-2 bg-[#1A5FA8] text-white rounded-xl text-sm font-medium">
                Ajouter le premier agent
              </button>
            </div>
          )}
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
