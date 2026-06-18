type LieuNav = { lat?: number | null; lng?: number | null; adresse?: string | null }

export function wazeUrl(r: LieuNav): string {
  if (r.lat && r.lng) return `https://waze.com/ul?ll=${r.lat},${r.lng}&navigate=yes`
  return `https://waze.com/ul?q=${encodeURIComponent((r.adresse ?? '') + ', Montpellier')}&navigate=yes`
}

export function googleMapsUrl(r: LieuNav): string {
  if (r.lat && r.lng) return `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((r.adresse ?? '') + ', Montpellier')}`
}
