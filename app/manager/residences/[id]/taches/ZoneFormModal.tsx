'use client'

import { useState } from 'react'
import type { ZoneResidence } from '@/lib/types'

interface Props {
  residenceId: string
  contratId: string
  ordre: number                    // utilisé en création
  zone: ZoneResidence | null       // null = création ; sinon édition
  batimentsExistants: string[]     // bâtiments déjà saisis sur ce contrat (autocomplétion)
  onClose: () => void
  onSaved: (zone: ZoneResidence) => void
}

// Formulaire de zone (création/édition) : nom + bâtiment (facultatif, autocomplété).
// Réutilise la route /api/zones existante (POST création, PATCH édition).
export default function ZoneFormModal({ residenceId, contratId, ordre, zone, batimentsExistants, onClose, onSaved }: Props) {
  const isEdit = zone !== null
  const [nom, setNom]           = useState(zone?.nom ?? '')
  const [batiment, setBatiment] = useState(zone?.batiment ?? '')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const listId = 'batiments-autocomplete'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nomTrim = nom.trim()
    if (!nomTrim) { setError('Le nom de la zone est obligatoire.'); return }
    setSaving(true)
    setError(null)

    try {
      if (isEdit) {
        const res = await fetch('/api/zones', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: zone!.id, nom: nomTrim, batiment }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? 'Erreur'); setSaving(false); return }
        // La route PATCH renvoie { ok } : on reconstruit la zone à jour côté client.
        onSaved({ ...zone!, nom: nomTrim, batiment: batiment.trim() || null })
      } else {
        const res = await fetch('/api/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ residenceId, nom: nomTrim, ordre, contratId, batiment }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? 'Erreur'); setSaving(false); return }
        onSaved(json.data as ZoneResidence)
      }
    } catch {
      setError('Impossible de contacter le serveur.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white w-full md:max-w-md md:rounded-3xl rounded-t-3xl shadow-2xl p-6 space-y-4"
      >
        <h3 className="text-lg font-bold text-slate-800">
          {isEdit ? 'Modifier la zone' : 'Nouvelle zone'}
        </h3>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Nom de la zone
          </label>
          <input
            type="text"
            value={nom}
            onChange={e => setNom(e.target.value)}
            autoFocus
            placeholder="Hall, Escalier A…"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 focus:border-[#0BBFBF]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Bâtiment <span className="normal-case font-normal text-slate-400">(facultatif)</span>
          </label>
          <input
            type="text"
            value={batiment}
            onChange={e => setBatiment(e.target.value)}
            list={listId}
            placeholder="Bât A, Bât B…"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 focus:border-[#0BBFBF]"
          />
          <datalist id={listId}>
            {batimentsExistants.map(b => <option key={b} value={b} />)}
          </datalist>
          <p className="text-xs text-slate-400 mt-1.5">
            Laissez vide pour une résidence à un seul bâtiment.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
          >
            {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer la zone'}
          </button>
        </div>
      </form>
    </div>
  )
}
