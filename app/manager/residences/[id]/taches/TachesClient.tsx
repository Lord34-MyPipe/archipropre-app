'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import type { Residence, ZoneResidence, TacheTemplate, ContratResidence } from '@/lib/types'
import TacheModal from './TacheModal'
import type { ParametresSociete, StatsReel } from './page'

/* ── Constantes ──────────────────────────────── */

const JOURS_ALL = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOUR_COURTS: Record<string,string> = {
  lundi:'L', mardi:'M', mercredi:'Me', jeudi:'J', vendredi:'V', samedi:'S', dimanche:'D',
}
const JOUR_NOMS: Record<string,string> = {
  lundi:'Lundi', mardi:'Mardi', mercredi:'Mercredi', jeudi:'Jeudi',
  vendredi:'Vendredi', samedi:'Samedi', dimanche:'Dimanche',
}
const MOIS_COURTS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']
const SEMAINE_LABELS = ['','1ère','2ème','3ème','4ème','Dern.']

const FREQ_BADGE: Record<string, { bg: string; label: string }> = {
  hebdo:             { bg: 'bg-green-100 text-green-700',   label: 'Hebdo' },
  mensuel:           { bg: 'bg-blue-100 text-blue-700',     label: 'Mensuel' },
  trimestriel:       { bg: 'bg-orange-100 text-orange-700', label: 'Trim.' },
  semestriel:        { bg: 'bg-purple-100 text-purple-700', label: 'Semestr.' },
  annuel:            { bg: 'bg-red-100 text-red-700',       label: 'Annuel' },
  sur_passage:       { bg: 'bg-slate-100 text-slate-600',   label: 'Passage' },
  contrainte_horaire:{ bg: 'bg-amber-100 text-amber-700',   label: 'Horaire' },
}

const FREQ_COL_LABELS: Record<string,string> = {
  mensuel: 'Mensuel', trimestriel: 'Trim.', semestriel: 'Semest.', annuel: 'Annuel', sur_passage: 'Passage',
}

function freqSummary(t: TacheTemplate): string {
  const joursStr = (t.jours_semaine ?? []).map(j => JOUR_COURTS[j] ?? j).join('+')
  const semaine  = SEMAINE_LABELS[t.semaine_du_mois?.[0] ?? 0] ?? ''
  const mois     = (t.mois_de_annee ?? []).map(m => MOIS_COURTS[m-1]).join(' ')

  switch (t.frequence_type) {
    case 'hebdo':             return joursStr
    case 'mensuel':           return `${semaine} ${joursStr} /mois`
    case 'trimestriel':       return `${semaine} ${joursStr} · ${mois}`
    case 'semestriel':        return `${semaine} ${joursStr} · ${mois}`
    case 'annuel':            return `${semaine} ${joursStr} · ${mois}`
    case 'sur_passage':       return 'Sur passage'
    case 'contrainte_horaire':
      return t.heure_debut && t.heure_fin ? `${joursStr} ${t.heure_debut}→${t.heure_fin}` : joursStr
    default: return ''
  }
}

/* ── Toast ───────────────────────────────────── */

function Toast({ message, type, onDone }: { message: string; type: 'success'|'error'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-medium flex items-center gap-2 ${
      type === 'success' ? 'bg-[#0A2E5A]' : 'bg-red-500'
    }`}>
      {type === 'success' ? '✓' : '✕'} {message}
    </div>
  )
}

/* ── Inline rename zone ───────────────────────── */

function ZoneRenameInput({ initial, onSave, onCancel }: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(initial)
  return (
    <div className="flex gap-2 flex-1">
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel() }}
        className="flex-1 px-3 py-1.5 rounded-lg border border-[#0BBFBF] text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"/>
      <button onClick={() => onSave(val)} className="px-3 py-1.5 bg-[#0A2E5A] text-white rounded-lg text-xs font-semibold">✓</button>
      <button onClick={onCancel} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs">✕</button>
    </div>
  )
}

/* ── Durée helpers ────────────────────────────── */

const DUREE_PRESETS = [
  { label: '2min',  value: 2 },
  { label: '5min',  value: 5 },
  { label: '10min', value: 10 },
  { label: '15min', value: 15 },
  { label: '30min', value: 30 },
  { label: '1h',    value: 60 },
]

function formatDuree(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

/* ── Props ───────────────────────────────────── */

interface Props {
  residence: Residence
  zones: ZoneResidence[]
  taches: TacheTemplate[]
  contrat?: ContratResidence | null
  parametres?: ParametresSociete | null
  statsReel?: StatsReel | null
}

/* ── Composant principal ─────────────────────── */

export default function TachesClient({ residence, zones: initialZones, taches: initialTaches, contrat, parametres, statsReel }: Props) {
  const [zones, setZones]         = useState<ZoneResidence[]>(initialZones)
  const [taches, setTaches]       = useState<TacheTemplate[]>(initialTaches)
  const [view, setView]           = useState<'zone' | 'day'>('zone')
  const [expanded, setExpanded]   = useState<Set<string>>(new Set(initialZones.map(z => z.id)))
  const [modal, setModal]         = useState<{ open: boolean; zoneId?: string }>({ open: false })
  const [editingTache, setEditing]= useState<TacheTemplate | null>(null)
  const [renamingZone, setRenaming] = useState<string | null>(null)
  const [toast, setToast]         = useState<{ message: string; type: 'success'|'error' } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'zone'|'tache'; id: string; label: string } | null>(null)

  const showToast = useCallback((message: string, type: 'success'|'error' = 'success') => {
    setToast({ message, type })
  }, [])

  function openModal(zoneId?: string) {
    setEditing(null)
    setModal({ open: true, zoneId })
  }
  function openEdit(t: TacheTemplate) {
    setEditing(t)
    setModal({ open: true })
  }
  function closeModal() { setModal({ open: false }); setEditing(null) }

  /* ── Zone CRUD ── */

  async function handleAddZone() {
    const nom = prompt('Nom de la nouvelle zone :')?.trim()
    if (!nom) return
    const res = await fetch('/api/zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residenceId: residence.id, nom, ordre: zones.length + 1 }),
    })
    const json = await res.json()
    if (!res.ok) { showToast(json.error ?? 'Erreur', 'error'); return }
    setZones(z => [...z, json.data as ZoneResidence])
    setExpanded(s => new Set([...s, json.data.id]))
    showToast('Zone ajoutée')
  }

  async function handleRenameZone(id: string, nom: string) {
    if (!nom.trim()) { setRenaming(null); return }
    const res = await fetch('/api/zones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nom }),
    })
    if (!res.ok) { showToast('Erreur renommage', 'error'); return }
    setZones(zs => zs.map(z => z.id === id ? { ...z, nom } : z))
    setRenaming(null)
    showToast('Zone renommée')
  }

  async function handleDuplicateZone(zone: ZoneResidence) {
    const res = await fetch('/api/zones/dupliquer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId: zone.id }),
    })
    const json = await res.json()
    if (!res.ok) { showToast(json.error ?? 'Erreur duplication', 'error'); return }
    const newZone = json.zone as ZoneResidence
    const newTaches = json.taches as TacheTemplate[]
    setZones(zs => [...zs, newZone])
    setTaches(ts => [...ts, ...newTaches])
    setExpanded(s => new Set([...s, newZone.id]))
    setRenaming(newZone.id)
    showToast(`Zone dupliquée (${newTaches.length} tâche${newTaches.length > 1 ? 's' : ''} copiée${newTaches.length > 1 ? 's' : ''})`)
  }

  async function handleDeleteZone(id: string) {
    const res = await fetch('/api/zones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) { showToast('Erreur suppression', 'error'); return }
    setZones(zs => zs.filter(z => z.id !== id))
    setTaches(ts => ts.filter(t => t.zone_id !== id))
    showToast('Zone supprimée')
  }

  /* ── Tâche CRUD ── */

  async function handleDeleteTache(id: string) {
    const res = await fetch('/api/taches-template', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) { showToast('Erreur suppression', 'error'); return }
    setTaches(ts => ts.filter(t => t.id !== id))
    showToast('Tâche supprimée')
  }

  function onTacheSaved(tache: TacheTemplate, isNew: boolean) {
    setTaches(ts => isNew ? [...ts, tache] : ts.map(t => t.id === tache.id ? tache : t))
    closeModal()
    showToast(isNew ? 'Tâche ajoutée' : 'Tâche modifiée')
  }

  /* ── Durée auto-save ── */

  async function handleDurationChange(tacheId: string, minutes: number) {
    // Optimistic update
    setTaches(ts => ts.map(t => t.id === tacheId ? { ...t, duree_minutes: minutes } : t))
    const res = await fetch('/api/taches-template', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tacheId, dureeMinutes: minutes }),
    })
    if (!res.ok) {
      showToast('Erreur enregistrement durée', 'error')
      return
    }
    showToast('✓ Durée enregistrée')
    // Recalcule et met à jour duree_estimee_min sur la résidence
    setTaches(prev => {
      const total = prev.reduce((s, t) => s + (t.id === tacheId ? minutes : (t.duree_minutes ?? 0)), 0)
      fetch('/api/residences/duree', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceId: residence.id, dureeEstimeeMin: total }),
      }).catch(() => null)
      return prev
    })
  }

  function onZoneCreated(zone: ZoneResidence) {
    setZones(zs => [...zs, zone])
    setExpanded(s => new Set([...s, zone.id]))
  }

  /* ── Confirm dialog ── */

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    if (confirmDelete.type === 'zone') await handleDeleteZone(confirmDelete.id)
    else await handleDeleteTache(confirmDelete.id)
    setConfirmDelete(null)
  }

  /* ── Vue par jour — build columns ── */

  const dayColData = (() => {
    const cols: Record<string, { zone: ZoneResidence; tache: TacheTemplate }[]> = {}
    const allCols = [...JOURS_ALL, 'mensuel','trimestriel','semestriel','annuel','sur_passage','contrainte_horaire']
    allCols.forEach(c => { cols[c] = [] })

    taches.forEach(t => {
      const zone = zones.find(z => z.id === t.zone_id) ?? { id: '', nom: 'Sans zone', ordre: 999, couleur: null, residence_id: '', created_at: '' }
      const ft = t.frequence_type

      if (ft === 'hebdo' || ft === 'contrainte_horaire') {
        ;(t.jours_semaine ?? []).forEach(j => {
          if (cols[j]) cols[j].push({ zone, tache: t })
        })
      } else if (cols[ft]) {
        cols[ft].push({ zone, tache: t })
      }
    })
    return cols
  })()

  /* ── Tâches par zone ── */

  const tachesByZone = (zoneId: string | null) =>
    taches.filter(t => (zoneId === null ? !t.zone_id : t.zone_id === zoneId))

  const unzonedTaches = tachesByZone(null)

  /* ── Totaux durée (base annuelle) ── */

  const dureTotaux = useMemo(() => {
    let annuel = 0
    let incompleteCount = 0

    taches.forEach(t => {
      const d = t.duree_minutes ?? 0
      if (!d) { incompleteCount++; return }
      const ft = t.frequence_type
      const nJours = Math.max((t.jours_semaine ?? []).length, 1)

      switch (ft) {
        case 'hebdo':
        case 'contrainte_horaire':
          annuel += d * 52 * nJours; break
        case 'mensuel':
          annuel += d * 12 * Math.max(t.frequence_valeur || 1, 1); break
        case 'trimestriel':
          annuel += d * 4; break
        case 'semestriel':
          annuel += d * 2; break
        case 'annuel':
          annuel += d; break
        // sur_passage: non comptabilisé
      }
    })

    return {
      annuel,
      mois: annuel / 12,
      semaine: annuel / 52,
      incomplete: incompleteCount > 0,
      incompleteCount,
    }
  }, [taches])

  /* ── Render ── */

  return (
    <div className="min-h-screen bg-slate-100">

      {/* Header */}
      <div className="bg-[#0A2E5A] text-white px-4 py-5 md:px-8">
        <Link href="/manager/residences"
          className="inline-flex items-center gap-2 text-blue-300 hover:text-white text-sm mb-3 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          Retour aux résidences
        </Link>
        <h1 className="text-xl font-bold">{residence.nom}</h1>
        <p className="text-blue-300 text-sm mt-0.5">
          {zones.length} zone{zones.length > 1 ? 's' : ''} · {taches.length} tâche{taches.length > 1 ? 's' : ''} template
        </p>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 md:px-8 flex items-center gap-3 flex-wrap">
        <button onClick={handleAddZone}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          Ajouter une zone
        </button>
        <button onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium transition-all"
          style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          Ajouter une tâche
        </button>

        <div className="ml-auto flex bg-slate-100 rounded-xl p-1 gap-1">
          {(['zone','day'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                view === v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}>
              {v === 'zone' ? 'Par zone' : 'Par jour'}
            </button>
          ))}
        </div>
      </div>

      {/* Corps */}
      <div className={`p-4 md:p-8 space-y-4 ${taches.length > 0 ? 'pb-44' : 'pb-24'}`}>

        {/* ── Vue par zone ── */}
        {view === 'zone' && (
          <>
            {zones.length === 0 && taches.length === 0 && (
              <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">
                <p className="text-4xl mb-3">📋</p>
                <p className="font-medium text-slate-500">Aucune zone ni tâche pour le moment.</p>
                <div className="flex gap-3 justify-center mt-4">
                  <button onClick={handleAddZone} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium">+ Zone</button>
                  <button onClick={() => openModal()} className="px-4 py-2 bg-[#0A2E5A] text-white rounded-xl text-sm font-medium">+ Tâche</button>
                </div>
              </div>
            )}

            {zones.map(zone => {
              const zoneTaches = tachesByZone(zone.id)
              const isOpen = expanded.has(zone.id)
              return (
                <div key={zone.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  {/* Zone header */}
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
                    onClick={() => setExpanded(s => {
                      const n = new Set(s); if (n.has(zone.id)) n.delete(zone.id); else n.add(zone.id); return n
                    })}>
                    <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                    </svg>

                    {renamingZone === zone.id ? (
                      <ZoneRenameInput
                        initial={zone.nom}
                        onSave={nom => handleRenameZone(zone.id, nom)}
                        onCancel={() => setRenaming(null)}
                      />
                    ) : (() => {
                      const zTotal = zoneTaches.reduce((s, t) => s + (t.duree_minutes ?? 0), 0)
                      const zIncomplete = zoneTaches.some(t => !t.duree_minutes)
                      return (
                        <>
                          <h2 className="font-semibold text-slate-800 flex-1">{zone.nom}</h2>
                          <span className="text-xs text-slate-400 shrink-0">
                            {zoneTaches.length} tâche{zoneTaches.length > 1 ? 's' : ''}
                          </span>
                          {zTotal > 0 && (
                            <span className={`text-xs font-semibold shrink-0 flex items-center gap-1 ${zIncomplete ? 'text-amber-500' : 'text-[#0BBFBF]'}`}>
                              ⏱ {zIncomplete ? '~' : ''}{formatDuree(zTotal)}{zIncomplete ? ' (incomplet)' : ''}
                            </span>
                          )}
                        </>
                      )
                    })()}

                    {renamingZone !== zone.id && (
                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setRenaming(zone.id)}
                          className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 transition-colors"
                          title="Renommer">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                        </button>
                        <button onClick={() => handleDuplicateZone(zone)}
                          className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center hover:bg-teal-100 transition-colors"
                          title="Dupliquer la zone et ses tâches">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>
                        </button>
                        <button onClick={() => setConfirmDelete({ type: 'zone', id: zone.id, label: zone.nom })}
                          className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors"
                          title="Supprimer">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                        </button>
                        <button onClick={() => openModal(zone.id)}
                          className="w-7 h-7 rounded-lg bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors"
                          title="Ajouter une tâche">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tâches */}
                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {zoneTaches.length === 0 ? (
                        <div className="px-5 py-5 text-center text-slate-400 text-sm">
                          Aucune tâche dans cette zone.{' '}
                          <button onClick={() => openModal(zone.id)} className="text-[#1A5FA8] hover:underline font-medium">+ Ajouter</button>
                        </div>
                      ) : (
                        zoneTaches.map(t => <TacheRow key={t.id} tache={t} onEdit={() => openEdit(t)} onDelete={() => setConfirmDelete({ type: 'tache', id: t.id, label: t.libelle })} onDurationChange={handleDurationChange}/>)
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Tâches sans zone */}
            {unzonedTaches.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4">
                  <span className="text-slate-400 text-sm italic flex-1">Sans zone ({unzonedTaches.length})</span>
                </div>
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {unzonedTaches.map(t => <TacheRow key={t.id} tache={t} onEdit={() => openEdit(t)} onDelete={() => setConfirmDelete({ type: 'tache', id: t.id, label: t.libelle })} onDurationChange={handleDurationChange}/>)}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Vue par jour ── */}
        {view === 'day' && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-32 shrink-0">Zone</th>
                    {JOURS_ALL.map(j => (
                      <th key={j} className="px-2 py-3 text-xs font-semibold text-slate-500 text-center">{JOUR_NOMS[j].slice(0,3)}</th>
                    ))}
                    {Object.entries(FREQ_COL_LABELS).map(([k,v]) => (
                      <th key={k} className="px-2 py-3 text-xs font-semibold text-slate-400 text-center whitespace-nowrap">{v}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...zones, { id: null as unknown as string, nom: 'Sans zone', ordre: 999, couleur: null, residence_id: '', created_at: '' }].map(zone => {
                    const zoneTachesForDay = taches.filter(t => (zone.id ? t.zone_id === zone.id : !t.zone_id))
                    if (zoneTachesForDay.length === 0) return null

                    return (
                      <tr key={zone.id ?? 'none'} className="border-b border-slate-100 hover:bg-slate-50 transition-colors align-top">
                        <td className="px-4 py-3 font-medium text-slate-700 text-xs">{zone.nom}</td>
                        {JOURS_ALL.map(j => {
                          const cell = dayColData[j]?.filter(e => (zone.id ? e.zone.id === zone.id : !e.zone.id)) ?? []
                          return (
                            <td key={j} className="px-2 py-3 text-center align-top">
                              {cell.map(({ tache: t }) => (
                                <div key={t.id} className="text-[10px] bg-green-50 text-green-700 rounded px-1.5 py-1 mb-1 text-left leading-tight">
                                  {t.libelle}
                                  {t.frequence_type === 'contrainte_horaire' && t.heure_debut && (
                                    <span className="block text-amber-600">{t.heure_debut}→{t.heure_fin}</span>
                                  )}
                                </div>
                              ))}
                            </td>
                          )
                        })}
                        {Object.keys(FREQ_COL_LABELS).map(ft => {
                          const cell = dayColData[ft]?.filter(e => (zone.id ? e.zone.id === zone.id : !e.zone.id)) ?? []
                          const FREQ_CLR: Record<string,string> = {
                            mensuel:'bg-blue-50 text-blue-700', trimestriel:'bg-orange-50 text-orange-700',
                            semestriel:'bg-purple-50 text-purple-700', annuel:'bg-red-50 text-red-700',
                            sur_passage:'bg-slate-100 text-slate-600',
                          }
                          return (
                            <td key={ft} className="px-2 py-3 text-center align-top">
                              {cell.map(({ tache: t }) => (
                                <div key={t.id} className={`text-[10px] rounded px-1.5 py-1 mb-1 text-left leading-tight ${FREQ_CLR[ft] ?? ''}`}>
                                  {t.libelle}
                                </div>
                              ))}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {taches.length === 0 && (
                <div className="p-10 text-center text-slate-400">
                  <p className="text-3xl mb-2">📅</p>
                  <p>Aucune tâche à afficher.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bandeau durée + rentabilité ── */}
      {taches.length > 0 && (() => {
        const taux = parametres?.taux_horaire_agent ?? 0
        const ca   = contrat?.montant_mensuel ?? 0
        const caHebdo = ca * 12 / 52
        const caAnn   = ca * 12

        // Estimé — formule : minutes / 60 * taux
        const hmois = dureTotaux.mois / 60
        const hsem  = dureTotaux.semaine / 60
        const hann  = dureTotaux.annuel / 60
        const coutEstimeMois = hmois * taux
        const coutEstimeSem  = hsem  * taux
        const coutEstimeAnn  = hann  * taux
        const margeEstimeMois = ca      - coutEstimeMois
        const margeEstimeSem  = caHebdo - coutEstimeSem
        const margeEstimeAnn  = caAnn   - coutEstimeAnn
        const pctEstime = ca > 0 && taux > 0 ? (margeEstimeMois / ca) * 100 : null
        const hasEstime = ca > 0 && taux > 0 && dureTotaux.annuel > 0

        // Réel 30j
        let reel: {
          hrMois: number; hrSem: number
          coutMois: number; coutSem: number
          margeMois: number; margeSem: number
          pct: number; ecartPct: number | null
        } | null = null
        if (statsReel && taux > 0 && ca > 0) {
          const hrMois = statsReel.totalMin / 60
          const hrSem  = hrMois * 12 / 52
          const crMois = hrMois * taux
          const crSem  = hrSem  * taux
          const mrMois = ca      - crMois
          const mrSem  = caHebdo - crSem
          const prct   = (mrMois / ca) * 100
          const ecartPct = hmois > 0 ? ((hrMois - hmois) / hmois) * 100 : null
          reel = { hrMois, hrSem, coutMois: crMois, coutSem: crSem, margeMois: mrMois, margeSem: mrSem, pct: prct, ecartPct }
        }

        const mc = pctEstime !== null
          ? pctEstime >= 40 ? '#4ade80' : pctEstime >= 30 ? '#60a5fa' : pctEstime >= 20 ? '#fb923c' : '#f87171'
          : null
        const mr = reel !== null
          ? reel.pct >= 40 ? '#4ade80' : reel.pct >= 30 ? '#60a5fa' : reel.pct >= 20 ? '#fb923c' : '#f87171'
          : null

        const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
        const sgn = (n: number) => (n >= 0 ? '+' : '') + fmt(n)

        return (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0A2E5A] text-white shadow-2xl text-xs">
            {/* Ligne 1 : volumes temps */}
            <div className="px-5 py-2 border-b border-white/10 flex flex-wrap items-center gap-1 md:gap-5">
              <span className="text-[#0BBFBF] font-semibold">⏱</span>
              <span className="text-blue-300">Par an :</span>
              <span className="font-bold">{dureTotaux.incomplete ? '~' : ''}{formatDuree(dureTotaux.annuel)}</span>
              <span className="text-white/20">|</span>
              <span className="text-blue-300">Par mois :</span>
              <span className="font-bold">{dureTotaux.incomplete ? '~' : ''}{formatDuree(dureTotaux.mois)}</span>
              <span className="text-white/20">|</span>
              <span className="text-blue-300">Par semaine :</span>
              <span className="font-bold">{dureTotaux.incomplete ? '~' : ''}{formatDuree(dureTotaux.semaine)}</span>
              {dureTotaux.incomplete && (
                <span className="text-amber-400 ml-2">⚠️ {dureTotaux.incompleteCount} tâche{dureTotaux.incompleteCount > 1 ? 's' : ''} sans durée</span>
              )}
            </div>
            {/* Ligne 2 : estimé */}
            <div className="px-5 py-2 border-b border-white/10 flex flex-wrap items-center gap-1 md:gap-5">
              {hasEstime ? (
                <>
                  <span className="text-[#0BBFBF]">💰</span>
                  <span className="text-blue-300">CA :</span>
                  <span className="font-semibold">{fmt(ca)} €/mois → {fmt(caAnn)} €/an</span>
                  <span className="text-white/20">|</span>
                  <span className="text-blue-300">Coût estimé :</span>
                  <span className="font-semibold">{fmt(coutEstimeMois)} €/mois · {fmt(coutEstimeSem)} €/sem · {fmt(coutEstimeAnn)} €/an</span>
                  <span className="text-white/20">|</span>
                  <span className="text-blue-300">Marge estimée :</span>
                  <span className="font-bold" style={{ color: mc ?? 'white' }}>
                    {sgn(margeEstimeMois)} €/mois · {sgn(margeEstimeSem)} €/sem · {sgn(margeEstimeAnn)} €/an
                    {pctEstime !== null ? ` (${pctEstime.toFixed(1)} %)` : ''}
                  </span>
                </>
              ) : contrat && !parametres ? (
                <span className="text-amber-400">⚙️ Taux horaire non configuré — demandez au directeur</span>
              ) : !contrat ? (
                <span className="text-blue-300/50">Aucun contrat actif pour cette résidence</span>
              ) : (
                <span className="text-amber-400">⏱ Renseignez les durées de tâches pour calculer la rentabilité</span>
              )}
            </div>
            {/* Ligne 3 : réel 30j */}
            <div className="px-5 py-2 flex flex-wrap items-center gap-1 md:gap-5">
              {reel ? (
                <>
                  <span className="text-[#0BBFBF]">📊</span>
                  <span className="text-blue-300">Temps réel ({statsReel!.count} interv. 30j) :</span>
                  <span className="font-semibold">{formatDuree(reel.hrMois * 60)}/mois · {formatDuree(reel.hrSem * 60)}/sem</span>
                  <span className="text-white/20">|</span>
                  <span className="text-blue-300">Coût réel :</span>
                  <span className="font-semibold">{fmt(reel.coutMois)} €/mois · {fmt(reel.coutSem)} €/sem</span>
                  <span className="text-white/20">|</span>
                  <span className="text-blue-300">Marge réelle :</span>
                  <span className="font-bold" style={{ color: mr ?? 'white' }}>
                    {sgn(reel.margeMois)} €/mois · {sgn(reel.margeSem)} €/sem ({reel.pct.toFixed(1)} %)
                  </span>
                  {reel.ecartPct !== null && (
                    <>
                      <span className="text-white/20">|</span>
                      <span className={`font-semibold ${Math.abs(reel.ecartPct) > 10 ? (reel.ecartPct > 0 ? 'text-red-400' : 'text-green-400') : 'text-blue-300'}`}>
                        Écart : {reel.ecartPct > 0 ? '+' : ''}{reel.ecartPct.toFixed(1)} % vs estimé
                        {reel.ecartPct > 10 ? ' ⚠️' : reel.ecartPct < -10 ? ' ✅' : ''}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-blue-300/50">📊 Réel : en attente des premières interventions</span>
              )}
            </div>
          </div>
        )
      })()}

      {/* Modal tâche */}
      {modal.open && (
        <TacheModal
          residenceId={residence.id}
          zones={zones}
          taches={taches}
          editingTache={editingTache}
          initialZoneId={modal.zoneId}
          onClose={closeModal}
          onSaved={onTacheSaved}
          onZoneCreated={onZoneCreated}
        />
      )}

      {/* Confirmation suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-slate-800">
                Supprimer {confirmDelete.type === 'zone' ? 'la zone' : 'la tâche'} ?
              </h2>
            </div>
            <p className="text-sm text-slate-600 mb-1 font-semibold">{confirmDelete.label}</p>
            {confirmDelete.type === 'zone' && (
              <p className="text-sm text-slate-500 mb-5">Les tâches de cette zone ne seront pas supprimées mais dissociées.</p>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">
                Annuler
              </button>
              <button onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)}/>}
    </div>
  )
}

/* ── TacheRow ─────────────────────────────────── */

function TacheRow({
  tache: t, onEdit, onDelete, onDurationChange,
}: {
  tache: TacheTemplate
  onEdit: () => void
  onDelete: () => void
  onDurationChange: (id: string, minutes: number) => void
}) {
  const badge = FREQ_BADGE[t.frequence_type]
  const [showCustom, setShowCustom] = useState(false)
  const [customVal, setCustomVal]   = useState('')
  const current = t.duree_minutes ?? 0
  const isPreset = DUREE_PRESETS.some(p => p.value === current)

  function commitCustom() {
    const n = parseInt(customVal, 10)
    if (!isNaN(n) && n > 0) onDurationChange(t.id, n)
    setShowCustom(false)
    setCustomVal('')
  }

  return (
    <div className="px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800 font-medium truncate">{t.libelle}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{freqSummary(t)}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${badge?.bg ?? 'bg-slate-100 text-slate-600'}`}>
          {badge?.label ?? t.frequence_type}
        </span>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit}
            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 transition-colors"
            title="Modifier">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
          </button>
          <button onClick={onDelete}
            className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors"
            title="Supprimer">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
          </button>
        </div>
      </div>

      {/* Pastilles durée */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {DUREE_PRESETS.map(p => (
          <button
            key={p.value}
            onClick={() => onDurationChange(t.id, p.value)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              current === p.value
                ? 'bg-[#0A2E5A] text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
        {/* Valeur perso non-preset */}
        {current > 0 && !isPreset && (
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#0A2E5A] text-white">
            {formatDuree(current)}
          </span>
        )}
        {showCustom ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus type="number" min="1" max="480" value={customVal}
              onChange={e => setCustomVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitCustom(); if (e.key === 'Escape') setShowCustom(false) }}
              className="w-16 px-2 py-1 rounded-lg border border-[#0BBFBF] text-[11px] focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]"
              placeholder="min"
            />
            <button onClick={commitCustom} className="px-2 py-1 bg-[#0BBFBF] text-white rounded-lg text-[11px] font-semibold">✓</button>
            <button onClick={() => setShowCustom(false)} className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[11px]">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}
