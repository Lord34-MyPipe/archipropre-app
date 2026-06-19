'use client'

import { useState } from 'react'

interface RedistribuerItem {
  intervention_id: string
  agent_id_propose: string
  agent_nom: string
  charge_apres_pct: number
  avertissements: string[]
}

interface AnnulerItem {
  intervention_id: string
  raison: string
}

interface Plan {
  redistribuer: RedistribuerItem[]
  annuler: AnnulerItem[]
  resume: string
}

interface ReorganisationPanelProps {
  open: boolean
  onClose: () => void
  plan: Plan
  context: {
    agent_absent: string
    periode: string
    nb_orphelines: number
  }
  agentsDisponibles: Array<{ id: string; prenom: string; nom: string }>
  onApplique: (planModifie: Plan) => void
}

export default function ReorganisationPanel({
  open,
  onClose,
  plan,
  context,
  agentsDisponibles,
  onApplique,
}: ReorganisationPanelProps) {
  const [redistribuer, setRedistribuer] = useState<RedistribuerItem[]>(plan.redistribuer)
  const [annulerConfirm, setAnnulerConfirm] = useState<Record<string, boolean>>({})

  function handleAgentChange(interventionId: string, newAgentId: string) {
    const agent = agentsDisponibles.find(a => a.id === newAgentId)
    setRedistribuer(prev =>
      prev.map(item =>
        item.intervention_id === interventionId
          ? { ...item, agent_id_propose: newAgentId, agent_nom: agent ? `${agent.prenom} ${agent.nom}` : item.agent_nom }
          : item
      )
    )
  }

  function handleApplique() {
    onApplique({ ...plan, redistribuer })
  }

  const nbTotal = redistribuer.length + plan.annuler.length

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Panneau */}
      <div
        className={`fixed top-0 right-0 h-full z-50 flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out
          w-full md:w-[420px]
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4" style={{ background: '#0A2E5A' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <div>
                <p className="text-white font-bold text-sm leading-tight">ANA — Réorganisation</p>
                <p className="text-blue-200 text-xs">{context.agent_absent} · {context.periode}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-blue-200 hover:text-white transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <p className="text-blue-200 text-xs mt-1">
            {context.nb_orphelines} intervention{context.nb_orphelines > 1 ? 's' : ''} à redistribuer
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Résumé ANA */}
          <p className="text-sm text-slate-500 italic border-l-2 border-slate-200 pl-3 leading-relaxed">
            {plan.resume}
          </p>

          {/* Section redistribuer */}
          {redistribuer.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Redistribuer ({redistribuer.length})
              </p>
              <div className="space-y-3">
                {redistribuer.map(item => (
                  <InterventionCard
                    key={item.intervention_id}
                    item={item}
                    agentsDisponibles={agentsDisponibles}
                    onAgentChange={newId => handleAgentChange(item.intervention_id, newId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Section annuler */}
          {plan.annuler.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Annuler ({plan.annuler.length})
              </p>
              <div className="space-y-2">
                {plan.annuler.map(item => (
                  <div key={item.intervention_id} className="rounded-xl border border-red-100 bg-red-50 p-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-red-500"
                        checked={annulerConfirm[item.intervention_id] ?? false}
                        onChange={e =>
                          setAnnulerConfirm(prev => ({ ...prev, [item.intervention_id]: e.target.checked }))
                        }
                      />
                      <div>
                        <p className="text-xs font-mono text-slate-400">{item.intervention_id.slice(0, 8)}…</p>
                        <p className="text-xs text-red-700 mt-0.5">{item.raison}</p>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer sticky */}
        <div className="flex-shrink-0 border-t border-slate-100 px-4 py-3 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleApplique}
            className="flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors"
            style={{ background: '#1A5FA8' }}
          >
            ✓ Appliquer ({nbTotal})
          </button>
        </div>
      </div>
    </>
  )
}

function InterventionCard({
  item,
  agentsDisponibles,
  onAgentChange,
}: {
  item: RedistribuerItem
  agentsDisponibles: Array<{ id: string; prenom: string; nom: string }>
  onAgentChange: (id: string) => void
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5">📍</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-slate-400">{item.intervention_id.slice(0, 8)}…</p>
        </div>
      </div>

      {/* Select agent */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 shrink-0">Agent :</span>
        <select
          value={item.agent_id_propose}
          onChange={e => onAgentChange(e.target.value)}
          className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
          {agentsDisponibles.map(a => (
            <option key={a.id} value={a.id}>
              {a.prenom} {a.nom}
            </option>
          ))}
        </select>
      </div>

      {/* Charge après */}
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(item.charge_apres_pct, 100)}%`,
              background: item.charge_apres_pct > 90 ? '#EF4444' : item.charge_apres_pct > 75 ? '#F59E0B' : '#22C55E',
            }}
          />
        </div>
        <span className="text-xs text-slate-500 shrink-0">{item.charge_apres_pct}%</span>
      </div>

      {/* Avertissements */}
      {item.avertissements.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 space-y-0.5">
          {item.avertissements.map((w, i) => (
            <p key={i} className="text-xs text-amber-700 flex items-start gap-1">
              <span className="shrink-0">⚠</span>
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
