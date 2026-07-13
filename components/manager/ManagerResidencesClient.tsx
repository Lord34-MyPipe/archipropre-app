'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import AgentAttitreModal from '@/components/manager/AgentAttitreModal'
import { downloadQRCodePDF } from '@/lib/qr-pdf'
import type { ResidenceMapItem } from '@/components/shared/ResidencesMap'
import type { EtatResidenceInfo, ResidenceEtat } from './ResidenceCard'
import { createClient } from '@/lib/supabase'
import { Building2, Search, MoreHorizontal, MapPin, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, UserCircle, QrCode, Home } from 'lucide-react'

const ResidencesMap = dynamic(
  () => import('@/components/shared/ResidencesMap'),
  { ssr: false, loading: () => <div className="h-[580px] bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-sm">Chargement de la carte…</div> }
)

const ETAT_OPTIONS: { value: 'all' | ResidenceEtat; label: string; color: string }[] = [
  { value: 'all',            label: 'Tous états',      color: 'bg-slate-100 text-slate-600' },
  { value: 'a_configurer',   label: 'À configurer',    color: 'bg-slate-200 text-slate-600' },
  { value: 'prete',          label: 'Prête',           color: 'bg-orange-100 text-orange-600' },
  { value: 'planning_actif', label: 'Planning actif',  color: 'bg-green-100 text-green-700' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'Tous types' },
  { value: 'syndic', label: 'Syndic' },
  { value: 'profession_liberale', label: 'Profession libérale' },
  { value: 'societe', label: 'Société' },
  { value: 'magasin', label: 'Magasin' },
  { value: 'particulier', label: 'Particulier' },
]
const TYPE_LABEL: Record<string, string> = {
  syndic:              'Syndic',
  profession_liberale: 'Prof. libérale',
  societe:             'Société',
  magasin:             'Magasin',
  particulier:         'Particulier',
}

// Badges d'état — couleurs conservées depuis ResidenceCard
const ETAT_BADGE: Record<ResidenceEtat, { label: string; cls: string }> = {
  a_configurer:   { label: 'À configurer',   cls: 'bg-slate-100 text-slate-500' },
  prete:          { label: 'Prête',          cls: 'bg-orange-100 text-orange-600' },
  planning_actif: { label: 'Planning actif', cls: 'bg-green-100 text-green-700' },
}
const SOMMEIL_BADGE = { label: 'En sommeil', cls: 'bg-[#F1EFE8] text-[#5F5E5A]' }

type ResidenceWithMeta = ResidenceMapItem & { _etat?: EtatResidenceInfo | null; _nbContrats?: number }

type SortKey = 'nom' | 'etat' | 'agent'
type SortDir = 'asc' | 'desc'

type GeoState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; success: number; errors: number }

interface Props {
  residences: ResidenceWithMeta[]
  agents: { id: string; nom: string; prenom: string }[]
  total: number
}

// Rang d'état pour le tri (sommeil en dernier)
function etatRank(r: ResidenceWithMeta): number {
  if (!r.actif) return 3
  const e = r._etat?.etat ?? 'a_configurer'
  return e === 'a_configurer' ? 0 : e === 'prete' ? 1 : 2
}

// « Prénom Nom » → « Prénom N. »
function agentShort(full: string | null | undefined): string | null {
  if (!full) return null
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

export default function ManagerResidencesClient({ residences, agents }: Props) {
  const router = useRouter()
  const [view, setView]           = useState<'list' | 'map'>('list')
  const [search, setSearch]       = useState('')
  const [showSug, setShowSug]     = useState(false)
  const [filterType, setFilterType]     = useState('')
  const [filterEtat, setFilterEtat]     = useState<'all' | ResidenceEtat>('all')
  const [geoState, setGeoState]         = useState<GeoState>({ status: 'idle' })
  const [menuOpen, setMenuOpen]         = useState(false)
  const [sortKey, setSortKey]           = useState<SortKey>('nom')
  const [sortDir, setSortDir]           = useState<SortDir>('asc')
  const [rowMenuId, setRowMenuId]       = useState<string | null>(null)
  const [attitreFor, setAttitreFor]     = useState<ResidenceWithMeta | null>(null)
  const [qrLoadingId, setQrLoadingId]   = useState<string | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const residencesAGeocoder = useMemo(
    () => residences.filter(r => r.adresse && (r.lat == null || r.lng == null)),
    [residences]
  )

  async function lancerGeocodage() {
    if (geoState.status === 'running') return
    const cibles = residencesAGeocoder
    if (!cibles.length) return

    setGeoState({ status: 'running', done: 0, total: cibles.length })
    const supabase = createClient()
    let success = 0
    let errors = 0

    for (let i = 0; i < cibles.length; i++) {
      const res = cibles[i]
      try {
        const resp = await fetch(
          `/api/geocoder?adresse=${encodeURIComponent(res.adresse)}`
        )
        const data = await resp.json()
        if (data.lat && data.lng) {
          await supabase
            .from('residences')
            .update({ lat: data.lat, lng: data.lng })
            .eq('id', res.id)
          success++
        } else {
          errors++
        }
      } catch {
        errors++
      }
      setGeoState({ status: 'running', done: i + 1, total: cibles.length })
      if (i < cibles.length - 1) await new Promise(r => setTimeout(r, 1200))
    }

    setGeoState({ status: 'done', success, errors })
  }

  // Fermer suggestions au clic extérieur
  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSug(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return residences.filter(r => {
      if (q && !r.nom.toLowerCase().includes(q) && !(r.adresse ?? '').toLowerCase().includes(q)) return false
      if (filterType && r.type_client !== filterType) return false
      if (filterEtat !== 'all' && r._etat?.etat !== filterEtat) return false
      return true
    })
  }, [residences, search, filterType, filterEtat])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      if (sortKey === 'agent') {
        const an = a._etat?.nom_agent_attitre ?? ''
        const bn = b._etat?.nom_agent_attitre ?? ''
        if (!an && !bn) return 0
        if (!an) return 1          // sans agent toujours en dernier
        if (!bn) return -1
        return an.localeCompare(bn, 'fr') * dir
      }
      if (sortKey === 'etat') {
        const d = etatRank(a) - etatRank(b)
        return (d !== 0 ? d : a.nom.localeCompare(b.nom, 'fr')) * dir
      }
      return a.nom.localeCompare(b.nom, 'fr') * dir
    })
    return arr
  }, [filtered, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  async function handleQRPDF(r: ResidenceWithMeta) {
    setQrLoadingId(r.id)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
      await downloadQRCodePDF({ nom: r.nom, adresse: r.adresse, token: r.qr_code_token }, appUrl)
    } catch { alert('Erreur lors de la génération du PDF.') }
    setQrLoadingId(null)
  }

  const suggestions = useMemo(() => {
    if (search.length < 2) return []
    const q = search.toLowerCase()
    return residences.filter(r => r.nom.toLowerCase().includes(q)).slice(0, 6)
  }, [residences, search])

  function SortHeader({ label, keyName, className }: { label: string; keyName: SortKey; className?: string }) {
    const active = sortKey === keyName
    return (
      <button
        onClick={() => toggleSort(keyName)}
        className={`flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-700 transition-colors ${className ?? ''}`}
      >
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)
          : <ChevronsUpDown className="w-3.5 h-3.5 text-slate-300" />}
      </button>
    )
  }

  return (
    <div className="p-4 md:p-8 pb-28 md:pb-8 space-y-4">

      {/* Toggle Liste / Carte + bouton géocodage */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
          <button onClick={() => setView('list')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'list' ? 'bg-[#0A2E5A] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"/>
              </svg>
              Liste
            </span>
          </button>
          <button onClick={() => setView('map')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'map' ? 'bg-[#0A2E5A] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/>
              </svg>
              Carte
            </span>
          </button>
        </div>

        {/* Résultat géocodage */}
        {geoState.status === 'done' && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-green-50 border border-green-200 text-green-700">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            {geoState.success} géocodée{geoState.success > 1 ? 's' : ''}
            {geoState.errors > 0 && (
              <span className="text-amber-600 ml-1">
                · {geoState.errors} échec{geoState.errors > 1 ? 's' : ''} (adresse imprécise)
              </span>
            )}
          </div>
        )}

        {/* Menu ⋯ */}
        {residencesAGeocoder.length > 0 && geoState.status !== 'done' && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(o => !o)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
              aria-label="Plus d'options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-[240px]">
                <button
                  onClick={() => { setMenuOpen(false); lancerGeocodage() }}
                  disabled={geoState.status === 'running'}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 text-left"
                >
                  {geoState.status === 'running' ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-[#0BBFBF] shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      {geoState.done}/{geoState.total} géocodées…
                    </>
                  ) : (
                    <>
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      Géocoder les adresses ({residencesAGeocoder.length})
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barre de recherche + filtres — visibles en vue liste uniquement */}
      {view === 'list' && (
        <div className="space-y-3">
          {/* Recherche */}
          <div ref={searchRef} className="relative">
            <div className="relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSug(true) }}
                onFocus={() => search.length >= 2 && setShowSug(true)}
                placeholder="Rechercher une résidence..."
                className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent shadow-sm"
              />
              {search && (
                <button
                  onClick={() => { setSearch(''); setShowSug(false) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 transition-colors">
                  <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              )}
            </div>

            {/* Dropdown suggestions */}
            {showSug && suggestions.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-100 rounded-2xl shadow-xl z-30 overflow-hidden">
                {suggestions.map(r => (
                  <button
                    key={r.id}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setSearch(r.nom); setShowSug(false) }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                    <Building2 className="w-4 h-4 text-slate-300" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{r.nom}</p>
                      <p className="text-xs text-slate-400 truncate">{r.adresse}</p>
                    </div>
                    {!r.actif && (
                      <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full shrink-0">Sommeil</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filtres état — boutons pill */}
          <div className="flex items-center gap-2 flex-wrap">
            {ETAT_OPTIONS.map(o => (
              <button key={o.value}
                onClick={() => setFilterEtat(o.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                  filterEtat === o.value
                    ? `${o.color} border-current shadow-sm`
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}>
                {o.label}
              </button>
            ))}
          </div>

          {/* Filtres compacts */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] cursor-pointer">
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {(filterType || filterEtat !== 'all' || search) && (
              <button
                onClick={() => { setFilterType(''); setFilterEtat('all'); setSearch('') }}
                className="px-3 py-2 bg-slate-100 text-slate-500 rounded-xl text-sm hover:bg-slate-200 transition-colors flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
                Effacer
              </button>
            )}

            <span className="ml-auto text-sm text-slate-500 font-medium">
              {filtered.length === residences.length
                ? `${residences.length} résidence${residences.length > 1 ? 's' : ''}`
                : `${filtered.length} résidence${filtered.length > 1 ? 's' : ''}`}
            </span>
          </div>
        </div>
      )}

      {/* Contenu */}
      {view === 'list' ? (
        filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">
            {residences.length === 0
              ? <Building2 className="w-12 h-12 mb-3 text-slate-200 mx-auto" />
              : <Search className="w-12 h-12 mb-3 text-slate-200 mx-auto" />
            }
            <p className="font-medium text-slate-500">
              {residences.length === 0
                ? 'Aucune résidence assignée à votre secteur.'
                : 'Aucune résidence ne correspond à votre recherche.'}
            </p>
            {residences.length > 0 && search && (
              <button onClick={() => setSearch('')}
                className="mt-4 px-4 py-2 bg-[#0BBFBF] text-white rounded-xl text-sm font-medium">
                Effacer la recherche
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs">
                  <th className="px-4 py-2.5"><SortHeader label="Résidence" keyName="nom" /></th>
                  <th className="px-3 py-2.5"><SortHeader label="État" keyName="etat" /></th>
                  <th className="px-3 py-2.5 font-semibold text-slate-500">Type</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-500 text-center">Contrats</th>
                  <th className="px-3 py-2.5"><SortHeader label="Agent" keyName="agent" /></th>
                  <th className="px-3 py-2.5 font-semibold text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map(r => {
                  const etat: ResidenceEtat = r._etat?.etat ?? 'a_configurer'
                  const badge = !r.actif ? SOMMEIL_BADGE : ETAT_BADGE[etat]
                  const agent = agentShort(r._etat?.nom_agent_attitre)
                  const nbContrats = r._nbContrats ?? 0
                  const aConfigurer = r.actif && etat === 'a_configurer'
                  const noteImport =
                    r.notes_import === 'adresse_manquante' ? 'Adresse manquante'
                    : r.notes_import === 'doublon_potentiel' ? 'Doublon potentiel à vérifier'
                    : null

                  return (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/manager/residences/${r.id}`)}
                      className={`h-14 cursor-pointer hover:bg-slate-50 transition-colors ${!r.actif ? 'opacity-60' : ''}`}
                    >
                      {/* 1. Nom + adresse */}
                      <td className="px-4 py-2 max-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-800 truncate">{r.nom}</span>
                          {noteImport && (
                            <span title={noteImport} className="shrink-0">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate">{r.adresse || '—'}</p>
                      </td>

                      {/* 2. État */}
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* 3. Type client */}
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                        {r.type_client ? (TYPE_LABEL[r.type_client] ?? r.type_client) : '—'}
                      </td>

                      {/* 4. Contrats */}
                      <td className="px-3 py-2 text-center text-slate-600 font-medium">
                        {nbContrats > 0 ? nbContrats : <span className="text-slate-300">—</span>}
                      </td>

                      {/* 5. Agent attitré */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        {agent
                          ? <span className="text-slate-700">{agent}</span>
                          : <span className="text-slate-400 italic">Aucun agent</span>}
                      </td>

                      {/* 6. Actions */}
                      <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {aConfigurer && (
                            <button
                              onClick={() => router.push(`/manager/residences/${r.id}`)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 bg-blue-50 text-[#185FA5] hover:bg-blue-100 transition-colors whitespace-nowrap"
                            >
                              Configurer
                            </button>
                          )}
                          <div className="relative">
                            <button
                              onClick={() => setRowMenuId(id => (id === r.id ? null : r.id))}
                              onBlur={() => setTimeout(() => setRowMenuId(id => (id === r.id ? null : id)), 150)}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors"
                              aria-label="Plus d'options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {rowMenuId === r.id && (
                              <div className="absolute right-0 top-full mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-lg py-1 min-w-[190px] text-left">
                                <button
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => { setRowMenuId(null); setAttitreFor(r) }}
                                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                                >
                                  <UserCircle className="w-4 h-4 text-slate-400 shrink-0" /> Affectation
                                </button>
                                {r.qr_code_token && (
                                  <button
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => { setRowMenuId(null); handleQRPDF(r) }}
                                    disabled={qrLoadingId === r.id}
                                    className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left disabled:opacity-50"
                                  >
                                    <QrCode className="w-4 h-4 text-slate-400 shrink-0" /> QR Code
                                  </button>
                                )}
                                <button
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => { setRowMenuId(null); router.push(`/manager/residences/${r.id}`) }}
                                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
                                >
                                  <Home className="w-4 h-4 text-slate-400 shrink-0" /> Fiche résidence
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="shadow-sm border border-slate-100 rounded-2xl overflow-hidden">
          <ResidencesMap
            residences={residences}
            mode="manager"
            showFilters
            agents={agents}
            height="580px"
          />
        </div>
      )}

      {/* Modale Affectation — réutilise AgentAttitreModal (logique ResidenceCard) */}
      {attitreFor && (
        <AgentAttitreModal
          residence={attitreFor}
          onClose={() => setAttitreFor(null)}
          onSaved={() => { setAttitreFor(null); router.refresh() }}
        />
      )}

      {/* FAB — Ajouter une résidence */}
      <div className="fixed bottom-24 right-5 md:bottom-8 md:right-8 z-20">
        <button
          onClick={() => alert('Fonctionnalité à venir : formulaire de création de résidence.')}
          className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all"
          style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
          title="Ajouter une résidence">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
