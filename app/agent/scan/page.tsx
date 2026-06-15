'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function ScanPage() {
  const router  = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady]     = useState(false)
  const [error, setError]     = useState('')
  const [manual, setManual]   = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let stream: MediaStream
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        stream = s
        if (videoRef.current) { videoRef.current.srcObject = s; setReady(true) }
      })
      .catch(() => setError('Accès caméra refusé — utilisez la saisie manuelle.'))
    return () => stream?.getTracks().forEach(t => t.stop())
  }, [])

  const handleToken = useCallback(async (token: string) => {
    if (loading) return
    setLoading(true)
    setError('')
    const supabase = createClient()

    // Récupérer la résidence par token
    const { data: res } = await supabase
      .from('residences').select('id').eq('qr_code_token', token).single()
    if (!res) { setError('QR code non reconnu.'); setLoading(false); return }

    // Géolocalisation
    let lat: number | null = null, lng: number | null = null
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      )
      lat = pos.coords.latitude
      lng = pos.coords.longitude
    } catch { /* géoloc optionnelle */ }

    const { data: { user } } = await supabase.auth.getUser()
    const today = new Date().toISOString().split('T')[0]

    // Trouver intervention planifiée du jour
    const { data: inter } = await supabase
      .from('interventions')
      .select('id,statut')
      .eq('agent_id', user!.id)
      .eq('residence_id', res.id)
      .eq('date_prevue', today)
      .in('statut', ['planifiee', 'en_cours'])
      .order('heure_debut_prevue')
      .limit(1)
      .single()

    if (!inter) { setError('Aucune intervention planifiée pour cette résidence aujourd\'hui.'); setLoading(false); return }

    if (inter.statut === 'planifiee') {
      // Démarrer l'intervention
      await supabase.from('interventions').update({
        statut: 'en_cours',
        heure_scan: new Date().toISOString(),
        geoloc_lat: lat,
        geoloc_lng: lng,
      }).eq('id', inter.id)

      // Copier les tâches template filtrées sur le jour de la semaine
      const joursSemaine = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
      const jourCourant  = joursSemaine[new Date().getDay()]

      const { data: taches } = await supabase
        .from('taches_template')
        .select('*, zones_residence(nom)')
        .eq('residence_id', res.id)
        .order('ordre')

      const tachesDuJour = (taches ?? []).filter(t =>
        t.jours_semaine.length === 0 || t.jours_semaine.includes(jourCourant)
      )

      if (tachesDuJour.length > 0) {
        await supabase.from('taches_intervention').insert(
          tachesDuJour.map(t => ({
            intervention_id:  inter.id,
            tache_template_id: t.id,
            libelle:          t.libelle,
            zone_nom:         (t as { zones_residence?: { nom: string } }).zones_residence?.nom ?? null,
          }))
        )
      }
    }

    router.push(`/agent/intervention/${inter.id}`)
  }, [loading, router])

  async function handleManual(e: React.FormEvent) {
    e.preventDefault()
    if (!manual.trim()) return
    await handleToken(manual.trim())
  }

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

      {/* Zone caméra */}
      <div className="relative flex-1 flex items-center justify-center px-6 py-4">
        <div className="relative w-full max-w-xs aspect-square">
          <video ref={videoRef} autoPlay playsInline muted
            className="w-full h-full object-cover rounded-3xl bg-slate-800" />

          {ready && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-52 relative">
                {[['top-0 left-0','border-t-4 border-l-4 rounded-tl-2xl'],
                  ['top-0 right-0','border-t-4 border-r-4 rounded-tr-2xl'],
                  ['bottom-0 left-0','border-b-4 border-l-4 rounded-bl-2xl'],
                  ['bottom-0 right-0','border-b-4 border-r-4 rounded-br-2xl'],
                ].map(([pos, border]) => (
                  <div key={pos} className={`absolute w-10 h-10 ${pos} ${border} border-[#0BBFBF]`} />
                ))}
                <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-[#0BBFBF] animate-pulse opacity-70" />
              </div>
            </div>
          )}

          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-slate-400">
                <div className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
                <p className="text-sm">Initialisation…</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="mx-6 mb-4 p-3 bg-[#0BBFBF]/20 border border-[#0BBFBF]/40 rounded-2xl text-center text-[#0BBFBF] text-sm font-medium">
          Connexion en cours…
        </div>
      )}

      {error && (
        <div className="mx-6 mb-4 p-3 bg-red-900/40 border border-red-500/40 rounded-2xl text-center text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Saisie manuelle */}
      <div className="px-6 pb-10 space-y-3">
        <p className="text-slate-500 text-center text-xs">— ou entrez le code manuellement —</p>
        <form onSubmit={handleManual} className="flex gap-3">
          <input type="text" value={manual} onChange={e => setManual(e.target.value)}
            placeholder="Token QR de la résidence"
            className="flex-1 px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder:text-slate-500 text-base focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"/>
          <button type="submit"
            className="px-5 py-3.5 rounded-xl font-semibold text-white"
            style={{ background: '#0BBFBF' }}>
            OK
          </button>
        </form>
      </div>
    </div>
  )
}
