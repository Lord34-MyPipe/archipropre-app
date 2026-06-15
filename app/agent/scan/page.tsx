'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { distanceMetres } from '@/lib/geo'
import { Suspense } from 'react'

// ─── Logique principale ────────────────────────────────────────────────────────

function ScanPageInner() {
  const router      = useRouter()
  const params      = useSearchParams()
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const rafRef      = useRef<number>(0)
  const streamRef   = useRef<MediaStream | null>(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [manual, setManual]           = useState('')
  const [status, setStatus]           = useState<'idle' | 'processing' | 'error'>('idle')
  const [message, setMessage]         = useState('')

  // ── Traitement d'un token scanné / saisi ──────────────────────────────────
  const processToken = useCallback(async (token: string) => {
    if (status === 'processing') return
    setStatus('processing')
    setMessage('Localisation en cours…')

    const supabase = createClient()

    // 1. Retrouver la résidence
    const { data: residence } = await supabase
      .from('residences')
      .select('id, lat, lng, manager_id')
      .eq('qr_code_token', token)
      .single()

    if (!residence) {
      setStatus('error')
      setMessage('QR code non reconnu. Vérifiez que vous êtes dans la bonne résidence.')
      return
    }

    // 2. Géolocalisation
    let geoloc_lat: number | null = null
    let geoloc_lng: number | null = null
    let hors_zone = false

    try {
      setMessage('Capture de la position GPS…')
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        })
      )
      geoloc_lat = pos.coords.latitude
      geoloc_lng = pos.coords.longitude

      // Vérifier la distance si la résidence a des coordonnées
      if (residence.lat && residence.lng) {
        const dist = distanceMetres(geoloc_lat, geoloc_lng, residence.lat, residence.lng)
        if (dist > 200) {
          hors_zone = true
        }
      }
    } catch {
      // Géoloc refusée ou indisponible — on continue sans bloquer
    }

    // 3. Trouver l'intervention du jour
    const { data: { user } } = await supabase.auth.getUser()
    const today = new Date().toISOString().split('T')[0]

    setMessage('Recherche de l\'intervention…')

    const { data: inter } = await supabase
      .from('interventions')
      .select('id, statut')
      .eq('agent_id', user!.id)
      .eq('residence_id', residence.id)
      .eq('date_prevue', today)
      .in('statut', ['planifiee', 'en_cours'])
      .order('heure_debut_prevue')
      .limit(1)
      .single()

    if (!inter) {
      setStatus('error')
      setMessage('Aucune intervention planifiée pour cette résidence aujourd\'hui.')
      return
    }

    // 4. Démarrer l'intervention si planifiée
    if (inter.statut === 'planifiee') {
      setMessage('Démarrage de l\'intervention…')

      await supabase.from('interventions').update({
        statut: 'en_cours',
        heure_scan: new Date().toISOString(),
        geoloc_lat,
        geoloc_lng,
      }).eq('id', inter.id)

      // Copier les tâches template du jour
      const joursSemaine = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
      const jourCourant  = joursSemaine[new Date().getDay()]

      const { data: taches } = await supabase
        .from('taches_template')
        .select('id, libelle, zones_residence(nom)')
        .eq('residence_id', residence.id)
        .order('ordre')

      type TacheRaw = { id: string; libelle: string; jours_semaine: string[]; zones_residence: { nom: string }[] }
      const tachesDuJour = (taches as TacheRaw[] ?? []).filter(t =>
        !t.jours_semaine?.length || t.jours_semaine.includes(jourCourant)
      )

      if (tachesDuJour.length > 0) {
        await supabase.from('taches_intervention').insert(
          tachesDuJour.map(t => ({
            intervention_id:   inter.id,
            tache_template_id: t.id,
            libelle:           t.libelle,
            zone_nom:          t.zones_residence?.[0]?.nom ?? null,
          }))
        )
      }

      // 5. Alerte hors zone au manager
      if (hors_zone && residence.manager_id) {
        await supabase.from('alertes').insert({
          intervention_id: inter.id,
          type:            'hors_zone',
          message:         `Agent hors zone au moment du scan (plus de 200 m de la résidence).`,
          destinataire_id: residence.manager_id,
        })
      }
    }

    // Couper la caméra avant de naviguer
    streamRef.current?.getTracks().forEach(t => t.stop())
    cancelAnimationFrame(rafRef.current)

    router.push(`/agent/intervention/${inter.id}`)
  }, [status, router])

  // ── Lecture automatique du token depuis l'URL (?token=xxx) ────────────────
  useEffect(() => {
    const token = params.get('token')
    if (token) processToken(token)
  }, [params, processToken])

  // ── Caméra + décodage jsQR frame par frame ────────────────────────────────
  useEffect(() => {
    // Si le token est déjà dans l'URL, pas besoin de la caméra
    if (params.get('token')) return

    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            if (!cancelled) setCameraReady(true)
          }
        }
      } catch {
        if (!cancelled) setCameraError('Accès caméra refusé. Utilisez la saisie manuelle.')
      }
    }

    async function scanFrame() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(scanFrame)
        return
      }

      canvas.width  = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Import dynamique pour ne pas alourdir le bundle initial
      const jsQR = (await import('jsqr')).default
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code?.data) {
        cancelAnimationFrame(rafRef.current)
        // Extraire le token : URL complète ou token brut
        try {
          const url = new URL(code.data)
          const token = url.searchParams.get('token') ?? code.data
          processToken(token)
        } catch {
          processToken(code.data) // pas une URL → traiter comme token brut
        }
        return
      }

      if (!cancelled) rafRef.current = requestAnimationFrame(scanFrame)
    }

    startCamera().then(() => {
      if (!cancelled) rafRef.current = requestAnimationFrame(scanFrame)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [params, processToken])

  // ── Saisie manuelle ───────────────────────────────────────────────────────
  function handleManual(e: React.FormEvent) {
    e.preventDefault()
    if (manual.trim()) processToken(manual.trim())
  }

  const tokenInUrl = !!params.get('token')

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-10 pb-4 flex items-center gap-3">
        <button onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
        </button>
        <h1 className="text-white font-bold text-xl">Scanner un chantier</h1>
      </div>

      {/* Zone caméra ou état */}
      <div className="relative flex-1 flex items-center justify-center px-6 py-4">

        {/* Processing overlay */}
        {status === 'processing' && (
          <div className="absolute inset-0 bg-slate-900/90 z-20 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-3 border-[#0BBFBF]/30 border-t-[#0BBFBF] rounded-full animate-spin"/>
            <p className="text-white font-medium">{message}</p>
          </div>
        )}

        {tokenInUrl ? (
          /* Mode URL : pas de caméra, juste le spinner */
          <div className="text-center text-slate-400">
            <div className="w-12 h-12 border-2 border-[#0BBFBF]/40 border-t-[#0BBFBF] rounded-full animate-spin mx-auto mb-4"/>
            <p className="text-sm">Lecture du QR code…</p>
          </div>
        ) : (
          /* Mode caméra */
          <div className="relative w-full max-w-xs aspect-square">
            <video ref={videoRef} autoPlay playsInline muted
              className="w-full h-full object-cover rounded-3xl bg-slate-800"/>
            {/* Canvas caché pour jsQR */}
            <canvas ref={canvasRef} className="hidden"/>

            {/* Viseur */}
            {cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-52 h-52 relative">
                  {[
                    'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
                    'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
                    'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
                    'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-10 h-10 ${cls} border-[#0BBFBF]`}/>
                  ))}
                  <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-[#0BBFBF]/70 animate-pulse"/>
                </div>
              </div>
            )}

            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <div className="w-8 h-8 border-2 border-slate-500 border-t-[#0BBFBF] rounded-full animate-spin mx-auto mb-3"/>
                  <p className="text-sm">Initialisation caméra…</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      {(status === 'error' || cameraError) && (
        <div className="mx-6 mb-3 p-3 bg-red-900/40 border border-red-500/40 rounded-2xl text-red-300 text-sm text-center">
          {status === 'error' ? message : cameraError}
          {status === 'error' && (
            <button onClick={() => { setStatus('idle'); setMessage('') }}
              className="block mx-auto mt-2 text-xs text-red-400 underline">
              Réessayer
            </button>
          )}
        </div>
      )}

      {/* Saisie manuelle */}
      {!tokenInUrl && (
        <div className="px-6 pb-10 space-y-3">
          <p className="text-slate-500 text-center text-xs">— ou entrez le code manuellement —</p>
          <form onSubmit={handleManual} className="flex gap-3">
            <input
              type="text" value={manual} onChange={e => setManual(e.target.value)}
              placeholder="Token de la résidence"
              className="flex-1 px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 text-base focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"
            />
            <button type="submit" disabled={status === 'processing'}
              className="px-5 py-3.5 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ background: '#0BBFBF' }}>
              OK
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// Suspense requis car useSearchParams() est utilisé dans un Client Component
export default function ScanPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0BBFBF]/40 border-t-[#0BBFBF] rounded-full animate-spin"/>
      </div>
    }>
      <ScanPageInner />
    </Suspense>
  )
}
