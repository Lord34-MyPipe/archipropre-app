'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'

const icone = L.divIcon({
  className: '',
  html: '<div style="width:20px;height:20px;background:#0BBFBF;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:grab"></div>',
  iconSize:   [20, 20],
  iconAnchor: [10, 10],
})

interface Props {
  lat:    number
  lng:    number
  onMove: (lat: number, lng: number) => void
}

export default function MiniMapMarqueur({ lat, lng, onMove }: Props) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height: 200, width: '100%', borderRadius: 8 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Marker
        position={[lat, lng]}
        icon={icone}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const pos = (e.target as L.Marker).getLatLng()
            onMove(pos.lat, pos.lng)
          },
        }}
      />
    </MapContainer>
  )
}
