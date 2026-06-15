'use client'

import { useState } from 'react'
import type { Profile } from '@/lib/types'
import AgentFormModal from './AgentFormModal'
import AgentAbsenceDrawer from './AgentAbsenceDrawer'
import { useRouter } from 'next/navigation'

const JOURS_LABELS: Record<string, string> = {
  lundi: 'L', mardi: 'M', mercredi: 'Me',
  jeudi: 'J', vendredi: 'V', samedi: 'S', dimanche: 'D',
}

interface AgentWithStats extends Profile {
  stats: { total: number; terminees: number }
}

interface Props {
  agents: AgentWithStats[]
}

export default function AgentsClient({ agents: initial }: Props) {
  const router = useRouter()
  const [agents, setAgents] = useState(initial)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<Profile | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [absenceDrawerAgent, setAbsenceDrawerAgent] = useState<Profile | null>(null)

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(a: Profile) { setEditing(a); setModalOpen(true) }

  function onSaved() {
    setModalOpen(false)
    router.refresh()
  }

  async function toggleActif(agent: Profile) {
    if (agent.actif) {
      setConfirmDeactivate(agent)
      return
    }
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

  return (
    <>
      <div className="p-4 md:p-8 pb-24 md:pb-8 space-y-4">
        {/* Bouton ajouter */}
        <div className="flex justify-end">
          <button onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Ajouter un agent
          </button>
        </div>

        {/* Liste des agents */}
        <div className="space-y-3">
          {agents.map(agent => {
            const dispo = agent.disponibilites as Record<string, boolean> | null
            const joursActifs = Object.entries(dispo ?? {}).filter(([, v]) => v).map(([k]) => k)
            const isLoading = loading === agent.id

            return (
              <div key={agent.id}
                className={`bg-white rounded-2xl border border-slate-100 p-5 transition-opacity ${!agent.actif ? 'opacity-60' : ''}`}>
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
                  <button onClick={() => toggleActif(agent)} disabled={isLoading}
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
                    { label: 'Terminées', value: agent.stats.terminees },
                    { label: 'Taux', value: agent.stats.total ? `${Math.round(agent.stats.terminees / agent.stats.total * 100)}%` : '—' },
                  ].map(s => (
                    <div key={s.label} className="text-center bg-slate-50 rounded-xl py-2">
                      <p className="text-lg font-bold text-[#1A5FA8]">{s.value}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Tags compétences + zones */}
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
                          joursActifs.includes(j)
                            ? 'bg-[#1A5FA8] text-white'
                            : 'bg-slate-100 text-slate-300'
                        }`}>
                        {JOURS_LABELS[j]}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex gap-2 pt-3 border-t border-slate-100">
                  <button onClick={() => openEdit(agent)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/>
                    </svg>
                    Modifier
                  </button>
                  <button onClick={() => setAbsenceDrawerAgent(agent)}
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
                  <span className="ml-auto text-xs text-slate-400 self-center">
                    {agent.contrat_heures_hebdo}h/sem
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
