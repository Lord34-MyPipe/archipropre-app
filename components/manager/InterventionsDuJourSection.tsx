'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

type InterJoined = {
  id: string
  agent_id: string
  residence_id: string
  date_prevue: string
  heure_debut_prevue: string | null
  statut: string
  disponible_apres_fin: boolean
  residences: {
    nom: string
    adresse: string
    agent_prefere_id: string | null
    agent_exclu_ids: string[]
    vehicule_requis: boolean
  }
  profiles: { nom: string; prenom: string; telephone: string | null }
}

interface AgentOpt {
  agent: Profile
  countToday: number
}

function scoreColor(score: number) {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

function quickScore(agent: Profile, inter: InterJoined, todayCount: number): number {
  const res = inter.residences
  if ((res.agent_exclu_ids ?? []).includes(agent.id)) return 0
  let s = 50
  if (agent.id === res.agent_prefere_id) s += 30
  if (res.vehicule_requis) s += agent.vehicule ? 20 : -20
  if ((agent.zones_geo ?? []).length > 0) s += 10
  s -= Math.min(todayCount * 10, 30)
  return Math.max(0, Math.min(100, s))
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

interface Props {
  initialInters: InterJoined[]
  absentIds: string[]
}

export default function InterventionsDuJourSection({ initialInters, absentIds }: Props) {
  const [inters, setInters]               = useState<InterJoined[]>(initialInters)
  const [reassignTarget, setReassignTarget] = useState<InterJoined | null>(null)
  const [agents, setAgents]               = useState<AgentOpt[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [selectedNewAgent, setSelectedNewAgent] = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)
  const [reassignError, setReassignError] = useState('')
  const [toast, setToast]                 = useState('')
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(''), 2800)
  }

  // Charger les agents quand on ouvre le modal réassignation
  useEffect(() => {
    if (!reassignTarget) return
    setLoadingAgents(true)
    setSelectedNewAgent(null)
    setReassignError('')

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const [{ data: agentsData }] = await Promise.all([
        supabase.from('profiles').select('*')
          .eq('manager_id', user.id).eq('actif', true).eq('role', 'agent').order('nom'),
      ])

      const countMap: Record<string, number> = {}
      inters.forEach(i => {
        countMap[i.agent_id] = (countMap[i.agent_id] ?? 0) + 1
      })

      const opts: AgentOpt[] = ((agentsData ?? []) as Profile[]).map(a => ({
        agent: a,
        countToday: countMap[a.id] ?? 0,
      }))

      // Trier: exclu/absent en bas, sinon par score
      opts.sort((a, b) => {
        const aExclu = (reassignTarget.residences.agent_exclu_ids ?? []).includes(a.agent.id)
        const bExclu = (reassignTarget.residences.agent_exclu_ids ?? []).includes(b.agent.id)
        const aAbsent = absentIds.includes(a.agent.id)
        const bAbsent = absentIds.includes(b.agent.id)
        if ((aExclu || aAbsent) && !(bExclu || bAbsent)) return 1
        if (!(aExclu || aAbsent) && (bExclu || bAbsent)) return -1
        const sa = quickScore(a.agent, reassignTarget, a.countToday)
        const sb = quickScore(b.agent, reassignTarget, b.countToday)
        return sb - sa
      })
      setAgents(opts)
      setLoadingAgents(false)
    })
  }, [reassignTarget, inters, absentIds])

  async function handleReassign() {
    if (!selectedNewAgent || !reassignTarget) return
    setSaving(true)
    setReassignError('')
    const res = await fetch('/api/interventions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interventionId: reassignTarget.id, agentId: selectedNewAgent }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setReassignError(json.error ?? 'Erreur'); return }

    // Mise à jour locale
    const newAgent = agents.find(a => a.agent.id === selectedNewAgent)?.agent
    if (newAgent) {
      setInters(prev => prev.map(i =>
        i.id === reassignTarget.id
          ? { ...i, agent_id: selectedNewAgent,
              profiles: { nom: newAgent.nom, prenom: newAgent.prenom, telephone: newAgent.telephone } }
          : i
      ))
    }
    setReassignTarget(null)
    showToast('Agent réassigné avec succès')
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#0A2E5A] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none animate-fade-in">
          ✓ {toast}
        </div>
      )}

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
              <div key={i.id} className="px-5 py-4 flex items-center gap-3">
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
                {i.statut !== 'terminee' && (
                  <button
                    onClick={() => setReassignTarget(i)}
                    className="shrink-0 px-2.5 py-1.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-[#1A5FA8] hover:text-white transition-colors"
                  >
                    Réassigner
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Réassignation */}
      {reassignTarget && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setReassignTarget(null)}/>
          <div className="relative bg-white w-full md:max-w-md md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]">

            <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full"/>
            </div>

            <div className="px-6 pt-4 pb-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800 text-lg">Réassigner</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {reassignTarget.residences.nom} · {reassignTarget.heure_debut_prevue?.slice(0,5) ?? '—'}
              </p>
              {reassignError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{reassignError}</div>
              )}
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Choisir le nouvel agent
              </p>
              {loadingAgents ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse"/>)}
                </div>
              ) : (
                agents.map(({ agent, countToday }) => {
                  const excluded = (reassignTarget.residences.agent_exclu_ids ?? []).includes(agent.id)
                  const absent   = absentIds.includes(agent.id)
                  const isCurrent = agent.id === reassignTarget.agent_id
                  const disabled  = excluded || absent
                  const score = quickScore(agent, reassignTarget, countToday)
                  const isSelected = selectedNewAgent === agent.id

                  return (
                    <div
                      key={agent.id}
                      onClick={() => { if (!disabled && !isCurrent) setSelectedNewAgent(agent.id) }}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all ${
                        isCurrent
                          ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                          : disabled
                            ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'
                            : isSelected
                              ? 'border-[#0BBFBF] bg-[#0BBFBF]/5 cursor-pointer'
                              : 'border-slate-100 hover:border-slate-300 cursor-pointer'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 ${
                        disabled || isCurrent ? 'bg-slate-400' : isSelected ? 'bg-[#0BBFBF]' : 'bg-[#1A5FA8]'
                      }`}>
                        {agent.prenom[0]}{agent.nom[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-800">{agent.prenom} {agent.nom}</p>
                          {isCurrent && <span className="text-xs text-slate-400">(actuel)</span>}
                          {excluded && <span className="text-xs text-red-500">Exclu</span>}
                          {absent && !excluded && <span className="text-xs text-red-500">Absent</span>}
                        </div>
                        {!disabled && !isCurrent && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${score}%`, background: scoreColor(score) }}/>
                            </div>
                            <span className="text-xs font-bold shrink-0" style={{ color: scoreColor(score) }}>{score}</span>
                            {countToday > 0 && (
                              <span className="text-xs text-slate-400 shrink-0">{countToday} interv.</span>
                            )}
                          </div>
                        )}
                      </div>
                      {isSelected && <span className="text-[#0BBFBF] font-bold shrink-0">✓</span>}
                    </div>
                  )
                })
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                onClick={() => setReassignTarget(null)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleReassign}
                disabled={saving || !selectedNewAgent}
                className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
              >
                {saving ? 'Réassignation…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
