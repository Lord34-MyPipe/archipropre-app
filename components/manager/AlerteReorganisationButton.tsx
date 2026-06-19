'use client'

import { useState } from 'react'
import ReorganisationPanel from './ReorganisationPanel'

interface AlerteMetadata {
  agent_id: string
  date_debut: string
  date_fin: string
  nb_orphelines: number
  intervention_ids: string[]
}

interface Props {
  alerteId: string
  message: string
  metadata: AlerteMetadata | null
}

interface Plan {
  redistribuer: Array<{
    intervention_id: string
    agent_id_propose: string
    agent_nom: string
    charge_apres_pct: number
    avertissements: string[]
  }>
  annuler: Array<{
    intervention_id: string
    raison: string
  }>
  resume: string
}

interface AgentDisponible {
  id: string
  prenom: string
  nom: string
}

export default function AlerteReorganisationButton({ message, metadata }: Props) {
  const [loading, setLoading]               = useState(false)
  const [toast, setToast]                   = useState('')
  const [panelOpen, setPanelOpen]           = useState(false)
  const [plan, setPlan]                     = useState<Plan | null>(null)
  const [context, setContext]               = useState<{ agent_absent: string; periode: string; nb_orphelines: number } | null>(null)
  const [agentsDisponibles, setAgents]      = useState<AgentDisponible[]>([])

  async function handleClick() {
    if (!metadata) {
      showToast('Données insuffisantes')
      return
    }

    setLoading(true)
    try {
      const [resPlan, resAgents] = await Promise.all([
        fetch('/api/ia/reorganisation', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id:         metadata.agent_id,
            date_debut:       metadata.date_debut,
            date_fin:         metadata.date_fin,
            intervention_ids: metadata.intervention_ids,
          }),
        }),
        fetch('/api/agents'),
      ])

      const dataPlan   = await resPlan.json()
      const dataAgents = await resAgents.json()

      if (!resPlan.ok) {
        showToast(dataPlan.error ?? 'Erreur IA')
        return
      }

      setPlan(dataPlan.plan)
      setContext(dataPlan.context)
      setAgents(dataAgents.agents ?? [])
      setPanelOpen(true)
    } catch (e) {
      console.error('[ANA Réorganisation] erreur réseau :', e)
      showToast('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  function handleApplique() {
    setPanelOpen(false)
    showToast('Plan appliqué — redistribution à venir (étape 4)')
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors disabled:opacity-60 disabled:cursor-wait">
        {loading ? (
          <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
          </svg>
        )}
        {loading ? 'ANA réfléchit…' : 'Réorganiser avec ANA'}
      </button>

      {plan && context && (
        <ReorganisationPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          plan={plan}
          context={context}
          agentsDisponibles={agentsDisponibles}
          onApplique={handleApplique}
        />
      )}

      {toast && (
        <div className="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#0A2E5A] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none whitespace-nowrap">
          {toast}
        </div>
      )}
    </>
  )
}
