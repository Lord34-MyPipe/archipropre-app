'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { Residence, Profile } from '@/lib/types'

interface AbsenceInfo {
  agentId: string
  agentPrenom: string
  dateDebut: string
  dateFin: string
}

type RenderEntry =
  | { type: 'solo';   agent: Profile; absences: AbsenceInfo[] }
  | { type: 'binome'; primary: Profile; secondary: Profile; absences: AbsenceInfo[] }

interface Props {
  residence: Residence
  onClose: () => void
  onSaved: (agentPrefereId: string | null, agentExcluIds: string[]) => void
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function DoubleAvatar({ a, b, selected }: { a: Profile; b: Profile; selected: boolean }) {
  const bg = selected ? '#0BBFBF' : '#1A5FA8'
  return (
    <div className="relative w-14 h-10 shrink-0">
      <div className="absolute left-0 top-0 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs border-2 border-white"
        style={{ background: bg, zIndex: 1 }}>
        {a.prenom[0]}{a.nom[0]}
      </div>
      <div className="absolute left-5 top-0 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs border-2 border-white"
        style={{ background: selected ? '#0BBFBF' : '#0A2E5A', zIndex: 2 }}>
        {b.prenom[0]}{b.nom[0]}
      </div>
    </div>
  )
}

export default function AgentAttitreModal({ residence, onClose, onSaved }: Props) {
  const [agents, setAgents]           = useState<Profile[]>([])
  const [absences, setAbsences]       = useState<AbsenceInfo[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedId, setSelectedId]   = useState<string | null>(residence.agent_prefere_id)
  const [excludedIds, setExcludedIds] = useState<string[]>(residence.agent_exclu_ids ?? [])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [suggesting, setSuggesting]   = useState(false)
  const [suggestion, setSuggestion]   = useState<{ agentId: string; raison: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      // Agents
      const { data: agentData } = await supabase
        .from('profiles').select('*')
        .eq('manager_id', user.id).eq('actif', true).eq('role', 'agent')
        .order('nom')
      const list = (agentData ?? []) as Profile[]
      setAgents(list)

      // Absences + congés semaine courante
      const today = new Date().toISOString().split('T')[0]
      const in30  = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
      const ids   = list.map(a => a.id)
      if (ids.length === 0) { setLoading(false); return }

      const [{ data: abs }, { data: cgs }] = await Promise.all([
        supabase.from('absences').select('agent_id, date_debut, date_fin')
          .in('agent_id', ids).lte('date_debut', in30).gte('date_fin', today),
        supabase.from('conges').select('agent_id, date_debut, date_fin')
          .in('agent_id', ids).lte('date_debut', in30).gte('date_fin', today)
          .eq('statut', 'approuve'),
      ])

      const agentMap = new Map(list.map(a => [a.id, a]))
      const combined: AbsenceInfo[] = [
        ...(abs ?? []), ...(cgs ?? []),
      ].map(r => ({
        agentId:     r.agent_id,
        agentPrenom: agentMap.get(r.agent_id)?.prenom ?? '',
        dateDebut:   r.date_debut,
        dateFin:     r.date_fin,
      }))
      setAbsences(combined)
      setLoading(false)
    })
  }, [])

  // ── Groupage binômes ──────────────────────────────────────────────────────
  const entries = useMemo<RenderEntry[]>(() => {
    const agentMap = new Map(agents.map(a => [a.id, a]))
    const done     = new Set<string>()
    const items: RenderEntry[] = []

    const absFor = (id: string) => absences.filter(x => x.agentId === id)

    for (const agent of agents) {
      if (done.has(agent.id)) continue
      const partnerId = agent.binome_agent_id
      const partner   = partnerId ? agentMap.get(partnerId) : undefined

      if (partner && !done.has(partner.id)) {
        // Primary = alphabétiquement premier sur le nom
        const [primary, secondary] = agent.nom.localeCompare(partner.nom) <= 0
          ? [agent, partner]
          : [partner, agent]
        items.push({
          type: 'binome',
          primary,
          secondary,
          absences: [...absFor(primary.id), ...absFor(secondary.id)],
        })
        done.add(agent.id)
        done.add(partner.id)
      } else {
        items.push({ type: 'solo', agent, absences: absFor(agent.id) })
        done.add(agent.id)
      }
    }
    return items
  }, [agents, absences])

  function toggleExclu(id: string) {
    if (id === selectedId) return
    setExcludedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])
  }

  function selectEntry(entry: RenderEntry) {
    const primaryId = entry.type === 'binome' ? entry.primary.id : entry.agent.id
    const isSelected = selectedId === primaryId
      || (entry.type === 'binome' && selectedId === entry.secondary.id)
    setSelectedId(isSelected ? null : primaryId)
    if (!isSelected) {
      // retirer du tableau des exclus
      const ids = entry.type === 'binome'
        ? [entry.primary.id, entry.secondary.id]
        : [entry.agent.id]
      setExcludedIds(prev => prev.filter(i => !ids.includes(i)))
    }
  }

  async function handleSuggest() {
    setSuggesting(true)
    setSuggestion(null)
    setError('')
    const res = await fetch('/api/residences/suggest-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residenceId: residence.id }),
    })
    const json = await res.json()
    setSuggesting(false)
    if (!res.ok) { setError(json.error ?? 'Erreur IA'); return }
    setSuggestion(json)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const res = await fetch('/api/residences/affecter', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residenceId:    residence.id,
        agentPrefereId: selectedId,
        agentExcluIds:  excludedIds,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); return }
    onSaved(selectedId, excludedIds)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full"/>
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-3 shrink-0">
          <h3 className="font-bold text-slate-800 text-lg">Agent attitré</h3>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{residence.nom}</p>
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
          )}
        </div>

        {/* Bouton Suggestion IA + bandeau résultat — toujours visible, jamais scrollable */}
        <div className="px-6 pb-4 shrink-0 border-b border-slate-100">
          <button
            onClick={handleSuggest}
            disabled={suggesting || loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
            style={{ background: '#0BBFBF' }}
          >
            {suggesting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Analyse en cours…
              </>
            ) : (
              <>
                <span>✨</span>
                Obtenir une suggestion IA
              </>
            )}
          </button>

          {suggestion && (
            <div className="mt-3 p-3 bg-teal-50 border border-teal-200 rounded-xl">
              <p className="text-xs font-semibold text-teal-700">✨ Recommandation IA</p>
              <p className="text-xs text-teal-600 mt-1 leading-relaxed">{suggestion.raison}</p>
              <button
                onClick={() => {
                  setSelectedId(suggestion.agentId)
                  setExcludedIds(prev => prev.filter(i => i !== suggestion.agentId))
                  setSuggestion(null)
                }}
                className="mt-2 text-xs font-semibold text-teal-700 underline hover:text-teal-900"
              >
                Appliquer la suggestion
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse"/>)}
            </div>
          ) : agents.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">Aucun agent dans votre équipe.</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Cliquer pour sélectionner l'agent attitré · ✕ pour exclure
              </p>
              <div className="space-y-2">
                {entries.map(entry => {
                  if (entry.type === 'solo') {
                    const a           = entry.agent
                    const isAttitré   = selectedId === a.id
                    const isExclu     = excludedIds.includes(a.id)
                    const isSuggested = suggestion?.agentId === a.id
                    return (
                      <div
                        key={a.id}
                        onClick={() => { if (!isExclu) selectEntry(entry) }}
                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                          isExclu
                            ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                            : isAttitré
                              ? 'border-[#0BBFBF] bg-[#0BBFBF]/5 cursor-pointer'
                              : isSuggested
                                ? 'border-purple-300 bg-purple-50 cursor-pointer'
                                : 'border-slate-100 hover:border-slate-300 cursor-pointer'
                        }`}
                      >
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                          isAttitré ? 'bg-[#0BBFBF]' : 'bg-[#1A5FA8]'
                        }`}>
                          {a.prenom[0]}{a.nom[0]}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-800">{a.prenom} {a.nom}</p>
                            {isAttitré && (
                              <span className="px-2 py-0.5 bg-[#0BBFBF]/20 text-[#0A6060] text-xs rounded-full font-semibold">Attitré ✓</span>
                            )}
                            {isSuggested && !isAttitré && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-semibold">✦ Suggéré IA</span>
                            )}
                            {a.vehicule && <span className="text-xs text-slate-400" title="Véhiculé">🚗</span>}
                          </div>
                          {(a.zones_geo ?? []).length > 0 && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate">{a.zones_geo.join(', ')}</p>
                          )}
                          {entry.absences.map((ab, i) => (
                            <p key={i} className="text-xs text-amber-600 mt-0.5">
                              ⚠️ Absent du {fmtDate(ab.dateDebut)} au {fmtDate(ab.dateFin)}
                            </p>
                          ))}
                        </div>

                        {/* Bouton exclure */}
                        <button
                          onClick={e => { e.stopPropagation(); if (!isAttitré) toggleExclu(a.id) }}
                          disabled={isAttitré}
                          title={isExclu ? 'Retirer des exclus' : 'Exclure cet agent'}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
                            isExclu
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600'
                          }`}
                        >
                          {isExclu ? 'Exclu ✓' : '✕'}
                        </button>
                      </div>
                    )
                  }

                  // ── Entrée binôme ─────────────────────────────────────────
                  const { primary, secondary } = entry
                  const isAttitré   = selectedId === primary.id || selectedId === secondary.id
                  const isSuggestedBinome = suggestion?.agentId === primary.id || suggestion?.agentId === secondary.id
                  return (
                    <div
                      key={`binome-${primary.id}`}
                      onClick={() => selectEntry(entry)}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                        isAttitré
                          ? 'border-[#0BBFBF] bg-[#0BBFBF]/5'
                          : isSuggestedBinome
                            ? 'border-purple-300 bg-purple-50'
                            : 'border-slate-100 hover:border-[#0BBFBF]/40'
                      }`}
                    >
                      {/* Double avatar */}
                      <DoubleAvatar a={primary} b={secondary} selected={isAttitré}/>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800">
                            {primary.prenom} {primary.nom} &amp; {secondary.prenom} {secondary.nom}
                          </p>
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-[#0BBFBF]/10 text-[#0BBFBF] text-xs rounded-full font-semibold">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
                            </svg>
                            Binôme
                          </span>
                          {isAttitré && (
                            <span className="px-2 py-0.5 bg-[#0BBFBF]/20 text-[#0A6060] text-xs rounded-full font-semibold">Attitré ✓</span>
                          )}
                          {isSuggestedBinome && !isAttitré && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-semibold">✦ Suggéré IA</span>
                          )}
                        </div>
                        {entry.absences.map((ab, i) => (
                          <p key={i} className="text-xs text-amber-600 mt-0.5">
                            ⚠️ {ab.agentPrenom} absent·e du {fmtDate(ab.dateDebut)} au {fmtDate(ab.dateFin)}
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>

              {excludedIds.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-red-700">
                    {excludedIds.length} agent(s) exclu(s)
                  </p>
                  <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                    Ces agents ne seront pas proposés par le moteur de matching pour cette résidence.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
