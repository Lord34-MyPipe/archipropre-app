'use client'

import { useState } from 'react'

interface Props {
  residenceId: string
  onClose: () => void
  onSuccess: () => void
}

const today     = new Date().toISOString().split('T')[0]
const nextYear  = new Date(new Date().setFullYear(new Date().getFullYear() + 1))
  .toISOString().split('T')[0]

export default function AjoutContratModal({ residenceId, onClose, onSuccess }: Props) {
  const [libelle,             setLibelle]            = useState('')
  const [typeContrat,         setTypeContrat]        = useState('parties_communes')
  const [dateDebut,           setDateDebut]          = useState(today)
  const [dateFin,             setDateFin]            = useState(nextYear)
  const [montantMensuel,      setMontantMensuel]     = useState<number>(0)
  const [nbInterventions,     setNbInterventions]    = useState<number>(0)
  const [loading,             setLoading]            = useState(false)
  const [error,               setError]              = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/residences/${residenceId}/contrats`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libelle,
          type_contrat:          typeContrat,
          date_debut:            dateDebut,
          date_fin:              dateFin,
          montant_mensuel:       montantMensuel,
          nb_interventions_mois: nbInterventions,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erreur inconnue.'); return }
      onSuccess()
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">Ajouter un contrat</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Fermer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

          {/* Libellé */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Libellé <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={libelle}
              onChange={e => setLibelle(e.target.value)}
              placeholder="ex. Bâtiment B, Containers…"
              required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5FA8] focus:border-transparent"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
            <select
              value={typeContrat}
              onChange={e => setTypeContrat(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5FA8] bg-white"
            >
              <option value="parties_communes">🏢 Parties communes</option>
              <option value="containers">🗑️ Containers</option>
              <option value="espaces_verts">🌿 Espaces verts</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Date début <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dateDebut}
                onChange={e => setDateDebut(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5FA8]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Date fin <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dateFin}
                onChange={e => setDateFin(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5FA8]"
              />
            </div>
          </div>

          {/* Montant + nb interventions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Montant mensuel (€)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={montantMensuel}
                onChange={e => setMontantMensuel(parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5FA8]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Interventions/mois
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={nbInterventions}
                onChange={e => setNbInterventions(parseInt(e.target.value, 10) || 0)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A5FA8]"
              />
            </div>
          </div>

          {/* Erreur */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1 pb-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-[#1A5FA8] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#0A4A8A] transition-colors disabled:opacity-50"
            >
              {loading ? 'Création…' : 'Créer le contrat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
