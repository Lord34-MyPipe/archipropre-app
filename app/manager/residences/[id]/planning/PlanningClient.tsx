'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { InterventionRow } from './page'
import type { Creneau } from '@/components/manager/ContratModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOURS_FR   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const JOURS_ABBR: Record<string, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer', jeudi: 'Jeu',
  vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

function formatCreneau(c: Creneau): string {
  const jours = c.jours.map(j => JOURS_ABBR[j] ?? j).join('-')
  return `${jours} ${c.heure_debut}–${c.heure_fin}`
}
const MOIS_FR  = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

function normalizeTime(t: string | null | undefined): string {
  if (!t) return '—'
  return t.substring(0, 5)
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`
}

const STATUT_BADGE: Record<string, string> = {
  planifiee: 'bg-slate-100 text-slate-600',
  en_cours:  'bg-blue-100 text-blue-700',
}
const STATUT_LABEL: Record<string, string> = {
  planifiee: 'Planifiée',
  en_cours:  'En cours',
}

const PAGE_SIZE = 50

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  residenceId: string
  residenceNom: string
  agentNom: string | null
  creneaux: Creneau[]
  interventions: InterventionRow[]
  total: number
  prochaine: string | null
  ceMois: number
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function PlanningClient({
  residenceId, residenceNom, agentNom, creneaux,
  interventions: initialInters, total, prochaine, ceMois,
}: Props) {
  const router = useRouter()
  const [inters, setInters]           = useState<InterventionRow[]>(initialInters)

  // Synchronise le state local quand le Server Component renvoie de nouvelles props (après router.refresh())
  useEffect(() => {
    setInters(initialInters)
    setPage(1)
  }, [initialInters])
  const [page, setPage]               = useState(1)
  const [regenConfirm, setRegenConfirm] = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenError, setRegenError]     = useState('')
  const [editId, setEditId]             = useState<string | null>(null)
  const [editDebut, setEditDebut]       = useState('')
  const [editFin, setEditFin]           = useState('')
  const [editSaving, setEditSaving]     = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading]     = useState(false)
  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // ── Régénérer ──────────────────────────────────────────────────────────────

  async function handleRegen() {
    setRegenLoading(true)
    setRegenError('')
    try {
      const res = await fetch('/api/planning/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceId }),
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

  // ── Modifier heure ─────────────────────────────────────────────────────────

  function startEdit(inter: InterventionRow) {
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

  // ── Supprimer ──────────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (id: string) => {
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/interventions/${id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
      setInters(prev => prev.filter(i => i.id !== id))
      setDeleteConfirmId(null)
      showToast('Intervention supprimée')
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erreur')
    }
    setDeleteLoading(false)
  }, [])

  // ── Pagination ─────────────────────────────────────────────────────────────

  const visible = inters.slice(0, page * PAGE_SIZE)
  const hasMore = visible.length < inters.length

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── En-tête ── */}
      <div className="bg-[#0A2E5A] text-white px-6 py-5 md:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Link href="/manager/residences"
              className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
              </svg>
            </Link>
            <div className="min-w-0">
              <p className="text-blue-300 text-xs uppercase tracking-wider">Planning</p>
              <h1 className="text-xl font-bold truncate">{residenceNom}</h1>
              {agentNom && (
                <p className="text-blue-200 text-sm mt-0.5 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/>
                  </svg>
                  {agentNom}
                </p>
              )}
              {creneaux.length > 0 && (
                <p className="text-blue-300/80 text-xs mt-1 flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <span>
                    Créneaux client :&nbsp;
                    {creneaux.map((c, i) => (
                      <span key={i}>
                        {i > 0 && <span className="mx-1 opacity-50">·</span>}
                        {formatCreneau(c)}
                      </span>
                    ))}
                  </span>
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => { setRegenConfirm(true); setRegenError('') }}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors border border-white/20">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
            </svg>
            Régénérer
          </button>
        </div>
      </div>

      <div className="px-6 py-6 md:px-8 space-y-6">

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total planifiées" value={String(inters.length)} icon="📋"/>
          <StatCard label="Ce mois-ci" value={String(ceMois)} icon="📅"/>
          <StatCard label="Prochaine" value={prochaine ? formatDate(prochaine) : '—'} icon="⏰" small/>
        </div>

        {/* ── Liste ── */}
        {inters.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-semibold text-slate-600">Aucune intervention planifiée</p>
            <p className="text-sm text-slate-400 mt-1">Cliquez sur "Régénérer" pour générer le planning depuis les tâches template.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-600">{inters.length} intervention{inters.length > 1 ? 's' : ''}</p>
              <p className="text-xs text-slate-400">Par ordre chronologique</p>
            </div>

            <div className="divide-y divide-slate-50">
              {visible.map(inter => (
                <InterventionRowItem
                  key={inter.id}
                  inter={inter}
                  isEditing={editId === inter.id}
                  editDebut={editDebut}
                  editFin={editFin}
                  editSaving={editSaving}
                  isConfirmingDelete={deleteConfirmId === inter.id}
                  deleteLoading={deleteLoading}
                  onStartEdit={() => startEdit(inter)}
                  onEditDebut={setEditDebut}
                  onEditFin={setEditFin}
                  onSaveEdit={saveEdit}
                  onCancelEdit={() => setEditId(null)}
                  onRequestDelete={() => setDeleteConfirmId(inter.id)}
                  onCancelDelete={() => setDeleteConfirmId(null)}
                  onConfirmDelete={() => handleDelete(inter.id)}
                />
              ))}
            </div>

            {hasMore && (
              <div className="px-5 py-4 border-t border-slate-100 text-center">
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors">
                  Charger {Math.min(PAGE_SIZE, inters.length - visible.length)} interventions de plus
                </button>
              </div>
            )}
          </div>
        )}
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
              <span className="font-semibold">{residenceNom}</span> sur toute la durée du contrat.
              Les interventions déjà réalisées (terminées / en cours) ne seront pas affectées.
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

// ── Sous-composants ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon, small }: { label: string; value: string; icon: string; small?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <p className="text-slate-400 text-xs font-medium mb-1 flex items-center gap-1.5">
        <span>{icon}</span>{label}
      </p>
      <p className={`font-bold text-slate-800 ${small ? 'text-sm leading-tight mt-1' : 'text-2xl'}`}>{value}</p>
    </div>
  )
}

interface RowProps {
  inter: InterventionRow
  isEditing: boolean
  editDebut: string
  editFin: string
  editSaving: boolean
  isConfirmingDelete: boolean
  deleteLoading: boolean
  onStartEdit: () => void
  onEditDebut: (v: string) => void
  onEditFin: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}

function InterventionRowItem({
  inter, isEditing, editDebut, editFin, editSaving,
  isConfirmingDelete, deleteLoading,
  onStartEdit, onEditDebut, onEditFin, onSaveEdit, onCancelEdit,
  onRequestDelete, onCancelDelete, onConfirmDelete,
}: RowProps) {
  return (
    <div className={`px-5 py-3.5 transition-colors ${isEditing ? 'bg-blue-50' : isConfirmingDelete ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
      {isEditing ? (
        /* ── Mode édition ── */
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-slate-700 shrink-0 w-36">{formatDate(inter.date_prevue)}</span>
          <div className="flex items-center gap-2">
            <input type="time" value={editDebut} onChange={e => onEditDebut(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 w-28"/>
            <span className="text-slate-400 text-sm">→</span>
            <input type="time" value={editFin} onChange={e => onEditFin(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 w-28"/>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onCancelEdit} disabled={editSaving}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50">
              Annuler
            </button>
            <button onClick={onSaveEdit} disabled={editSaving}
              className="px-3 py-1.5 rounded-lg bg-[#0BBFBF] text-white text-xs font-semibold hover:bg-[#0A9A9A] disabled:opacity-60 flex items-center gap-1">
              {editSaving ? <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin"/> : null}
              Sauvegarder
            </button>
          </div>
        </div>
      ) : isConfirmingDelete ? (
        /* ── Confirmation suppression ── */
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-red-700 font-medium flex-1">
            Supprimer l&apos;intervention du {formatDate(inter.date_prevue)} ?
          </span>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button onClick={onCancelDelete}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-white">
              Annuler
            </button>
            <button onClick={onConfirmDelete} disabled={deleteLoading}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-60 flex items-center gap-1">
              {deleteLoading ? <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin"/> : null}
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        /* ── Ligne normale ── */
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1 flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-slate-800 shrink-0 w-40">{formatDate(inter.date_prevue)}</span>
            <span className="text-sm text-slate-600 font-mono shrink-0">
              {normalizeTime(inter.heure_debut_prevue)}
              <span className="text-slate-400 mx-1">→</span>
              {normalizeTime(inter.heure_fin_prevue)}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${STATUT_BADGE[inter.statut] ?? 'bg-slate-100 text-slate-500'}`}>
              {STATUT_LABEL[inter.statut] ?? inter.statut}
            </span>
            {inter.agent_nom && (
              <span className="text-xs text-slate-400 truncate">{inter.agent_nom}</span>
            )}
          </div>
          {inter.statut === 'planifiee' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={onStartEdit}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#1A5FA8] hover:bg-blue-50 transition-colors">
                Modifier
              </button>
              <button onClick={onRequestDelete}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 transition-colors">
                Supprimer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
