'use client'

import { useState } from 'react'

export type JoursMode = 'replace' | 'add'

interface Props {
  label: string          // ex. « Bât A » ou « Hall »
  nbTaches: number       // nombre de tâches ciblées
  initialJours?: string[] // jours déjà attribués (union) — pré-cochés à l'ouverture
  busy?: boolean
  onClose: () => void
  onApply: (mode: JoursMode, jours: string[]) => void
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

// Sélecteur de jours pour l'action groupée (bâtiment ou zone). §3.4.
// Deux modes explicites : Remplacer (écrase) / Ajouter (fusionne sans écraser).
export default function JoursBulkModal({ label, nbTaches, initialJours, busy, onClose, onApply }: Props) {
  const [mode, setMode]   = useState<JoursMode>('add')
  // Pré-coché avec les jours déjà attribués : l'utilisateur voit l'état actuel
  // avant de modifier (§ item 2). Le mode Ajouter/Remplacer reste inchangé.
  const [jours, setJours] = useState<string[]>(initialJours ?? [])

  function toggle(j: string) {
    setJours(prev => prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white w-full md:max-w-md md:rounded-3xl rounded-t-3xl shadow-2xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Modifier les jours</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {label} · {nbTaches} tâche{nbTaches > 1 ? 's' : ''} concernée{nbTaches > 1 ? 's' : ''}
          </p>
        </div>

        {/* Mode */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('add')}
            className={`px-3 py-2.5 rounded-xl border text-sm text-left transition-colors disabled:opacity-60 ${
              mode === 'add' ? 'border-[#0BBFBF] bg-[#0BBFBF]/5' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className={`block font-semibold ${mode === 'add' ? 'text-[#0A6060]' : 'text-slate-700'}`}>Ajouter</span>
            <span className="block text-xs text-slate-400 mt-0.5">Sans écraser l'existant</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('replace')}
            className={`px-3 py-2.5 rounded-xl border text-sm text-left transition-colors disabled:opacity-60 ${
              mode === 'replace' ? 'border-[#0BBFBF] bg-[#0BBFBF]/5' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className={`block font-semibold ${mode === 'replace' ? 'text-[#0A6060]' : 'text-slate-700'}`}>Remplacer</span>
            <span className="block text-xs text-slate-400 mt-0.5">Écrase les jours actuels</span>
          </button>
        </div>

        {/* Jours */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            {mode === 'add' ? 'Jour(s) à ajouter' : 'Nouveaux jours'}
          </label>
          <div className="flex flex-wrap gap-2">
            {JOURS.map(j => {
              const on = jours.includes(j.value)
              return (
                <button
                  key={j.value}
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(j.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-60 ${
                    on ? 'bg-[#0A2E5A] text-white border-[#0A2E5A]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {j.label}
                </button>
              )
            })}
          </div>
          {mode === 'replace' && jours.length === 0 && (
            <p className="text-xs text-amber-600 mt-1.5">Aucun jour sélectionné = les tâches n'auront plus de jour.</p>
          )}
        </div>

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
            type="button"
            onClick={() => onApply(mode, jours)}
            disabled={busy || (mode === 'add' && jours.length === 0)}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
          >
            {busy ? 'Application…' : 'Appliquer'}
          </button>
        </div>
      </div>
    </div>
  )
}
