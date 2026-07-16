'use client'

import { useState } from 'react'
import type { ZoneResidence, TacheTemplate } from '@/lib/types'
import { getTemplate } from '@/lib/templates'

interface Props {
  residenceId: string
  contratId: string
  ordreBase: number // ordre de départ des nouvelles zones (zones.length + 1)
  onClose: () => void
  onDone: (zones: ZoneResidence[], taches: TacheTemplate[]) => void
}

const JOURS: { value: string; label: string }[] = [
  { value: 'lundi',    label: 'Lun' },
  { value: 'mardi',    label: 'Mar' },
  { value: 'mercredi', label: 'Mer' },
  { value: 'jeudi',    label: 'Jeu' },
  { value: 'vendredi', label: 'Ven' },
  { value: 'samedi',   label: 'Sam' },
  { value: 'dimanche', label: 'Dim' },
]

// Instancie le template « copropriété » (6 zones × 5 tâches) sous une étiquette
// bâtiment, avec les jours choisis (fréquence hebdo). Réutilise les routes
// existantes /api/zones (POST) et /api/taches-template (POST). §3.3 / §3.4.
export default function AjoutBatimentModal({ residenceId, contratId, ordreBase, onClose, onDone }: Props) {
  const [nom, setNom]       = useState('')
  const [jours, setJours]   = useState<string[]>(['lundi'])
  const [busy, setBusy]     = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError]   = useState<string | null>(null)

  const tpl = getTemplate('copropriete')
  const nbZones  = tpl?.zones.length ?? 0
  const nbTaches = tpl?.zones.reduce((s, z) => s + z.taches.length, 0) ?? 0

  function toggleJour(j: string) {
    setJours(prev => prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nomTrim = nom.trim()
    if (!tpl) { setError('Template introuvable.'); return }
    if (!nomTrim) { setError('Le nom du bâtiment est obligatoire.'); return }
    if (jours.length === 0) { setError('Choisissez au moins un jour.'); return }

    setBusy(true)
    setError(null)
    const total = nbZones + nbTaches
    let done = 0
    setProgress({ done, total })

    const newZones: ZoneResidence[] = []
    const newTaches: TacheTemplate[] = []

    try {
      let ordre = ordreBase
      for (const tz of tpl.zones) {
        // 1. Créer la zone (route existante) avec l'étiquette bâtiment
        const zRes = await fetch('/api/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ residenceId, nom: tz.nom, ordre: ordre++, contratId, batiment: nomTrim, coefDuree: tz.coefDuree }),
        })
        const zJson = await zRes.json()
        if (!zRes.ok) throw new Error(zJson.error ?? 'Erreur création zone')
        const zone = zJson.data as ZoneResidence
        newZones.push(zone)
        done++; setProgress({ done, total })

        // 2. Créer ses tâches (route existante), séquentiel pour un ordre déterministe
        for (const tt of tz.taches) {
          const tRes = await fetch('/api/taches-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              residenceId,
              zoneId: zone.id,
              libelle: tt.libelle,
              frequenceType: 'hebdo',       // fréquence par défaut (§3.3)
              joursSemaine: jours,          // jours choisis appliqués à toutes les tâches
              dureeMinutes: 0,              // coefDuree/prorata = étape 7, pas ici
            }),
          })
          const tJson = await tRes.json()
          if (!tRes.ok) throw new Error(tJson.error ?? 'Erreur création tâche')
          newTaches.push(tJson.data as TacheTemplate)
          done++; setProgress({ done, total })
        }
      }
      onDone(newZones, newTaches)
    } catch (err) {
      // Création partielle possible : on remonte ce qui a été créé pour rester cohérent avec la base.
      setError((err instanceof Error ? err.message : 'Erreur') + (newZones.length ? ` (${newZones.length} zone(s) déjà créée(s))` : ''))
      setBusy(false)
      if (newZones.length) onDone(newZones, newTaches)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white w-full md:max-w-md md:rounded-3xl rounded-t-3xl shadow-2xl p-6 space-y-4"
      >
        <div>
          <h3 className="text-lg font-bold text-slate-800">Ajouter un bâtiment standard</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Crée {nbZones} zones et {nbTaches} tâches (modifiables ensuite).
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Nom du bâtiment
          </label>
          <input
            type="text"
            value={nom}
            onChange={e => setNom(e.target.value)}
            autoFocus
            disabled={busy}
            placeholder="Bât A, Bât B…"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 focus:border-[#0BBFBF] disabled:opacity-60"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Jour(s) par défaut
          </label>
          <div className="flex flex-wrap gap-2">
            {JOURS.map(j => {
              const on = jours.includes(j.value)
              return (
                <button
                  key={j.value}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleJour(j.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 ${
                    on ? 'bg-[#0A2E5A] text-white border-[#0A2E5A]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {j.label}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Appliqué à toutes les tâches créées (fréquence hebdomadaire).</p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="py-3 px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-70 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
          >
            {busy && progress
              ? `Création… ${progress.done}/${progress.total}`
              : `Créer le bâtiment (${nbZones} zones, ${nbTaches} tâches)`}
          </button>
        </div>
      </form>
    </div>
  )
}
