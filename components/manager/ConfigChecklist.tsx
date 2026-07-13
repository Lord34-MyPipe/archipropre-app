'use client'

import { Check } from 'lucide-react'

export interface ChecklistSteps {
  step1: boolean  // contrat créé (actif + montant + créneaux)
  step2: boolean  // zones + tâches
  step3: boolean  // agent attitré
  step4: boolean  // planning généré
}

interface Props {
  libelle?: string | null          // affiché si plusieurs contrats
  steps: ChecklistSteps
  onStep1: () => void
  onStep2: () => void
  onStep3: () => void
  onStep4: () => void
  busyStep4?: boolean
}

type Visual = 'done' | 'current' | 'pending'

// Le 1er non-fait est "courant" (bleu), les suivants "en attente" (gris)
function visuals(s: ChecklistSteps): Visual[] {
  const done = [s.step1, s.step2, s.step3, s.step4]
  let currentSet = false
  return done.map(d => {
    if (d) return 'done'
    if (!currentSet) { currentSet = true; return 'current' }
    return 'pending'
  })
}

const CIRCLE: Record<Visual, string> = {
  done:    'bg-green-100 text-green-700 border-green-200',
  current: 'bg-blue-600 text-white border-blue-600',
  pending: 'bg-slate-100 text-slate-400 border-slate-200',
}

export default function ConfigChecklist({ libelle, steps, onStep1, onStep2, onStep3, onStep4, busyStep4 }: Props) {
  const v = visuals(steps)
  const locked = !steps.step1  // étapes 2/3/4 verrouillées tant que le contrat n'est pas créé

  const rows: { label: string; done: boolean; onClick: () => void; disabled: boolean; cta: string }[] = [
    { label: 'Créer le contrat',        done: steps.step1, onClick: onStep1, disabled: false,  cta: steps.step1 ? 'Modifier' : 'Créer' },
    { label: 'Ajouter zones et tâches', done: steps.step2, onClick: onStep2, disabled: locked, cta: 'Configurer' },
    { label: 'Affecter un agent',       done: steps.step3, onClick: onStep3, disabled: locked, cta: 'Affecter' },
    { label: 'Générer le planning',     done: steps.step4, onClick: onStep4, disabled: locked, cta: busyStep4 ? 'Génération…' : 'Générer' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-bold text-slate-800">Configurer cette résidence</h2>
        {libelle && <span className="text-xs text-slate-400">· {libelle}</span>}
      </div>
      <p className="text-xs text-slate-400 mb-4">4 étapes pour rendre ce contrat opérationnel.</p>

      <ol className="space-y-1">
        {rows.map((row, i) => {
          const vis = v[i]
          const isDisabled = row.disabled && !row.done
          return (
            <li
              key={i}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${vis === 'current' ? 'bg-blue-50/60' : ''}`}
            >
              <span className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${CIRCLE[vis]}`}>
                {row.done ? <Check className="w-4 h-4" /> : i + 1}
              </span>
              <span className={`flex-1 text-sm ${row.done ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                {row.label}
              </span>
              {row.done ? (
                <button
                  onClick={row.onClick}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2 py-1 transition-colors"
                >
                  {row.cta}
                </button>
              ) : (
                <button
                  onClick={row.onClick}
                  disabled={isDisabled || (i === 3 && busyStep4)}
                  title={isDisabled ? 'Créez d\'abord le contrat' : undefined}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    isDisabled
                      ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                      : vis === 'current'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {row.cta}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
