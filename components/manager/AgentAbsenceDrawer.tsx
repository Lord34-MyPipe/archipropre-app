'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile, Absence, Conge, AbsenceType } from '@/lib/types'

/* ──────────────────────────────────────────────
   Types locaux
────────────────────────────────────────────── */

type EntryType =
  | 'conge'
  | 'maladie'
  | 'absence_justifiee'
  | 'absence_injustifiee'
  | 'jour_ferie'
  | 'formation'

const TYPE_LABELS: Record<EntryType, string> = {
  conge:                'Congés payés',
  maladie:              'Arrêt maladie',
  absence_justifiee:    'Absence justifiée',
  absence_injustifiee:  'Absence injustifiée',
  jour_ferie:           'Jour férié',
  formation:            'Formation',
}

const STATUT_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  valide:     'Validé',
  refuse:     'Refusé',
}

/* ──────────────────────────────────────────────
   Helpers calendrier
────────────────────────────────────────────── */

function pad(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

function firstDow(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7
}

function dayStatus(
  dateStr: string,
  absences: Absence[],
  conges: Conge[],
): 'absent' | 'conge_valide' | 'conge_attente' | 'libre' {
  if (absences.some(a => a.valide && dateStr >= a.date_debut && dateStr <= a.date_fin))
    return 'absent'
  const c = conges.find(c => dateStr >= c.date_debut && dateStr <= c.date_fin)
  if (c) return c.statut === 'valide' ? 'conge_valide' : 'conge_attente'
  return 'libre'
}

function nbJours(debut: string, fin: string): number {
  return Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 86400000) + 1
}

/* ──────────────────────────────────────────────
   Composant principal
────────────────────────────────────────────── */

interface Props {
  agent: Profile
  onClose: () => void
}

export default function AgentAbsenceDrawer({ agent, onClose }: Props) {
  const now = new Date()
  const [calYear, setCalYear]   = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [absences, setAbsences] = useState<Absence[]>([])
  const [conges, setConges]     = useState<Conge[]>([])
  const [affectees, setAffectees] = useState<{ id: string; date_prevue: string; residences: { nom: string } | null }[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [iaAlert, setIaAlert]   = useState(false)

  // Form state
  const [fType, setFType]       = useState<EntryType>('conge')
  const [fDebut, setFDebut]     = useState('')
  const [fFin, setFFin]         = useState('')
  const [fMotif, setFMotif]     = useState('')
  const [fStatut, setFStatut]   = useState<'en_attente' | 'valide' | 'refuse'>('en_attente')
  const [fSaving, setFSaving]   = useState(false)
  const [fError, setFError]     = useState('')

  // Mode édition
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editingTable, setEditingTable] = useState<'absence' | 'conge' | null>(null)
  const isEditing = editingId !== null

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data: abs }, { data: cgs }] = await Promise.all([
      supabase.from('absences').select('*').eq('agent_id', agent.id).order('date_debut', { ascending: false }),
      supabase.from('conges').select('*').eq('agent_id', agent.id).order('date_debut', { ascending: false }),
    ])
    setAbsences((abs ?? []) as Absence[])
    setConges((cgs ?? []) as Conge[])

    const occupiedRanges = [
      ...(abs ?? []).filter((a: Absence) => a.valide).map((a: Absence) => ({ debut: a.date_debut, fin: a.date_fin })),
      ...(cgs ?? []).filter((c: Conge) => c.statut !== 'refuse').map((c: Conge) => ({ debut: c.date_debut, fin: c.date_fin })),
    ]

    if (occupiedRanges.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      const { data: inters } = await supabase
        .from('interventions')
        .select('id, date_prevue, residences(nom)')
        .eq('agent_id', agent.id)
        .gte('date_prevue', today)
        .order('date_prevue')
      const affected = (inters ?? []).filter((i: { date_prevue: string }) =>
        occupiedRanges.some(r => i.date_prevue >= r.debut && i.date_prevue <= r.fin)
      )
      setAffectees(affected as unknown as { id: string; date_prevue: string; residences: { nom: string } | null }[])
    } else {
      setAffectees([])
    }

    setLoading(false)
  }, [agent.id])

  useEffect(() => { load() }, [load])

  // ── Ouverture du modal ──

  function openCreate() {
    setEditingId(null)
    setEditingTable(null)
    setFType('conge')
    setFDebut('')
    setFFin('')
    setFMotif('')
    setFStatut('en_attente')
    setFError('')
    setShowForm(true)
  }

  function openEdit(tableType: 'absence' | 'conge', entry: Absence | Conge) {
    setEditingId(entry.id)
    setEditingTable(tableType)
    if (tableType === 'conge') {
      setFType('conge')
      setFStatut((entry as Conge).statut ?? 'en_attente')
    } else {
      setFType((entry as Absence).type as EntryType)
    }
    setFDebut(entry.date_debut)
    setFFin(entry.date_fin)
    setFMotif(entry.motif ?? '')
    setFError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setEditingTable(null)
    setFType('conge')
    setFDebut('')
    setFFin('')
    setFMotif('')
    setFStatut('en_attente')
    setFError('')
  }

  // ── Actions API ──

  async function handleCreate(valideImmediat: boolean) {
    if (!fDebut || !fFin) { setFError('Dates obligatoires'); return }
    if (fFin < fDebut) { setFError('La date de fin doit être après le début'); return }
    setFSaving(true)
    setFError('')

    const tableType = fType === 'conge' ? 'conge' : 'absence'
    const res = await fetch('/api/absences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableType,
        agentId:        agent.id,
        dateDebut:      fDebut,
        dateFin:        fFin,
        type:           tableType === 'absence' ? fType as AbsenceType : undefined,
        motif:          fMotif || null,
        valideImmediat: tableType === 'conge' ? valideImmediat : undefined,
      }),
    })
    const data = await res.json()
    setFSaving(false)
    if (!res.ok) { setFError(data.error ?? 'Erreur'); return }

    if (fType === 'maladie') setIaAlert(true)
    closeForm()
    load()
  }

  async function handleUpdate() {
    if (!fDebut || !fFin) { setFError('Dates obligatoires'); return }
    if (fFin < fDebut) { setFError('La date de fin doit être après le début'); return }
    setFSaving(true)
    setFError('')

    const res = await fetch('/api/absences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:        editingId,
        tableType: editingTable,
        dateDebut: fDebut,
        dateFin:   fFin,
        type:      editingTable === 'absence' ? fType as AbsenceType : undefined,
        motif:     fMotif || null,
        statut:    editingTable === 'conge' ? fStatut : undefined,
      }),
    })
    const data = await res.json()
    setFSaving(false)
    if (!res.ok) { setFError(data.error ?? 'Erreur'); return }

    closeForm()
    load()
  }

  async function handleDelete(tableType: 'absence' | 'conge', id: string) {
    if (!confirm('Supprimer cette entrée ?')) return
    await fetch('/api/absences', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableType, id }),
    })
    load()
  }

  async function handleValidateConge(id: string, statut: 'valide' | 'refuse') {
    await fetch('/api/absences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, statut }),
    })
    load()
  }

  // ── Calendrier ──
  const totalDays = daysInMonth(calYear, calMonth)
  const offset    = firstDow(calYear, calMonth)
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  const DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  const DAY_COLORS: Record<string, string> = {
    absent:        'bg-red-500 text-white',
    conge_valide:  'bg-orange-400 text-white',
    conge_attente: 'bg-slate-300 text-slate-600',
    libre:         'bg-green-100 text-green-700',
  }

  const TrashIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
    </svg>
  )
  const EditIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
    </svg>
  )

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose}/>

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#0A2E5A] text-white px-6 py-5 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-lg">Congés & Absences</h2>
              <p className="text-blue-300 text-sm mt-0.5">{agent.prenom} {agent.nom}</p>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* Alerte MODULE IA */}
          {iaAlert && (
            <div className="mx-4 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🤖</span>
                <div className="flex-1">
                  <p className="font-semibold text-amber-800 text-sm">Arrêt maladie déclaré</p>
                  <p className="text-amber-700 text-xs mt-1">
                    Module IA Planning activé — les interventions affectées sont listées ci-dessous.
                    Allez dans le planning pour réassigner.
                  </p>
                </div>
                <button onClick={() => setIaAlert(false)} className="text-amber-400 hover:text-amber-600 text-lg leading-none">×</button>
              </div>
            </div>
          )}

          {/* Calendrier */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
                </svg>
              </button>
              <span className="font-semibold text-slate-800">{MONTH_NAMES[calMonth]} {calYear}</span>
              <button onClick={nextMonth} className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                </svg>
              </button>
            </div>

            {/* Grille */}
            <div className="grid grid-cols-7 gap-1">
              {DAY_HEADERS.map((h, i) => (
                <div key={i} className="text-center text-[10px] font-semibold text-slate-400 py-1">{h}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={i}/>
                const dateStr = pad(calYear, calMonth, day)
                const status  = dayStatus(dateStr, absences, conges)
                const isToday = dateStr === new Date().toISOString().split('T')[0]
                return (
                  <div key={i}
                    className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-all ${
                      DAY_COLORS[status] ?? 'bg-green-100 text-green-700'
                    } ${isToday ? 'ring-2 ring-[#0A2E5A] ring-offset-1' : ''}`}>
                    {day}
                  </div>
                )
              })}
            </div>

            {/* Légende */}
            <div className="mt-3 flex flex-wrap gap-3">
              {[
                { color: 'bg-green-100',   label: 'Disponible' },
                { color: 'bg-red-500',     label: 'Absent' },
                { color: 'bg-orange-400',  label: 'Congé validé' },
                { color: 'bg-slate-300',   label: 'En attente' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded ${l.color}`}/>
                  <span className="text-[10px] text-slate-500">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-5 border-t border-slate-100"/>

          {/* Bouton déclarer */}
          <div className="px-5 py-4">
            <button onClick={openCreate}
              className="w-full py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
              Déclarer une absence / congé
            </button>
          </div>

          {/* Liste absences & congés */}
          {loading ? (
            <div className="px-5 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse"/>)}
            </div>
          ) : (
            <div className="px-5 space-y-5">

              {/* Congés */}
              {conges.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Congés payés</h3>
                  <div className="space-y-2">
                    {conges.map(c => (
                      <div key={c.id} className="bg-white border border-slate-100 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                c.statut === 'valide'     ? 'bg-orange-100 text-orange-700' :
                                c.statut === 'refuse'     ? 'bg-red-100 text-red-700'       :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                {STATUT_LABELS[c.statut ?? 'en_attente']}
                              </span>
                              <span className="text-xs text-slate-500">{nbJours(c.date_debut, c.date_fin)} j.</span>
                            </div>
                            <p className="text-sm font-medium text-slate-800 mt-1">
                              {new Date(c.date_debut + 'T00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
                              {' → '}
                              {new Date(c.date_fin + 'T00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}
                            </p>
                            {c.motif && <p className="text-xs text-slate-400 mt-0.5 italic">{c.motif}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {c.statut === 'en_attente' && (
                              <>
                                <button onClick={() => handleValidateConge(c.id, 'valide')}
                                  className="w-7 h-7 rounded-lg bg-green-100 text-green-700 flex items-center justify-center hover:bg-green-200 transition-colors text-xs font-bold" title="Valider">✓</button>
                                <button onClick={() => handleValidateConge(c.id, 'refuse')}
                                  className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors text-xs font-bold" title="Refuser">✕</button>
                              </>
                            )}
                            <button onClick={() => openEdit('conge', c)}
                              className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 transition-colors" title="Modifier">
                              <EditIcon/>
                            </button>
                            <button onClick={() => handleDelete('conge', c.id)}
                              className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors" title="Supprimer">
                              <TrashIcon/>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Absences */}
              {absences.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Absences</h3>
                  <div className="space-y-2">
                    {absences.map(a => (
                      <div key={a.id} className="bg-white border border-slate-100 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                                {TYPE_LABELS[a.type as EntryType] ?? a.type}
                              </span>
                              <span className="text-xs text-slate-500">{nbJours(a.date_debut, a.date_fin)} j.</span>
                              {!a.valide && <span className="text-xs text-slate-400">(annulée)</span>}
                            </div>
                            <p className="text-sm font-medium text-slate-800 mt-1">
                              {new Date(a.date_debut + 'T00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
                              {' → '}
                              {new Date(a.date_fin + 'T00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'})}
                            </p>
                            {a.motif && <p className="text-xs text-slate-400 mt-0.5 italic">{a.motif}</p>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => openEdit('absence', a)}
                              className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 transition-colors" title="Modifier">
                              <EditIcon/>
                            </button>
                            <button onClick={() => handleDelete('absence', a.id)}
                              className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors" title="Supprimer">
                              <TrashIcon/>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {absences.length === 0 && conges.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-4">Aucune absence ni congé enregistré.</p>
              )}

              {/* Impact planning */}
              {affectees.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Impact planning</h3>
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-semibold">
                      {affectees.length} intervention{affectees.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {affectees.map(i => (
                      <div key={i.id} className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                        <span className="text-base">⚠️</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {i.residences?.nom ?? 'Résidence inconnue'}
                          </p>
                          <p className="text-xs text-amber-700">
                            {new Date(i.date_prevue + 'T00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-semibold shrink-0">
                          À réassigner
                        </span>
                      </div>
                    ))}
                  </div>
                  <a href="/manager/planning"
                    className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-[#1A5FA8] text-[#1A5FA8] text-sm font-medium hover:bg-blue-50 transition-colors">
                    Gérer le planning →
                  </a>
                </div>
              )}

              <div className="h-4"/>
            </div>
          )}
        </div>
      </div>

      {/* Modal formulaire création / édition */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeForm}/>
          <div className="relative bg-white w-full md:max-w-sm md:rounded-3xl rounded-t-3xl p-6 shadow-2xl">
            <h3 className="font-bold text-slate-800 text-base mb-5">
              {isEditing ? 'Modifier' : 'Déclarer une absence / congé'}
            </h3>

            {fError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{fError}</div>
            )}

            {/* Type — désactivé en édition car on ne change pas la catégorie */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Type</label>
              <select value={fType} onChange={e => setFType(e.target.value as EntryType)}
                disabled={isEditing && editingTable === 'conge'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400">
                {isEditing && editingTable === 'conge'
                  ? <option value="conge">Congés payés</option>
                  : Object.entries(TYPE_LABELS)
                      .filter(([k]) => editingTable !== 'absence' || k !== 'conge')
                      .map(([k, v]) => <option key={k} value={k}>{v}</option>)
                }
              </select>
              {fType === 'maladie' && !isEditing && (
                <p className="mt-1 text-xs text-amber-600">⚠️ Déclenchera le module de réorganisation planning</p>
              )}
            </div>

            {/* Statut — uniquement en édition de congé */}
            {isEditing && editingTable === 'conge' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Statut</label>
                <select value={fStatut} onChange={e => setFStatut(e.target.value as typeof fStatut)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent">
                  <option value="en_attente">En attente</option>
                  <option value="valide">Validé</option>
                  <option value="refuse">Refusé</option>
                </select>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Début *</label>
                <input type="date" value={fDebut} onChange={e => setFDebut(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Fin *</label>
                <input type="date" value={fFin} onChange={e => setFFin(e.target.value)} min={fDebut}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent"/>
              </div>
            </div>

            {/* Motif */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Motif <span className="text-slate-400 font-normal">(optionnel)</span></label>
              <textarea value={fMotif} onChange={e => setFMotif(e.target.value)} rows={2}
                placeholder="Détails supplémentaires…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent"/>
            </div>

            {/* Boutons d'action */}
            <div className="flex flex-col gap-2">
              {isEditing ? (
                <button onClick={handleUpdate} disabled={fSaving}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
                  {fSaving ? 'Enregistrement…' : '💾 Enregistrer les modifications'}
                </button>
              ) : fType === 'conge' ? (
                <>
                  <button onClick={() => handleCreate(false)} disabled={fSaving}
                    className="w-full py-3 rounded-xl border-2 border-[#1A5FA8] text-[#1A5FA8] font-semibold text-sm hover:bg-blue-50 transition-colors disabled:opacity-60">
                    {fSaving ? 'Enregistrement…' : '📋 Soumettre pour validation'}
                  </button>
                  <button onClick={() => handleCreate(true)} disabled={fSaving}
                    className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
                    {fSaving ? 'Enregistrement…' : '✅ Valider immédiatement'}
                  </button>
                </>
              ) : (
                <button onClick={() => handleCreate(true)} disabled={fSaving}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
                  {fSaving ? 'Enregistrement…' : '✅ Valider immédiatement'}
                </button>
              )}
              <button onClick={closeForm}
                className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
