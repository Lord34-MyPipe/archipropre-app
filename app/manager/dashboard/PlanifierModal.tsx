'use client'

import { useState } from 'react'

interface LigneCommande {
  id: string
  quantite: number
  localisation: string | null
  produits: { nom: string } | null
}

interface Commande {
  id: string
  agent_id: string
  residences: { nom: string } | { nom: string }[] | null
  lignes_commande: LigneCommande[]
}

interface Props {
  commande: Commande
  onClose: () => void
  onSaved: () => void
}

function nomResidence(c: Commande): string {
  const r = c.residences
  const obj = Array.isArray(r) ? r[0] : r
  return obj?.nom ?? '—'
}

export default function PlanifierModal({ commande, onClose, onSaved }: Props) {
  const todayStr = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
  const [date, setDate]                         = useState(todayStr)
  const [heure, setHeure]                       = useState('08:00')
  const [motif, setMotif]                       = useState('Récupération commande produits')
  const [estLivraisonManager, setEstLivraison]  = useState(false)
  const [suggesting, setSuggesting]             = useState(false)
  const [saving, setSaving]                     = useState(false)
  const [suggestionMsg, setSuggestionMsg]       = useState<string | null>(null)

  async function suggererIA() {
    setSuggesting(true)
    setSuggestionMsg(null)
    try {
      const res = await fetch('/api/ia/suggestion-passage', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agent_id: commande.agent_id, date }),
      })
      if (res.ok) {
        const data = await res.json()
        setHeure(data.heure_suggeree)
        setSuggestionMsg(data.justification)
      }
    } finally {
      setSuggesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/passages-siege', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          agent_id:              commande.agent_id,
          commande_id:           commande.id,
          date,
          heure_prevue:          heure,
          motif,
          est_livraison_manager: estLivraisonManager,
        }),
      })
      if (res.ok) onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-4 shadow-xl">

        <div className="flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-base">Planifier un passage siège</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <p className="text-sm text-slate-500">
          {nomResidence(commande)} · {commande.lignes_commande.length} article{commande.lignes_commande.length > 1 ? 's' : ''}
        </p>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Date</label>
          <input
            type="date"
            value={date}
            min={todayStr}
            onChange={e => setDate(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/30"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-600">Heure</label>
            <button
              onClick={suggererIA}
              disabled={suggesting}
              className="text-xs font-medium px-2 py-1 rounded-lg disabled:opacity-50 transition-opacity"
              style={{ color: '#0BBFBF' }}
            >
              {suggesting ? '…' : '🤖 Suggérer IA'}
            </button>
          </div>
          <input
            type="time"
            value={heure}
            onChange={e => setHeure(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/30"
          />
          {suggestionMsg && (
            <p className="text-xs text-slate-500 italic mt-1">{suggestionMsg}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Motif</label>
          <input
            type="text"
            value={motif}
            onChange={e => setMotif(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/30"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={estLivraisonManager}
            onChange={e => setEstLivraison(e.target.checked)}
            className="w-4 h-4 rounded accent-[#0BBFBF]"
          />
          <span className="text-sm text-slate-700">Le manager livre directement (sans passage agent)</span>
        </label>

        <button
          onClick={handleSave}
          disabled={saving || !date || !heure || !motif}
          className="w-full h-12 rounded-2xl text-white font-semibold text-sm disabled:opacity-50 transition-opacity"
          style={{ background: 'linear-gradient(135deg,#0BBFBF,#1A5FA8)' }}
        >
          {saving ? 'Planification…' : 'Planifier le passage'}
        </button>

      </div>
    </div>
  )
}
