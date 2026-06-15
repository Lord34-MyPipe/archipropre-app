'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Residence, Profile } from '@/lib/types'

interface Props {
  residence: Residence
  onClose: () => void
  onSaved: (agentPrefereId: string | null, agentExcluIds: string[]) => void
}

export default function AgentAttitreModal({ residence, onClose, onSaved }: Props) {
  const [agents, setAgents]           = useState<Profile[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedId, setSelectedId]   = useState<string | null>(residence.agent_prefere_id)
  const [excludedIds, setExcludedIds] = useState<string[]>(residence.agent_exclu_ids ?? [])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles').select('*')
        .eq('manager_id', user.id).eq('actif', true).eq('role', 'agent')
        .order('nom')
        .then(({ data }) => {
          setAgents((data ?? []) as Profile[])
          setLoading(false)
        })
    })
  }, [])

  function toggleExclu(id: string) {
    if (id === selectedId) return
    setExcludedIds(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    )
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const res = await fetch('/api/residences/affecter', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residenceId: residence.id,
        agentPrefereId: selectedId,
        agentExcluIds: excludedIds,
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
        <div className="px-6 pt-4 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-800 text-lg">Agent attitré</h3>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{residence.nom}</p>
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse"/>
              ))}
            </div>
          ) : agents.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-8">Aucun agent dans votre équipe.</p>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Cliquer pour sélectionner l'agent attitré · ✕ pour exclure
              </p>
              <div className="space-y-2">
                {agents.map(a => {
                  const isAttitré = selectedId === a.id
                  const isExclu   = excludedIds.includes(a.id)
                  return (
                    <div
                      key={a.id}
                      onClick={() => {
                        if (isExclu) return
                        setSelectedId(isAttitré ? null : a.id)
                        if (!isAttitré) {
                          // retirer de la liste des exclus si on le sélectionne
                          setExcludedIds(ids => ids.filter(i => i !== a.id))
                        }
                      }}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                        isExclu
                          ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                          : isAttitré
                            ? 'border-[#0BBFBF] bg-[#0BBFBF]/5 cursor-pointer'
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
                            <span className="px-2 py-0.5 bg-[#0BBFBF]/20 text-[#0A6060] text-xs rounded-full font-semibold">
                              Attitré ✓
                            </span>
                          )}
                          {a.vehicule && (
                            <span className="text-xs text-slate-400" title="Véhiculé">🚗</span>
                          )}
                        </div>
                        {(a.zones_geo ?? []).length > 0 && (
                          <p className="text-xs text-slate-400 mt-0.5 truncate">
                            {a.zones_geo.join(', ')}
                          </p>
                        )}
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
