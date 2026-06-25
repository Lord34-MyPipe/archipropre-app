'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { InterventionRow } from './page'
import type { Creneau } from '@/components/manager/ContratModal'

// ── Helpers date ──────────────────────────────────────────────────────────────

const JOURS_COURTS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const JOURS_LONGS  = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const MOIS_COURTS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay() // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function getWeekDays(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i))
}

function getMonthDates(yearMonth: string): { date: string; inMonth: boolean }[] {
  const [y, m] = yearMonth.split('-').map(Number)
  const firstDay = new Date(y, m - 1, 1)
  const lastDay  = new Date(y, m, 0)
  // Monday-start grid
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1
  const endDow   = lastDay.getDay() === 0 ? 6 : lastDay.getDay() - 1
  const cells: { date: string; inMonth: boolean }[] = []
  for (let i = 0; i < startDow; i++) {
    const d = new Date(y, m - 1, 1 - startDow + i)
    cells.push({ date: d.toISOString().split('T')[0], inMonth: false })
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(y, m - 1, i)
    cells.push({ date: d.toISOString().split('T')[0], inMonth: true })
  }
  for (let i = endDow + 1; i < 7; i++) {
    const d = new Date(y, m, i - endDow)
    cells.push({ date: d.toISOString().split('T')[0], inMonth: false })
  }
  return cells
}

function normalizeTime(t: string | null | undefined): string {
  if (!t) return '—'
  return t.substring(0, 5)
}

function formatDayHeader(dateStr: string, today: string): { dow: string; num: string; isToday: boolean } {
  const d = new Date(dateStr + 'T00:00:00')
  return {
    dow: JOURS_COURTS[d.getDay()],
    num: String(d.getDate()),
    isToday: dateStr === today,
  }
}

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
}

function formatDateFull(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${JOURS_LONGS[d.getDay()]} ${d.getDate()} ${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()}`
}

function agentPrenom(agentNom: string | null): string {
  if (!agentNom) return '—'
  return agentNom.split(' ')[0]
}

// ── Couleurs statut ───────────────────────────────────────────────────────────

const STATUT_BLOC: Record<string, string> = {
  planifiee:    'bg-slate-100 border-slate-300 text-slate-700',
  en_cours:     'bg-blue-100 border-blue-300 text-blue-800',
  terminee:     'bg-green-100 border-green-300 text-green-700',
  validee:      'bg-emerald-100 border-emerald-300 text-emerald-800',
  annulee:      'bg-red-50 border-red-200 text-red-600',
  non_demarree: 'bg-amber-100 border-amber-300 text-amber-800',
}

const STATUT_LABEL: Record<string, string> = {
  planifiee:    'Planifiée',
  en_cours:     'En cours',
  terminee:     'Terminée',
  validee:      'Validée',
  annulee:      'Annulée',
  non_demarree: 'Non démarrée',
}

const STATUT_DOT: Record<string, string> = {
  planifiee:    'bg-slate-400',
  en_cours:     'bg-blue-500',
  terminee:     'bg-green-500',
  validee:      'bg-emerald-500',
  annulee:      'bg-red-400',
  non_demarree: 'bg-amber-400',
}

const JOURS_ABBR: Record<string, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
  vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

function formatCreneau(c: Creneau): string {
  const jours = c.jours.map(j => JOURS_ABBR[j] ?? j).join('-')
  return `${jours} ${c.heure_debut}–${c.heure_fin}`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  residenceId: string
  residenceNom: string
  residenceActif?: boolean
  agentNom: string | null
  creneaux: Creneau[]
  interventions: InterventionRow[]
  total: number
  prochaine: string | null
  ceMois: number
  contratId?: string
  contratLibelle?: string
}

type ViewType = 'jour' | 'semaine' | 'mois'

// ── Composant principal ───────────────────────────────────────────────────────

export default function PlanningClient({
  residenceId, residenceNom, residenceActif = true, agentNom, creneaux,
  interventions: initialInters, total, prochaine, ceMois, contratId, contratLibelle,
}: Props) {
  const router = useRouter()
  const today = useMemo(() => new Date().toISOString().split('T')[0], [])

  const [inters, setInters]           = useState<InterventionRow[]>(initialInters)
  const [view, setView]               = useState<ViewType>('semaine')
  const [anchor, setAnchor]           = useState(() => getMondayOf(today))
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [editId, setEditId]           = useState<string | null>(null)
  const [editDebut, setEditDebut]     = useState('')
  const [editFin, setEditFin]         = useState('')
  const [editSaving, setEditSaving]   = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading]     = useState(false)
  const [regenConfirm, setRegenConfirm] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenError, setRegenError]     = useState('')
  const [toast, setToast]               = useState('')

  useEffect(() => {
    setInters(initialInters)
  }, [initialInters])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function navPrev() {
    if (view === 'jour')    setAnchor(a => addDays(a, -1))
    else if (view === 'semaine') setAnchor(a => addDays(a, -7))
    else {
      const [y, m] = anchor.split('-').map(Number)
      const d = new Date(y, m - 2, 1)
      setAnchor(d.toISOString().split('T')[0])
    }
  }

  function navNext() {
    if (view === 'jour')    setAnchor(a => addDays(a, 1))
    else if (view === 'semaine') setAnchor(a => addDays(a, 7))
    else {
      const [y, m] = anchor.split('-').map(Number)
      const d = new Date(y, m, 1)
      setAnchor(d.toISOString().split('T')[0])
    }
  }

  function goToday() {
    if (view === 'jour')    setAnchor(today)
    else if (view === 'semaine') setAnchor(getMondayOf(today))
    else setAnchor(today.slice(0, 7) + '-01')
  }

  function switchView(v: ViewType) {
    setView(v)
    if (v === 'semaine') setAnchor(getMondayOf(anchor))
    else if (v === 'mois') setAnchor(anchor.slice(0, 7) + '-01')
  }

  // ── Modifier / Supprimer ──────────────────────────────────────────────────

  function startEdit(inter: InterventionRow) {
    setSelectedId(null)
    setEditId(inter.id)
    setEditDebut(normalizeTime(inter.heure_debut_prevue))
    setEditFin(normalizeTime(inter.heure_fin_prevue))
  }

  async function saveEdit() {
    if (!editId) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/interventions/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heureDebut: editDebut !== '—' ? editDebut : null,
          heureFin:   editFin   !== '—' ? editFin   : null,
        }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setInters(prev => prev.map(i =>
        i.id === editId
          ? { ...i, heure_debut_prevue: editDebut, heure_fin_prevue: editFin }
          : i
      ))
      setEditId(null)
      showToast('Horaire mis à jour')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erreur')
    }
    setEditSaving(false)
  }

  const handleDelete = useCallback(async (id: string) => {
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/interventions/${id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setInters(prev => prev.filter(i => i.id !== id))
      setDeleteConfirmId(null)
      setSelectedId(null)
      showToast('Intervention supprimée')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erreur')
    }
    setDeleteLoading(false)
  }, [])

  // ── Régénérer ─────────────────────────────────────────────────────────────

  async function handleRegen() {
    setRegenLoading(true)
    setRegenError('')
    try {
      const res = await fetch('/api/planning/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceId, contratId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erreur inconnue')
      setRegenConfirm(false)
      showToast(`✓ ${json.count} interventions régénérées`)
      router.refresh()
    } catch (e: unknown) {
      setRegenError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
    setRegenLoading(false)
  }

  // ── Données agenda ────────────────────────────────────────────────────────

  const weekDays  = useMemo(() => getWeekDays(view === 'semaine' ? anchor : getMondayOf(anchor)), [view, anchor])
  const monthStr  = anchor.slice(0, 7)

  const visibleInters = useMemo(() => {
    if (view === 'jour') return inters.filter(i => i.date_prevue === anchor)
    if (view === 'semaine') return inters.filter(i => weekDays.includes(i.date_prevue))
    const [y, m] = monthStr.split('-').map(Number)
    const first = new Date(y, m - 1, 1).toISOString().split('T')[0]
    const last  = new Date(y, m, 0).toISOString().split('T')[0]
    return inters.filter(i => i.date_prevue >= first && i.date_prevue <= last)
  }, [inters, view, anchor, weekDays, monthStr])

  // Créneaux horaires uniques présents dans la vue courante
  const timeSlots = useMemo(() => {
    const times = visibleInters.map(i => normalizeTime(i.heure_debut_prevue)).filter(t => t !== '—')
    return [...new Set(times)].sort()
  }, [visibleInters])

  // ── Rendu en-tête ─────────────────────────────────────────────────────────

  const navLabel = view === 'jour'
    ? formatDateFull(anchor)
    : view === 'semaine'
      ? `${addDays(anchor, 0).slice(8, 10)}–${addDays(anchor, 6).slice(8, 10)} ${MOIS_FR[new Date(anchor + 'T00:00:00').getMonth()]} ${new Date(anchor + 'T00:00:00').getFullYear()}`
      : formatMonthYear(anchor)

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── En-tête ── */}
      <div className="bg-[#0A2E5A] text-white px-4 py-4 md:px-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Link href={contratId ? `/manager/residences/${residenceId}` : '/manager/residences'}
              className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
              </svg>
            </Link>
            <div className="min-w-0">
              <p className="text-blue-300 text-xs uppercase tracking-wider">
                {contratLibelle ? `Planning — ${contratLibelle}` : 'Planning résidence'}
              </p>
              <h1 className="text-xl font-bold truncate">{residenceNom}</h1>
              {agentNom && contratId && (
                <p className="text-blue-200 text-sm mt-0.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/>
                  </svg>
                  {agentNom}
                </p>
              )}
              {creneaux.length > 0 && contratId && (
                <p className="text-blue-300/80 text-xs mt-1">
                  Créneaux :&nbsp;{creneaux.map((c, i) => (
                    <span key={i}>{i > 0 && <span className="mx-1 opacity-50">·</span>}{formatCreneau(c)}</span>
                  ))}
                </p>
              )}
            </div>
          </div>
          {/* Regen uniquement en vue par contrat */}
          {contratId && (
            <button
              onClick={() => { setRegenConfirm(true); setRegenError('') }}
              disabled={!residenceActif}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors border border-white/20 disabled:opacity-40 disabled:cursor-not-allowed">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
              </svg>
              Régénérer
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 md:px-8 space-y-4">

        {/* ── Sommeil ── */}
        {!residenceActif && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ background: '#FEF9F0', borderColor: '#F5A623' }}>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="#F5A623" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
            </svg>
            <p className="text-sm font-medium" style={{ color: '#92600A' }}>
              Résidence en sommeil — le planning est en lecture seule.
            </p>
          </div>
        )}

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-100 p-3 text-center">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide font-medium">Planifiées</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{inters.filter(i => i.statut === 'planifiee').length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3 text-center">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide font-medium">Ce mois</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">{ceMois}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-100 p-3 text-center">
            <p className="text-slate-400 text-[10px] uppercase tracking-wide font-medium">Prochaine</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5 leading-tight">
              {prochaine
                ? `${new Date(prochaine + 'T00:00:00').getDate()} ${MOIS_COURTS[new Date(prochaine + 'T00:00:00').getMonth()]}`
                : '—'}
            </p>
          </div>
        </div>

        {/* ── Toolbar agenda ── */}
        <div className="bg-white rounded-xl border border-slate-100 p-3 flex flex-wrap items-center gap-3">
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button onClick={navPrev}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
              </svg>
            </button>
            <button onClick={goToday}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              Aujourd'hui
            </button>
            <button onClick={navNext}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
              </svg>
            </button>
          </div>
          {/* Période courante */}
          <span className="text-sm font-semibold text-slate-700 flex-1 min-w-0 truncate">{navLabel}</span>
          {/* Vue */}
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {(['jour', 'semaine', 'mois'] as ViewType[]).map(v => (
              <button key={v}
                onClick={() => switchView(v)}
                className={`px-3 py-1.5 capitalize transition-colors ${view === v ? 'bg-[#0A2E5A] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {v === 'jour' ? 'Jour' : v === 'semaine' ? 'Semaine' : 'Mois'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Agenda ── */}
        {view === 'mois'
          ? <MonthView
              monthStr={monthStr}
              inters={inters}
              today={today}
              onDayClick={d => { setAnchor(d); switchView('jour') }}
            />
          : view === 'jour'
            ? <DayView
                date={anchor}
                today={today}
                timeSlots={timeSlots}
                inters={visibleInters}
                selectedId={selectedId}
                editId={editId}
                editDebut={editDebut}
                editFin={editFin}
                editSaving={editSaving}
                deleteConfirmId={deleteConfirmId}
                deleteLoading={deleteLoading}
                onSelectBloc={id => setSelectedId(s => s === id ? null : id)}
                onStartEdit={startEdit}
                onEditDebut={setEditDebut}
                onEditFin={setEditFin}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditId(null)}
                onRequestDelete={id => setDeleteConfirmId(id)}
                onCancelDelete={() => setDeleteConfirmId(null)}
                onConfirmDelete={handleDelete}
              />
            : <WeekView
                weekDays={weekDays}
                today={today}
                timeSlots={timeSlots}
                inters={visibleInters}
                selectedId={selectedId}
                editId={editId}
                editDebut={editDebut}
                editFin={editFin}
                editSaving={editSaving}
                deleteConfirmId={deleteConfirmId}
                deleteLoading={deleteLoading}
                onSelectBloc={id => setSelectedId(s => s === id ? null : id)}
                onStartEdit={startEdit}
                onEditDebut={setEditDebut}
                onEditFin={setEditFin}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditId(null)}
                onRequestDelete={id => setDeleteConfirmId(id)}
                onCancelDelete={() => setDeleteConfirmId(null)}
                onConfirmDelete={handleDelete}
              />
        }

        {/* ── Légende ── */}
        <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Légende</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(STATUT_LABEL).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUT_DOT[key] ?? 'bg-slate-400'}`}/>
                <span className="text-xs text-slate-600">{label}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── Modal Régénérer ── */}
      {regenConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-slate-800">Régénérer le planning ?</h2>
            </div>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              Cela va supprimer et recréer toutes les interventions planifiées pour{' '}
              <span className="font-semibold">{contratLibelle ?? residenceNom}</span> sur toute la durée du contrat.
            </p>
            {regenError && (
              <p className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{regenError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setRegenConfirm(false)} disabled={regenLoading}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                Annuler
              </button>
              <button onClick={handleRegen} disabled={regenLoading}
                className="flex-1 py-2.5 rounded-xl bg-[#1A5FA8] text-white text-sm font-semibold hover:bg-[#0A2E5A] disabled:opacity-60 flex items-center justify-center gap-2">
                {regenLoading
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Génération…</>
                  : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0A2E5A] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}

// ── Interfaces des sous-composants ────────────────────────────────────────────

interface AgendaProps {
  timeSlots: string[]
  inters: InterventionRow[]
  today: string
  selectedId: string | null
  editId: string | null
  editDebut: string
  editFin: string
  editSaving: boolean
  deleteConfirmId: string | null
  deleteLoading: boolean
  onSelectBloc: (id: string) => void
  onStartEdit: (inter: InterventionRow) => void
  onEditDebut: (v: string) => void
  onEditFin: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onRequestDelete: (id: string) => void
  onCancelDelete: () => void
  onConfirmDelete: (id: string) => void
}

// ── Vue Semaine ───────────────────────────────────────────────────────────────

function WeekView({ weekDays, today, timeSlots, inters, selectedId, editId, editDebut, editFin, editSaving, deleteConfirmId, deleteLoading, onSelectBloc, onStartEdit, onEditDebut, onEditFin, onSaveEdit, onCancelEdit, onRequestDelete, onCancelDelete, onConfirmDelete }: AgendaProps & { weekDays: string[] }) {

  if (timeSlots.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 p-10 text-center">
        <p className="text-3xl mb-2">📭</p>
        <p className="font-semibold text-slate-600">Aucune intervention cette semaine</p>
        <p className="text-sm text-slate-400 mt-1">Naviguez vers une autre semaine ou régénérez le planning.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-x-auto">
      <table className="w-full text-xs" style={{ minWidth: 520 }}>
        <thead>
          <tr className="border-b border-slate-100">
            <th className="w-12 py-2 px-2 text-slate-400 font-normal text-left">Heure</th>
            {weekDays.map(day => {
              const h = formatDayHeader(day, today)
              return (
                <th key={day} className={`py-2 px-1 font-semibold text-center ${h.isToday ? 'text-[#1A5FA8]' : 'text-slate-600'}`}>
                  <div>{h.dow}</div>
                  <div className={`text-base leading-tight ${h.isToday ? 'w-6 h-6 rounded-full bg-[#1A5FA8] text-white flex items-center justify-center mx-auto text-xs' : ''}`}>
                    {h.num}
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map(slot => (
            <tr key={slot} className="border-b border-slate-50 last:border-0">
              <td className="py-1.5 px-2 text-slate-400 font-mono align-top pt-2 whitespace-nowrap">{slot}</td>
              {weekDays.map(day => {
                const dayInters = inters.filter(i =>
                  i.date_prevue === day && normalizeTime(i.heure_debut_prevue) === slot
                )
                return (
                  <td key={day} className="py-1 px-0.5 align-top min-w-[80px]">
                    {dayInters.map(inter => (
                      <InterventionBloc
                        key={inter.id}
                        inter={inter}
                        isSelected={selectedId === inter.id}
                        isEditing={editId === inter.id}
                        editDebut={editDebut}
                        editFin={editFin}
                        editSaving={editSaving}
                        isConfirmingDelete={deleteConfirmId === inter.id}
                        deleteLoading={deleteLoading}
                        onSelect={() => onSelectBloc(inter.id)}
                        onStartEdit={() => onStartEdit(inter)}
                        onEditDebut={onEditDebut}
                        onEditFin={onEditFin}
                        onSaveEdit={onSaveEdit}
                        onCancelEdit={onCancelEdit}
                        onRequestDelete={() => onRequestDelete(inter.id)}
                        onCancelDelete={onCancelDelete}
                        onConfirmDelete={() => onConfirmDelete(inter.id)}
                      />
                    ))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Vue Jour ──────────────────────────────────────────────────────────────────

function DayView({ date, today, timeSlots, inters, selectedId, editId, editDebut, editFin, editSaving, deleteConfirmId, deleteLoading, onSelectBloc, onStartEdit, onEditDebut, onEditFin, onSaveEdit, onCancelEdit, onRequestDelete, onCancelDelete, onConfirmDelete }: AgendaProps & { date: string }) {
  const h = formatDayHeader(date, today)

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      {/* Entête jour */}
      <div className={`px-4 py-3 border-b border-slate-100 text-center font-semibold ${h.isToday ? 'text-[#1A5FA8]' : 'text-slate-700'}`}>
        {h.dow} {h.num} {MOIS_FR[new Date(date + 'T00:00:00').getMonth()]}
        {h.isToday && <span className="ml-2 px-2 py-0.5 bg-[#1A5FA8] text-white text-[10px] rounded-full font-medium">Aujourd'hui</span>}
      </div>
      {timeSlots.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-slate-400 text-sm">Aucune intervention ce jour</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {timeSlots.map(slot => {
            const dayInters = inters.filter(i => normalizeTime(i.heure_debut_prevue) === slot)
            return (
              <div key={slot} className="flex gap-3 px-4 py-2 items-start">
                <span className="text-xs font-mono text-slate-400 pt-1 w-10 shrink-0">{slot}</span>
                <div className="flex-1 flex flex-col gap-1.5">
                  {dayInters.map(inter => (
                    <InterventionBloc
                      key={inter.id}
                      inter={inter}
                      isSelected={selectedId === inter.id}
                      isEditing={editId === inter.id}
                      editDebut={editDebut}
                      editFin={editFin}
                      editSaving={editSaving}
                      isConfirmingDelete={deleteConfirmId === inter.id}
                      deleteLoading={deleteLoading}
                      onSelect={() => onSelectBloc(inter.id)}
                      onStartEdit={() => onStartEdit(inter)}
                      onEditDebut={onEditDebut}
                      onEditFin={onEditFin}
                      onSaveEdit={onSaveEdit}
                      onCancelEdit={onCancelEdit}
                      onRequestDelete={() => onRequestDelete(inter.id)}
                      onCancelDelete={onCancelDelete}
                      onConfirmDelete={() => onConfirmDelete(inter.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Vue Mois ──────────────────────────────────────────────────────────────────

function MonthView({ monthStr, inters, today, onDayClick }: { monthStr: string; inters: InterventionRow[]; today: string; onDayClick: (d: string) => void }) {
  const cells = useMemo(() => getMonthDates(monthStr + '-01'), [monthStr])

  const countByDay = useMemo(() => {
    const map: Record<string, { planifiee: number; en_cours: number; autre: number }> = {}
    for (const i of inters) {
      if (!map[i.date_prevue]) map[i.date_prevue] = { planifiee: 0, en_cours: 0, autre: 0 }
      if (i.statut === 'planifiee') map[i.date_prevue].planifiee++
      else if (i.statut === 'en_cours') map[i.date_prevue].en_cours++
      else map[i.date_prevue].autre++
    }
    return map
  }, [inters])

  const HEADERS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-100">
        {HEADERS.map(h => (
          <div key={h} className="py-2 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map(({ date, inMonth }) => {
          const counts = countByDay[date]
          const isToday = date === today
          return (
            <button
              key={date}
              onClick={() => onDayClick(date)}
              className={`min-h-[52px] p-1 text-left border-r border-b border-slate-50 last:border-r-0 hover:bg-slate-50 transition-colors ${!inMonth ? 'opacity-30' : ''}`}
            >
              <span className={`text-xs font-semibold inline-flex items-center justify-center w-5 h-5 rounded-full ${isToday ? 'bg-[#1A5FA8] text-white' : 'text-slate-700'}`}>
                {new Date(date + 'T00:00:00').getDate()}
              </span>
              {counts && (
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {counts.planifiee > 0 && (
                    <span className="px-1 rounded text-[9px] bg-slate-100 text-slate-600 font-medium">{counts.planifiee}</span>
                  )}
                  {counts.en_cours > 0 && (
                    <span className="px-1 rounded text-[9px] bg-blue-100 text-blue-700 font-medium">{counts.en_cours}</span>
                  )}
                  {counts.autre > 0 && (
                    <span className="px-1 rounded text-[9px] bg-green-100 text-green-700 font-medium">{counts.autre}</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Bloc intervention ─────────────────────────────────────────────────────────

interface BlocProps {
  inter: InterventionRow
  isSelected: boolean
  isEditing: boolean
  editDebut: string
  editFin: string
  editSaving: boolean
  isConfirmingDelete: boolean
  deleteLoading: boolean
  onSelect: () => void
  onStartEdit: () => void
  onEditDebut: (v: string) => void
  onEditFin: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

function InterventionBloc({
  inter, isSelected, isEditing, editDebut, editFin, editSaving,
  isConfirmingDelete, deleteLoading,
  onSelect, onStartEdit, onEditDebut, onEditFin, onSaveEdit, onCancelEdit,
  onRequestDelete, onCancelDelete, onConfirmDelete,
}: BlocProps) {
  const colorCls = STATUT_BLOC[inter.statut] ?? 'bg-slate-100 border-slate-300 text-slate-700'

  if (isEditing) {
    return (
      <div className="rounded-lg border border-[#0BBFBF] bg-blue-50 p-2 mb-1 text-xs">
        <p className="font-semibold text-slate-700 mb-1.5">{normalizeTime(inter.heure_debut_prevue)} · Modifier horaire</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <input type="time" value={editDebut} onChange={e => onEditDebut(e.target.value)}
            className="px-1.5 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#0BBFBF] w-24"/>
          <span className="text-slate-400">→</span>
          <input type="time" value={editFin} onChange={e => onEditFin(e.target.value)}
            className="px-1.5 py-1 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#0BBFBF] w-24"/>
        </div>
        <div className="flex gap-1.5 mt-2">
          <button onClick={onCancelEdit} disabled={editSaving}
            className="flex-1 py-1 rounded border border-slate-200 text-slate-600 text-[10px] font-medium hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={onSaveEdit} disabled={editSaving}
            className="flex-1 py-1 rounded bg-[#0BBFBF] text-white text-[10px] font-semibold hover:bg-[#0A9A9A] disabled:opacity-60 flex items-center justify-center gap-1">
            {editSaving && <span className="w-2.5 h-2.5 border border-white/40 border-t-white rounded-full animate-spin"/>}
            Sauvegarder
          </button>
        </div>
      </div>
    )
  }

  if (isConfirmingDelete) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-2 mb-1 text-xs">
        <p className="font-semibold text-red-700 mb-2">Supprimer cette intervention ?</p>
        <div className="flex gap-1.5">
          <button onClick={onCancelDelete}
            className="flex-1 py-1 rounded border border-slate-200 text-slate-600 text-[10px] font-medium hover:bg-white">
            Annuler
          </button>
          <button onClick={onConfirmDelete} disabled={deleteLoading}
            className="flex-1 py-1 rounded bg-red-600 text-white text-[10px] font-semibold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-1">
            {deleteLoading && <span className="w-2.5 h-2.5 border border-white/40 border-t-white rounded-full animate-spin"/>}
            Supprimer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-1">
      <button
        onClick={onSelect}
        className={`w-full text-left rounded-lg border px-2 py-1.5 text-[10px] leading-snug transition-all ${colorCls} ${isSelected ? 'ring-1 ring-offset-1 ring-[#0BBFBF]' : 'hover:opacity-80'}`}
      >
        <div className="font-semibold">
          {normalizeTime(inter.heure_debut_prevue)}–{normalizeTime(inter.heure_fin_prevue)}
        </div>
        {inter.contrat_libelle && (
          <div className="opacity-80 truncate">{inter.contrat_libelle}</div>
        )}
        <div className="opacity-70 truncate">{agentPrenom(inter.agent_nom)}</div>
      </button>
      {/* Actions inline quand sélectionné */}
      {isSelected && inter.statut === 'planifiee' && (
        <div className="flex gap-1 mt-0.5">
          <button onClick={onStartEdit}
            className="flex-1 py-1 rounded text-[10px] font-medium text-[#1A5FA8] bg-blue-50 hover:bg-blue-100 transition-colors">
            Modifier
          </button>
          <button onClick={onRequestDelete}
            className="flex-1 py-1 rounded text-[10px] font-medium text-red-500 bg-red-50 hover:bg-red-100 transition-colors">
            Supprimer
          </button>
        </div>
      )}
    </div>
  )
}
