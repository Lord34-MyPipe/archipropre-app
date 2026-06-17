import { createAdminClient } from '@/lib/supabase-server'

export type ModeTrajet = 'voiture' | 'velo' | 'tramway'

export interface ResultatTrajet {
  duree_minutes: number
  distance_km:   number
  depuis_cache:  boolean
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1'
const PROFIL_OSRM: Record<ModeTrajet, string> = {
  voiture: 'driving',
  velo:    'cycling',
  tramway: 'foot',
}

// Arrondi à 4 décimales (~11 m de précision) pour la clé de cache
function round4(v: number): number {
  return Math.round(v * 10000) / 10000
}

function fallback(dureeNettoyageMin = 60): ResultatTrajet {
  return { duree_minutes: Math.round(dureeNettoyageMin * 0.2), distance_km: 0, depuis_cache: false }
}

/**
 * Calcule le temps de trajet réel via OSRM avec cache Supabase.
 * Pour le mode tramway : foot OSRM + forfait_tram (paramétrable, défaut 20 min).
 * Fallback sur 20 % du temps de nettoyage si OSRM échoue.
 */
export async function calculerTrajet(
  origineLat:           number,
  origineLng:           number,
  destLat:              number,
  destLng:              number,
  mode:                 ModeTrajet = 'voiture',
  fallbackDureeMin = 60,
): Promise<ResultatTrajet> {
  const oLat = round4(origineLat)
  const oLng = round4(origineLng)
  const dLat = round4(destLat)
  const dLng = round4(destLng)

  // Trajet vers soi-même
  if (oLat === dLat && oLng === dLng) {
    return { duree_minutes: 0, distance_km: 0, depuis_cache: false }
  }

  const admin = await createAdminClient()

  // ── Vérification cache ───────────────────────────────────────────────────────
  const { data: cached } = await admin
    .from('distances_cache')
    .select('duree_min, distance_km')
    .eq('origine_lat', oLat)
    .eq('origine_lng', oLng)
    .eq('dest_lat', dLat)
    .eq('dest_lng', dLng)
    .eq('mode', mode)
    .maybeSingle()

  if (cached) {
    return {
      duree_minutes: cached.duree_min ?? 0,
      distance_km:   cached.distance_km ?? 0,
      depuis_cache:  true,
    }
  }

  // ── Appel OSRM ───────────────────────────────────────────────────────────────
  const profil = PROFIL_OSRM[mode]
  // OSRM attend lng,lat (pas lat,lng)
  const url = `${OSRM_BASE}/${profil}/${oLng},${oLat};${dLng},${dLat}?overview=false`

  try {
    const controller = new AbortController()
    const timer      = setTimeout(() => controller.abort(), 6000)
    const res        = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)
    const json = await res.json() as { code: string; routes?: Array<{ duration: number; distance: number }> }

    if (json.code !== 'Ok' || !json.routes?.[0]) throw new Error('OSRM : aucune route trouvée')

    const route      = json.routes[0]
    let duree        = Math.round(route.duration / 60)
    const distance   = Math.round(route.distance / 100) / 10  // en km, 1 décimale

    // ── Surcoût tramway : attente + trajet ───────────────────────────────────
    if (mode === 'tramway') {
      let forfait = 20
      const { data: params } = await admin
        .from('parametres_societe')
        .select('forfait_tram')
        .limit(1)
        .maybeSingle()
      if (typeof params?.forfait_tram === 'number') forfait = params.forfait_tram
      duree += forfait
    }

    // ── Écriture cache (ON CONFLICT DO NOTHING : idempotent si race condition) ─
    await admin.from('distances_cache').upsert(
      { origine_lat: oLat, origine_lng: oLng, dest_lat: dLat, dest_lng: dLng, mode, duree_min: duree, distance_km: distance },
      { onConflict: 'origine_lat,origine_lng,dest_lat,dest_lng,mode', ignoreDuplicates: true },
    )

    return { duree_minutes: duree, distance_km: distance, depuis_cache: false }
  } catch (err) {
    console.error('[trajet] OSRM échec, fallback 20% :', err, `| url=${url}`)
    return fallback(fallbackDureeMin)
  }
}

/**
 * Version sans cache DB (lecture seule depuis le cache existant).
 * Retourne null si pas en cache.
 */
export async function lireCacheTrajet(
  origineLat: number, origineLng: number,
  destLat: number,   destLng: number,
  mode: ModeTrajet,
): Promise<ResultatTrajet | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from('distances_cache')
    .select('duree_min, distance_km')
    .eq('origine_lat', round4(origineLat))
    .eq('origine_lng', round4(origineLng))
    .eq('dest_lat', round4(destLat))
    .eq('dest_lng', round4(destLng))
    .eq('mode', mode)
    .maybeSingle()
  if (!data) return null
  return { duree_minutes: data.duree_min ?? 0, distance_km: data.distance_km ?? 0, depuis_cache: true }
}
