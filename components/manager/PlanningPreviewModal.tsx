'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Residence } from '@/lib/types'
export interface GeneratedIntervention {
  date: string
  heureDebut: string | null
  heureFin: string | null
  typePrincipal: string
  agentId?: string | null
  agentNom?: string | null
  taches: Array<{ id: string; libelle: string; dureeMinutes?: number; zone?: string | null }>
}

const TYPE_BG: Record<string, string> = {
  hebdo:             'bg-blue-500',
  mensuel:           'bg-green-500',
  trimestriel:       'bg-orange-500',
  semestriel:        'bg-purple-500',
  annuel:            'bg-red-500',
  contrainte_horaire:'bg-slate-500',
}
const TYPE_LABEL: Record<string, string> = {
  hebdo: 'Hebdo', mensuel: 'Mensuel', trimestriel: 'Trim.',
  semestriel: 'Semest.', annuel: 'Annuel', contrainte_horaire: 'Horaire',
}
const FR_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const FR_DAYS_SHORT = ['Lu','Ma','Me','Je','Ve','Sa','Di']

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const startDow = (first.getDay() + 6) % 7  // 0=Lun, 6=Dim
  const days: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) days.push(null)
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))
  while (days.length % 7 !== 0) days.push(null)
  return days
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

interface Props {
  interventions: GeneratedIntervention[]
  residence: Residence
  genDebut: string
  genFin: string
  onClose: () => void
  onValidated: (count: number, planningId: string) => void
}

export default function PlanningPreviewModal({
  interventions: initialInters,
  residence, genDebut, genFin,
  onClose, onValidated,
}: Props) {
  const [removed, setRemoved]         = useState<Set<string>>(new Set())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [absenceDates, setAbsenceDates] = useState<Set<string>>(new Set())
  const [validating, setValidating]     = useState(false)
  const [error, setError]               = useState('')
  const [conflictCount, setConflictCount] = useState<number | null>(null)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date(genDebut + 'T00:00')
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const detailRef = useRef<HTMLDivElement>(null)

  // Charger les absences de l'agent pour détecter les conflits
  useEffect(() => {
    const agentId = initialInters.find(i => i.agentId)?.agentId
    if (!agentId) return
    const supabase = createClient()
    Promise.all([
      supabase.from('absences').select('date_debut, date_fin')
        .eq('agent_id', agentId).eq('valide', true)
        .lte('date_debut', genFin).gte('date_fin', genDebut),
      supabase.from('conges').select('date_debut, date_fin')
        .eq('agent_id', agentId).eq('statut', 'valide')
        .lte('date_debut', genFin).gte('date_fin', genDebut),
    ]).then(([{ data: abs }, { data: cgs }]) => {
      const dates = new Set<string>()
      const addRange = (debut: string, fin: string) => {
        const s = new Date(debut + 'T00:00'), e = new Date(fin + 'T00:00')
        const c = new Date(s)
        while (c <= e) {
          dates.add(c.toISOString().split('T')[0])
          c.setDate(c.getDate() + 1)
        }
      }
      ;(abs ?? []).forEach(a => addRange(a.date_debut, a.date_fin))
      ;(cgs ?? []).forEach(c => addRange(c.date_debut, c.date_fin))
      setAbsenceDates(dates)
    })
  }, [initialInters, genDebut, genFin])

  const activeInters = useMemo(
    () => initialInters.filter(i => !removed.has(i.date)),
    [initialInters, removed]
  )

  const interByDate = useMemo(() => {
    const m = new Map<string, GeneratedIntervention>()
    activeInters.forEach(i => m.set(i.date, i))
    return m
  }, [activeInters])

  const conflicts = useMemo(
    () => activeInters.filter(i => absenceDates.has(i.date)),
    [activeInters, absenceDates]
  )

  // Stats par type
  const stats = useMemo(() => {
    const counts: Record<string, number> = {}
    activeInters.forEach(i => {
      counts[i.typePrincipal] = (counts[i.typePrincipal] ?? 0) + 1
    })
    return counts
  }, [activeInters])

  const { year, month } = currentMonth
  const calDays = getCalendarDays(year, month)

  function prevMonth() {
    setCurrentMonth(prev => {
      const m = prev.month - 1
      return m < 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: m }
    })
    setSelectedDate(null)
  }
  function nextMonth() {
    setCurrentMonth(prev => {
      const m = prev.month + 1
      return m > 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: m }
    })
    setSelectedDate(null)
  }

  const selectedInter = selectedDate ? interByDate.get(selectedDate) : null

  async function handleValidate(forceRegenerate = false) {
    setValidating(true)
    setError('')
    if (!forceRegenerate) setConflictCount(null)

    const res = await fetch('/api/planning/valider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residenceId: residence.id,
        dateDebut:   genDebut,
        dateFin:     genFin,
        interventions: activeInters,
        forceRegenerate,
      }),
    })
    const json = await res.json()
    setValidating(false)

    if (res.status === 409 && json.error === 'PLANNING_EXISTS') {
      setConflictCount(json.existingCount ?? 0)
      return
    }
    if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); return }
    onValidated(json.count, json.planningId)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-[#0A2E5A] text-white px-5 py-4 shrink-0 flex items-center gap-4">
        <button onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
          ✕
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-base truncate">Planning — {residence.nom}</h2>
          <p className="text-blue-300 text-xs mt-0.5">
            {new Date(genDebut + 'T00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })}
            {' → '}
            {new Date(genFin + 'T00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short', year:'numeric' })}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold">{activeInters.length}</p>
          <p className="text-blue-300 text-xs">interventions</p>
        </div>
      </div>

      {/* Conflits */}
      {conflicts.length > 0 && (
        <div className="shrink-0 mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5">
          <span className="text-amber-600 text-lg shrink-0">⚠️</span>
          <div>
            <p className="text-amber-800 text-sm font-semibold">
              {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''} détecté{conflicts.length > 1 ? 's' : ''}
            </p>
            <p className="text-amber-700 text-xs mt-0.5">
              L'agent attitré est absent le{conflicts.length > 1 ? 's' : ''}{' '}
              {conflicts.slice(0,3).map(c => new Date(c.date + 'T00:00').toLocaleDateString('fr-FR', { day:'numeric', month:'short' })).join(', ')}
              {conflicts.length > 3 ? ` et ${conflicts.length - 3} autres` : ''}.
              Supprimez ou réassignez ces interventions.
            </p>
          </div>
        </div>
      )}

      {/* Stats mini */}
      <div className="shrink-0 flex gap-2 px-4 py-3 overflow-x-auto">
        {Object.entries(stats).map(([type, count]) => (
          <div key={type} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white text-xs font-semibold shrink-0 ${TYPE_BG[type] ?? 'bg-slate-400'}`}>
            <span>{count}×</span><span>{TYPE_LABEL[type] ?? type}</span>
          </div>
        ))}
        {Object.keys(stats).length === 0 && (
          <p className="text-slate-400 text-sm">Toutes les interventions ont été supprimées.</p>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
        {/* Calendrier */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Navigation mois */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">
              ‹
            </button>
            <h3 className="font-bold text-slate-800 text-base">
              {FR_MONTHS[month]} {year}
            </h3>
            <button onClick={nextMonth}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600">
              ›
            </button>
          </div>

          {/* Jours de la semaine */}
          <div className="grid grid-cols-7 mb-1">
            {FR_DAYS_SHORT.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
            ))}
          </div>

          {/* Grille calendrier */}
          <div className="grid grid-cols-7 gap-0.5">
            {calDays.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`}/>
              const dateStr = day.toISOString().split('T')[0]
              const inter   = interByDate.get(dateStr)
              const isRemoved = removed.has(dateStr)
              const isConflict = inter && absenceDates.has(dateStr)
              const isSelected = selectedDate === dateStr
              const isToday = dateStr === new Date().toISOString().split('T')[0]

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (inter || isRemoved) setSelectedDate(selectedDate === dateStr ? null : dateStr)
                  }}
                  className={`relative aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                    isSelected
                      ? 'ring-2 ring-[#0A2E5A] ring-offset-1'
                      : ''
                  } ${
                    inter
                      ? isConflict
                        ? 'bg-amber-50 hover:bg-amber-100 cursor-pointer'
                        : 'bg-blue-50 hover:bg-blue-100 cursor-pointer'
                      : isRemoved
                        ? 'bg-slate-50 opacity-40 cursor-pointer'
                        : 'cursor-default'
                  }`}
                >
                  <span className={`text-xs font-semibold ${
                    isToday ? 'text-[#0BBFBF]' : inter ? 'text-slate-800' : 'text-slate-300'
                  }`}>
                    {day.getDate()}
                  </span>
                  {inter && !isRemoved && (
                    <div className={`w-2 h-2 rounded-full ${isConflict ? 'bg-amber-500' : TYPE_BG[inter.typePrincipal] ?? 'bg-blue-400'}`}/>
                  )}
                  {isRemoved && (
                    <div className="w-2 h-2 rounded-full bg-slate-200"/>
                  )}
                  {isConflict && (
                    <span className="absolute top-0.5 right-0.5 text-[8px]">⚠️</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel détail (desktop: colonne droite, mobile: fond fixe) */}
        {(selectedDate) && (
          <div ref={detailRef}
            className="md:w-72 md:border-l md:border-slate-100 border-t border-slate-100 bg-white overflow-y-auto shrink-0 p-4 space-y-3">
            {selectedInter ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{fmtDate(selectedDate)}</p>
                    <p className="text-xs text-slate-500">{selectedInter.heureDebut} – {selectedInter.heureFin}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-white text-xs font-semibold ${TYPE_BG[selectedInter.typePrincipal] ?? 'bg-slate-400'}`}>
                    {TYPE_LABEL[selectedInter.typePrincipal]}
                  </span>
                </div>

                {selectedInter.agentNom && (
                  <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#1A5FA8] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {selectedInter.agentNom.split(' ').map((p: string) => p[0]).join('')}
                    </div>
                    <p className="text-sm font-medium text-slate-800">{selectedInter.agentNom}</p>
                  </div>
                )}

                {absenceDates.has(selectedDate) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
                    ⚠️ Agent absent ce jour — pensez à réassigner.
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {selectedInter.taches.length} tâche{selectedInter.taches.length > 1 ? 's' : ''}
                  </p>
                  {selectedInter.taches.map(t => (
                    <div key={t.id} className="flex items-start gap-2 bg-slate-50 rounded-xl px-3 py-2">
                      <span className="text-[#0BBFBF] text-xs mt-0.5 shrink-0">✓</span>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-700 font-medium leading-tight">{t.libelle}</p>
                        {t.zone && <p className="text-[10px] text-slate-400 mt-0.5">{t.zone}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setRemoved(s => new Set([...s, selectedDate]))
                    setSelectedDate(null)
                  }}
                  className="w-full py-2.5 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
                >
                  × Supprimer cette intervention
                </button>
              </>
            ) : removed.has(selectedDate) ? (
              <>
                <p className="font-bold text-slate-800">{fmtDate(selectedDate)}</p>
                <p className="text-sm text-slate-400">Intervention supprimée.</p>
                <button
                  onClick={() => {
                    setRemoved(s => { const n = new Set(s); n.delete(selectedDate); return n })
                    setSelectedDate(null)
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
                >
                  ↩ Restaurer
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Barre actions footer */}
      <div className="shrink-0 border-t border-slate-100 px-4 py-4 bg-white space-y-2">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        {/* Avertissement planning existant */}
        {conflictCount !== null && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
            <p className="text-amber-800 text-sm font-semibold">
              ⚠️ Un planning existe déjà pour cette résidence sur cette période
            </p>
            <p className="text-amber-700 text-sm">
              {conflictCount} intervention{conflictCount > 1 ? 's' : ''} déjà planifiée{conflictCount > 1 ? 's' : ''}.
              Voulez-vous remplacer l'existant ?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConflictCount(null)}
                className="flex-1 py-2 rounded-lg border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-100"
              >
                Annuler
              </button>
              <button
                onClick={() => handleValidate(true)}
                disabled={validating}
                className="flex-1 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60"
              >
                {validating ? 'Remplacement…' : '🔄 Oui, remplacer'}
              </button>
            </div>
          </div>
        )}

        {conflictCount === null && (
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="py-3 px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
            >
              Ajuster
            </button>
            <button
              onClick={() => handleValidate(false)}
              disabled={validating || activeInters.length === 0}
              className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: activeInters.length > 0
                ? 'linear-gradient(135deg,#0A2E5A,#1A5FA8)'
                : undefined }}
            >
              {validating ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>
                  Publication…
                </>
              ) : (
                `Valider et publier (${activeInters.length} interventions)`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
