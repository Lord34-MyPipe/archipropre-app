/** Distance en mètres entre deux coordonnées GPS (formule Haversine) */
export function distanceMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6_371_000 // rayon Terre en mètres
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
