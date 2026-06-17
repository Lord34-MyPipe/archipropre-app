'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

// ── Fonds de carte ────────────────────────────────────────────────────────────
type Couche = 'plan' | 'satellite'

const TILES: Record<Couche, { url: string; attribution: string }> = {
  plan: {
    url:         'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url:         'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
  },
}

// ── Marqueur teal ─────────────────────────────────────────────────────────────
const icone = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;background:#0BBFBF;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:grab"></div>',
  iconSize:   [22, 22],
  iconAnchor: [11, 11],
})

// ── invalidateSize après apparition de la modale ──────────────────────────────
function MapResizer() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 60)
    return () => clearTimeout(t)
  }, [map])
  return null
}

// ── Toggle Plan / Satellite ───────────────────────────────────────────────────
function ToggleCouche({ couche, onChange }: { couche: Couche; onChange: (c: Couche) => void }) {
  return (
    <div className="flex rounded-md overflow-hidden border border-slate-200 shadow-sm" style={{ background: 'white' }}>
      {(['plan', 'satellite'] as Couche[]).map(c => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`px-2 py-1 text-[10px] font-medium transition-colors ${
            couche === c ? 'bg-[#0A2E5A] text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {c === 'plan' ? 'Plan' : 'Satellite'}
        </button>
      ))}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  lat:    number
  lng:    number
  onMove: (lat: number, lng: number) => void
}

export default function MiniMapMarqueur({ lat, lng, onMove }: Props) {
  const [couche, setCouche]       = useState<Couche>('plan')
  const [modalOpen, setModalOpen] = useState(false)
  const [mounted,   setMounted]   = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const tile = TILES[couche]

  const markerHandlers = (onDragEnd: (lat: number, lng: number) => void) => ({
    dragend: (e: { target: unknown }) => {
      const pos = (e.target as L.Marker).getLatLng()
      onDragEnd(pos.lat, pos.lng)
    },
  })

  return (
    <>
      {/* ── Mini-carte ─────────────────────────────────────────────────────── */}
      <div className="relative rounded-lg overflow-hidden" style={{ height: 200 }}>
        <MapContainer
          center={[lat, lng]}
          zoom={16}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url={tile.url} attribution={tile.attribution} />
          <Marker
            position={[lat, lng]}
            icon={icone}
            draggable
            eventHandlers={markerHandlers(onMove)}
          />
        </MapContainer>

        {/* Contrôles superposés (z-[1000] > Leaflet tiles ~z-200) */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5" style={{ zIndex: 1000 }}>
          <ToggleCouche couche={couche} onChange={setCouche} />
          <button
            onClick={() => setModalOpen(true)}
            className="px-2 py-1 rounded-md text-[10px] font-medium border border-slate-200 shadow-sm flex items-center gap-1 hover:bg-slate-50 transition-colors"
            style={{ background: 'white', color: '#0A2E5A' }}
          >
            ⤢ Agrandir
          </button>
        </div>
      </div>

      {/* ── Modale grande carte ─────────────────────────────────────────────── */}
      {mounted && modalOpen && createPortal(
        /* Fond semi-transparent — z-index 99999 dépasse le copilote (z-50) */
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 99999, background: 'rgba(10,15,30,0.65)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div
            className="bg-white rounded-2xl flex flex-col shadow-2xl overflow-hidden"
            style={{ width: '85vw', height: '85vh', maxWidth: 960 }}
            onClick={e => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-800">Vérifier la position GPS</p>
              <div className="flex items-center gap-3">
                <ToggleCouche couche={couche} onChange={setCouche} />
                <button
                  onClick={() => setModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors text-lg font-medium"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Grande carte */}
            <div className="flex-1 min-h-0">
              <MapContainer
                center={[lat, lng]}
                zoom={18}
                scrollWheelZoom
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url={tile.url} attribution={tile.attribution} />
                <Marker
                  position={[lat, lng]}
                  icon={icone}
                  draggable
                  eventHandlers={markerHandlers(onMove)}
                />
                <MapResizer />
              </MapContainer>
            </div>

            {/* Pied de modale */}
            <div className="shrink-0 px-4 py-2.5 border-t border-slate-100 text-center">
              <p className="text-[11px] font-mono text-slate-500">
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Déplacez le marqueur pour affiner · fermer pour valider
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
