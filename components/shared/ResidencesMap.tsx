'use client'

import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useState, useMemo } from 'react'
import type { Residence, TypeClient } from '@/lib/types'

const CENTER: [number, number] = [43.6108, 3.8767]

const TYPE_COLORS: Record<string, string> = {
  syndic: '#1A5FA8',
  profession_liberale: '#12B76A',
  societe: '#F97316',
  magasin: '#8B5CF6',
  particulier: '#9AAABB',
}

const TYPE_LABELS: Record<string, string> = {
  syndic: 'Syndic',
  profession_liberale: 'Profession libérale',
  societe: 'Société',
  magasin: 'Magasin',
  particulier: 'Particulier',
}

const STATUT_COLORS: Record<string, string> = {
  terminee: '#12B76A',
  en_cours: '#F97316',
  planifiee: '#1A5FA8',
}

const STATUT_LABELS: Record<string, string> = {
  terminee: 'Terminée',
  en_cours: 'En cours',
  planifiee: 'Planifiée',
}

function makeIcon(color: string, inactive = false) {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,${inactive ? '.12' : '.28'});opacity:${inactive ? .45 : 1}"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -18],
  })
}

export type ResidenceMapItem = Residence & {
  interventionStatut?: 'terminee' | 'en_cours' | 'planifiee' | null
  heureDebut?: string | null
  agentNom?: string | null
  agentId?: string | null
  managerNom?: string | null
  managerId?: string | null
  hasContrat?: boolean
}

interface Props {
  residences: ResidenceMapItem[]
  mode: 'agent' | 'manager' | 'directeur'
  showFilters?: boolean
  agents?: { id: string; nom: string; prenom: string }[]
  managers?: { id: string; nom: string; prenom: string }[]
  height?: string
}

export default function ResidencesMap({
  residences,
  mode,
  showFilters = false,
  agents = [],
  managers = [],
  height = '520px',
}: Props) {
  const [filterStatut, setFilterStatut] = useState<'all' | 'actif' | 'sommeil'>('all')
  const [filterType, setFilterType] = useState<'all' | TypeClient>('all')
  const [filterAgentId, setFilterAgentId] = useState<'all' | string>('all')
  const [filterManagerId, setFilterManagerId] = useState<'all' | string>('all')
  const [filterContrat, setFilterContrat] = useState<'all' | 'avec' | 'sans'>('all')

  const filtered = useMemo(() => residences.filter(r => {
    if (filterStatut === 'actif' && !r.actif) return false
    if (filterStatut === 'sommeil' && r.actif) return false
    if (filterType !== 'all' && r.type_client !== filterType) return false
    if (filterAgentId !== 'all' && r.agent_prefere_id !== filterAgentId) return false
    if (filterManagerId !== 'all' && r.manager_id !== filterManagerId) return false
    if (filterContrat === 'avec' && !r.hasContrat) return false
    if (filterContrat === 'sans' && r.hasContrat) return false
    return true
  }), [residences, filterStatut, filterType, filterAgentId, filterManagerId, filterContrat])

  const stats = useMemo(() => ({
    total: residences.length,
    actives: residences.filter(r => r.actif).length,
    sommeil: residences.filter(r => !r.actif).length,
  }), [residences])

  const positioned = filtered.filter(r => r.lat != null && r.lng != null)

  function getIcon(r: ResidenceMapItem) {
    if (mode === 'agent') {
      const color = r.interventionStatut ? STATUT_COLORS[r.interventionStatut] : '#9AAABB'
      return makeIcon(color, !r.actif)
    }
    const color = TYPE_COLORS[r.type_client ?? ''] ?? '#9AAABB'
    return makeIcon(color, !r.actif)
  }

  function itineraireUrl(r: ResidenceMapItem) {
    if (r.lat && r.lng) return `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.adresse + ', Montpellier')}`
  }

  const markerElements = positioned.map(r => (
    <Marker key={r.id} position={[r.lat!, r.lng!]} icon={getIcon(r)}>
      <Popup maxWidth={260}>
        <div className="text-sm">
          <p className="font-semibold text-slate-800 mb-1 leading-snug">{r.nom}</p>
          <p className="text-slate-500 text-xs mb-2 leading-snug">{r.adresse}</p>

          {mode === 'agent' && (
            <div className="mb-2">
              {r.interventionStatut ? (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ background: STATUT_COLORS[r.interventionStatut] }}>
                  {STATUT_LABELS[r.interventionStatut]}
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                  Pas d'intervention
                </span>
              )}
              {r.heureDebut && (
                <p className="text-xs text-slate-500 mt-1">Prévu à {r.heureDebut.slice(0, 5)}</p>
              )}
            </div>
          )}

          {mode !== 'agent' && (
            <div className="mb-2 space-y-0.5 text-xs text-slate-600">
              {r.type_client && (
                <p>Type : <span className="font-medium">{TYPE_LABELS[r.type_client] ?? r.type_client}</span></p>
              )}
              {r.agentNom && (
                <p>Agent : <span className="font-medium">{r.agentNom}</span></p>
              )}
              {mode === 'directeur' && r.managerNom && (
                <p>Manager : <span className="font-medium">{r.managerNom}</span></p>
              )}
              {!r.actif && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-400 text-xs rounded-full">
                  En sommeil
                </span>
              )}
            </div>
          )}

          <a href={itineraireUrl(r)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1A5FA8] text-white text-xs rounded-lg font-medium mt-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/>
            </svg>
            Itinéraire
          </a>
        </div>
      </Popup>
    </Marker>
  ))

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ height }}>

      {/* Filter bar */}
      {showFilters && (
        <div className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-2 max-w-[calc(100%-100px)]">
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value as typeof filterStatut)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white shadow-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]">
            <option value="all">Toutes</option>
            <option value="actif">Actives</option>
            <option value="sommeil">En sommeil</option>
          </select>

          {mode !== 'agent' && (
            <select value={filterType} onChange={e => setFilterType(e.target.value as typeof filterType)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white shadow-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]">
              <option value="all">Tous types</option>
              <option value="syndic">Syndic</option>
              <option value="profession_liberale">Prof. libérale</option>
              <option value="societe">Société</option>
              <option value="magasin">Magasin</option>
              <option value="particulier">Particulier</option>
            </select>
          )}

          {mode === 'manager' && agents.length > 0 && (
            <select value={filterAgentId} onChange={e => setFilterAgentId(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white shadow-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]">
              <option value="all">Tous agents</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>
              ))}
            </select>
          )}

          {mode === 'directeur' && managers.length > 0 && (
            <select value={filterManagerId} onChange={e => setFilterManagerId(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white shadow-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]">
              <option value="all">Tous managers</option>
              {managers.map(m => (
                <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>
              ))}
            </select>
          )}

          {mode === 'directeur' && (
            <select value={filterContrat} onChange={e => setFilterContrat(e.target.value as typeof filterContrat)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white shadow-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]">
              <option value="all">Contrat : tous</option>
              <option value="avec">Avec contrat</option>
              <option value="sans">Sans contrat</option>
            </select>
          )}
        </div>
      )}

      {/* Stats overlay (directeur) */}
      {mode === 'directeur' && (
        <div className="absolute top-3 right-3 z-[1000] bg-white/92 backdrop-blur-sm rounded-xl shadow-md px-3.5 py-2.5 text-xs min-w-[110px]">
          <p className="font-semibold text-slate-800 mb-1">{stats.total} résidences</p>
          <div className="flex items-center gap-1.5 text-green-700">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>{stats.actives} actives</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 mt-0.5">
            <div className="w-2 h-2 rounded-full bg-slate-300" />
            <span>{stats.sommeil} en sommeil</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-10 left-3 z-[1000] bg-white/92 backdrop-blur-sm rounded-xl shadow-md px-3 py-2.5 text-xs space-y-1.5">
        {mode === 'agent' ? (
          <>
            {Object.entries(STATUT_COLORS).map(([k, color]) => (
              <div key={k} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full shrink-0 border border-white shadow-sm" style={{ background: color }} />
                <span className="text-slate-600">{STATUT_LABELS[k]}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0 bg-[#9AAABB] border border-white shadow-sm" />
              <span className="text-slate-500">Non planifiée</span>
            </div>
          </>
        ) : (
          Object.entries(TYPE_COLORS).map(([k, color]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0 border border-white shadow-sm" style={{ background: color }} />
              <span className="text-slate-600">{TYPE_LABELS[k]}</span>
            </div>
          ))
        )}
      </div>

      <MapContainer
        center={CENTER}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {mode === 'agent' ? (
          markerElements
        ) : (
          <MarkerClusterGroup chunkedLoading showCoverageOnHover={false}>
            {markerElements}
          </MarkerClusterGroup>
        )}
      </MapContainer>

      {positioned.length === 0 && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 rounded-xl px-4 py-3 text-sm text-slate-500 shadow-md">
            Aucune résidence géolocalisée
          </div>
        </div>
      )}
    </div>
  )
}
