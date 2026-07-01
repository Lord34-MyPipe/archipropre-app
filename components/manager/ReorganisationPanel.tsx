'use client'

import { useState } from 'react'
import { Bot, MapPin, AlertTriangle } from 'lucide-react'

interface RedistribuerItem {
  intervention_id: string
  agent_id_propose: string
  agent_nom: string
  charge_apres_pct: number
  avertissements: string[]
  residence_nom: string | null
  date_prevue: string | null
  heure_debut: string | null
  heure_fin: string | null
}

interface AnnulerItem {
  intervention_id: string
  raison: string
  residence_nom: string | null
  date_prevue: string | null
  heure_debut: string | null
  heure_fin: string | null
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
  alerteId: string
  onApplique: () => void
}

function formatDate(d: string | null): string {
  if (!d) return '?'
  const dt = new Date(d + 'T12:00:00Z')
  return dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatHeure(h: string | null): string {
  return h ? h.substring(0, 5) : '?'
}

export default function ReorganisationPanel({
  open,
  onClose,
  plan,
  context,
  agentsDisponibles,
  alerteId,
  onApplique,
}: ReorganisationPanelProps) {
  const [redistribuer, setRedistribuer]     = useState<RedistribuerItem[]>(plan.redistribuer)
  const [annulerConfirm, setAnnulerConfirm] = useState<Record<string, boolean>>({})
  const [applying, setApplying]             = useState(false)
  const [toast, setToast]                   = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

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

  async function handleApplique() {
    setApplying(true)
    try {
      const annulees = plan.annuler.filter(a => annulerConfirm[a.intervention_id])

      const res = await fetch('/api/ia/reorganisation/appliquer', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redistribuer: redistribuer.map(r => ({
            intervention_id:  r.intervention_id,
            agent_id_propose: r.agent_id_propose,
          })),
          annuler:   annulees.map(a => ({ intervention_id: a.intervention_id })),
          alerte_id: alerteId,
        }),
      })

      const data = await res.json()

      if (data.success) {
        const msg = `✓ ${data.redistribuees} redistribuée${data.redistribuees > 1 ? 's' : ''}${data.annulees > 0 ? `, ${data.annulees} annulée${data.annulees > 1 ? 's' : ''}` : ''}`
        showToast(msg)
        setTimeout(() => {
          onApplique()
        }, 1200)
      } else {
        showToast(data.error ?? "Erreur lors de l'application du plan")
      }
    } catch {
      showToast('Erreur réseau')
    } finally {
      setApplying(false)
    }
  }

  const nbTotal = redistribuer.length + Object.values(annulerConfirm).filter(Boolean).length

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
              <Bot className="w-5 h-5 text-white" />
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

        {/* Body scrollable */}
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
                        <p className="text-xs font-semibold text-red-800">
                          {item.residence_nom ?? item.intervention_id.slice(0, 8) + '…'}
                        </p>
                        {item.date_prevue && (
                          <p className="text-xs text-red-600">
                            {formatDate(item.date_prevue)} · {formatHeure(item.heure_debut)}→{formatHeure(item.heure_fin)}
                          </p>
                        )}
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
            disabled={applying}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleApplique}
            disabled={applying}
            className="flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: '#1A5FA8' }}
          >
            {applying ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
            ) : (
              `✓ Appliquer (${nbTotal})`
            )}
          </button>
        </div>
      </div>

      {/* Toast interne au panneau */}
      {toast && (
        <div className="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-[60] bg-[#0A2E5A] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none whitespace-nowrap">
          {toast}
        </div>
      )}
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
      {/* Résidence + créneau */}
      <div>
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          {item.residence_nom ?? '—'}
        </p>
        {item.date_prevue && (
          <p className="text-xs text-slate-500 mt-0.5">
            {formatDate(item.date_prevue)} · {formatHeure(item.heure_debut)}→{formatHeure(item.heure_fin)}
          </p>
        )}
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

      {/* Barre de charge */}
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
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
