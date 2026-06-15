'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Intervention, Residence, TacheIntervention } from '@/lib/types'

export default function RapportPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [inter, setInter]   = useState<(Intervention & { residences: Residence }) | null>(null)
  const [taches, setTaches] = useState<TacheIntervention[]>([])
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone]     = useState(false)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('interventions').select('*, residences(*)').eq('id', params.id).single(),
      supabase.from('taches_intervention').select('*').eq('intervention_id', params.id),
    ]).then(([{ data: i }, { data: t }]) => {
      setInter(i as (Intervention & { residences: Residence }) | null)
      setTaches(t ?? [])
    })
  }, [params.id])

  async function handleEnvoyer() {
    setSending(true)
    const supabase = createClient()
    const now = new Date().toISOString()

    // Calculer si l'agent finit avant l'heure prévue
    const heureFin    = now
    const heureFinPrevue = inter?.heure_fin_prevue
    const disponible  = heureFinPrevue
      ? new Date(now).getTime() < new Date(`${inter?.date_prevue}T${heureFinPrevue}`).getTime()
      : false

    await supabase.from('interventions').update({
      statut: 'terminee',
      heure_fin: heureFin,
      disponible_apres_fin: disponible,
    }).eq('id', params.id)

    setSending(false)
    setDone(true)
    setTimeout(() => router.push('/agent/dashboard'), 2000)
  }

  if (!inter) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#1A5FA8] border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const nbPhotos   = taches.filter(t => t.photo_url).length
  const nbTaches   = taches.length
  const heureDebut = inter.heure_scan ? new Date(inter.heure_scan) : null
  const dureeMin   = heureDebut
    ? Math.round((Date.now() - heureDebut.getTime()) / 60000)
    : null
  const photos     = taches.filter(t => t.photo_url)

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 fade-up">
      <div className="text-7xl mb-4">✅</div>
      <h2 className="text-2xl font-bold text-slate-800">Rapport envoyé !</h2>
      <p className="text-slate-500 mt-2">Retour au tableau de bord…</p>
    </div>
  )

  return (
    <div className="fade-up min-h-screen bg-slate-50">
      {/* Header */}
      <div className="px-5 pt-10 pb-6" style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
        <button onClick={() => router.back()} className="flex items-center gap-2 text-blue-200 text-sm mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          Retour aux tâches
        </button>
        <h1 className="text-xl font-bold text-white">Rapport final</h1>
        <p className="text-blue-200 text-sm mt-0.5">
          {(inter as { residences?: { nom?: string } }).residences?.nom}
        </p>
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Résumé */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Résumé de l'intervention</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { n: dureeMin !== null ? `${dureeMin} min` : '—', label: 'Durée', emoji: '⏱️' },
              { n: `${nbTaches}`, label: 'Tâches', emoji: '✅' },
              { n: `${nbPhotos}`, label: 'Photos', emoji: '📸' },
            ].map(s => (
              <div key={s.label} className="text-center bg-slate-50 rounded-xl py-3">
                <p className="text-xl mb-1">{s.emoji}</p>
                <p className="text-xl font-bold text-[#1A5FA8]">{s.n}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Galerie photos */}
        {photos.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-3">Photos ({photos.length})</h2>
            <div className="grid grid-cols-3 gap-2">
              {photos.map(t => (
                <div key={t.id} className="aspect-square rounded-xl overflow-hidden bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.photo_url!} alt={t.libelle} className="w-full h-full object-cover"/>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commentaire */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Commentaire (optionnel)</h2>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            rows={3} placeholder="Problème constaté, remarque particulière…"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"/>
        </div>

        {/* Bouton envoyer */}
        <button onClick={handleEnvoyer} disabled={sending}
          className="w-full h-14 rounded-2xl text-white font-bold text-base active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg"
          style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
          {sending ? 'Envoi en cours…' : '📤 Envoyer au manager'}
        </button>

        <div className="h-4"/>
      </div>
    </div>
  )
}
