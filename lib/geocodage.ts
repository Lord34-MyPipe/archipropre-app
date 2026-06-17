export interface ResultatGeocodage {
  lat:               number
  lng:               number
  adresse_normalisee: string
}

// Bounding box Montpellier + agglomération (viewbox Nominatim : ouest,nord,est,sud)
const VIEWBOX_MPL = '3.7,43.8,4.1,43.4'

/**
 * Géocode une adresse texte via Nominatim (OpenStreetMap).
 * Biaisé vers la région de Montpellier (viewbox, bounded=0).
 * Retourne null si adresse introuvable ou si Nominatim est indisponible.
 */
export async function geocoder(adresse: string): Promise<ResultatGeocodage | null> {
  if (!adresse.trim()) return null

  const params = new URLSearchParams({
    q:            adresse,
    format:       'json',
    limit:        '1',
    countrycodes: 'fr',
    viewbox:      VIEWBOX_MPL,
    bounded:      '0',  // préfère la zone mais cherche partout
    addressdetails: '0',
  })

  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`

  try {
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url, {
      signal:  controller.signal,
      headers: {
        'User-Agent': 'ArchipropreApp/1.0 (contact@archipropre.fr)',
        'Accept':     'application/json',
      },
    })
    clearTimeout(timer)

    if (!res.ok) {
      console.error(`[geocodage] Nominatim HTTP ${res.status}`)
      return null
    }

    const data = await res.json() as Array<{
      lat:         string
      lon:         string
      display_name: string
    }>

    if (!data.length) return null

    const premier = data[0]
    return {
      lat:               parseFloat(premier.lat),
      lng:               parseFloat(premier.lon),
      adresse_normalisee: premier.display_name,
    }
  } catch (err) {
    console.error('[geocodage] Erreur Nominatim :', err)
    return null
  }
}
