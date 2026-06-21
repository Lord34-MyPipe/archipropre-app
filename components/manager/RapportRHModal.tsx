'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { genererRapportRHPDF } from '@/lib/rapportRH'

interface RapportRHModalProps {
  open: boolean
  onClose: () => void
  agentId: string
  agentNom: string
  agentPrenom: string
  contratHeuresHebdo: number
  managerNom: string
}

function buildMonthOptions(): { label: string; year: number; month: number }[] {
  const options: { label: string; year: number; month: number }[] = []
  const now = new Date()
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    options.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    })
  }
  return options
}

export default function RapportRHModal({
  open, onClose,
  agentId, agentNom, agentPrenom, contratHeuresHebdo, managerNom,
}: RapportRHModalProps) {
  const options = buildMonthOptions()
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const selected = options[selectedIdx]
  const contratMensuel = Math.round(contratHeuresHebdo * 4.33 * 10) / 10

  const handleGenerer = async () => {
    setLoading(true)
    try {
      const supabase = createClient()

      const dateDebut = `${selected.year}-${String(selected.month).padStart(2, '0')}-01`
      const lastDay = new Date(selected.year, selected.month, 0).getDate()
      const dateFin = `${selected.year}-${String(selected.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const { data: journees } = await supabase
        .from('journees_agent')
        .select('date, total_minutes_terrain, total_minutes_trajets, validee_at')
        .eq('agent_id', agentId)
        .gte('date', dateDebut)
        .lte('date', dateFin)
        .not('validee_par', 'is', null)
        .order('date')

      genererRapportRHPDF({
        agent: {
          prenom: agentPrenom,
          nom: agentNom,
          contratHeuresHebdo,
        },
        manager: { nom: managerNom },
        mois: selected.month,
        annee: selected.year,
        journees: journees ?? [],
      })

      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        {/* En-tête */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-800">Rapport RH</h2>
            <p className="text-sm text-slate-500 mt-0.5">{agentPrenom} {agentNom}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
            aria-label="Fermer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Sélecteur de mois */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Mois
          </label>
          <select
            value={selectedIdx}
            onChange={e => setSelectedIdx(Number(e.target.value))}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] transition"
          >
            {options.map((opt, i) => (
              <option key={i} value={i}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Infos contrat */}
        <div className="bg-slate-50 rounded-xl p-3 mb-5 text-sm text-slate-600 space-y-1">
          <p>Contrat : <span className="font-semibold text-slate-800">{contratHeuresHebdo}h / semaine</span></p>
          <p>
            Contrat mensuel estimé :{' '}
            <span className="font-semibold text-slate-800">{contratMensuel}h</span>
            <span className="text-xs text-slate-400 ml-1">({contratHeuresHebdo}h × 4,33)</span>
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Annuler
          </button>
          <button
            onClick={handleGenerer}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition flex items-center justify-center gap-2"
            style={{ background: loading ? '#94A3B8' : '#0A2E5A' }}
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Génération…
              </>
            ) : (
              <>📄 Générer le PDF</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
