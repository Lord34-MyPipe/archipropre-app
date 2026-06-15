'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Intervention, Residence, TacheIntervention } from '@/lib/types'

type FullIntervention = Intervention & { residences: Residence }

export default function RapportPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [inter, setInter]     = useState<FullIntervention | null>(null)
  const [taches, setTaches]   = useState<TacheIntervention[]>([])
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone]       = useState(false)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('interventions').select('*, residences(*)').eq('id', params.id).single(),
      supabase.from('taches_intervention').select('*').eq('intervention_id', params.id).order('heure_validation'),
    ]).then(([{ data: i }, { data: t }]) => {
      setInter(i as FullIntervention | null)
      setTaches(t ?? [])
    })
  }, [params.id])

  async function handleEnvoyer() {
    if (!inter) return
    setSending(true)
    const supabase = createClient()

    // Notifier le manager via la table alertes
    const managerId = inter.residences?.manager_id
    if (managerId) {
      await supabase.from('alertes').insert({
        intervention_id: params.id,
        type: 'rapport_soumis',
        message: `Rapport soumis pour ${inter.residences?.nom ?? 'une résidence'}${comment ? ' : ' + comment : ''}`,
        destinataire_id: managerId,
        lue: false,
      })
    }

    setSending(false)
    setDone(true)
    setTimeout(() => router.push('/agent/dashboard'), 2000)
  }

  if (!inter) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="space-y-3 w-full px-6">
        <div className="h-24 bg-slate-200 rounded-2xl animate-pulse"/>
        <div className="h-40 bg-slate-200 rounded-2xl animate-pulse"/>
        <div className="h-32 bg-slate-200 rounded-2xl animate-pulse"/>
      </div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
      <div className="text-7xl">✅</div>
      <h2 className="text-2xl font-bold text-slate-800">Rapport envoyé !</h2>
      <p className="text-slate-500">Retour au tableau de bord…</p>
    </div>
  )

  const nbPhotos  = taches.filter(t => t.photo_url).length
  const nbTaches  = taches.length
  const photos    = taches.filter(t => t.photo_url)
  const validees  = taches.filter(t => t.validee).sort((a, b) =>
    (a.heure_validation ?? '').localeCompare(b.heure_validation ?? '')
  )

  const heureDebut = inter.heure_scan ? new Date(inter.heure_scan) : null
  const heureFin   = inter.heure_fin  ? new Date(inter.heure_fin)  : null
  const dureeMin   = heureDebut && heureFin
    ? Math.round((heureFin.getTime() - heureDebut.getTime()) / 60000)
    : null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="px-5 pt-10 pb-6" style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
        <button onClick={() => router.back()} className="flex items-center gap-2 text-blue-200 text-sm mb-4 active:opacity-70">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          Retour aux tâches
        </button>
        <h1 className="text-xl font-bold text-white">Rapport final</h1>
        <p className="text-blue-200 text-sm mt-0.5 truncate">{inter.residences?.nom}</p>
        {inter.disponible_apres_fin && (
          <span className="mt-2 inline-block px-3 py-1 bg-green-500/20 text-green-300 text-xs rounded-full font-medium">
            ✓ Terminé en avance — disponible
          </span>
        )}
      </div>

      <div className="px-5 py-5 space-y-4 pb-32">
        {/* Résumé */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Résumé</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { n: dureeMin !== null ? `${dureeMin} min` : '—', label: 'Durée', emoji: '⏱️' },
              { n: String(nbTaches), label: 'Tâches', emoji: '✅' },
              { n: String(nbPhotos), label: 'Photos', emoji: '📸' },
            ].map(s => (
              <div key={s.label} className="text-center bg-slate-50 rounded-xl py-3">
                <p className="text-xl mb-1">{s.emoji}</p>
                <p className="text-xl font-bold text-[#1A5FA8]">{s.n}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline des tâches validées */}
        {validees.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Chronologie des tâches</h2>
            <div className="relative pl-5">
              {/* Ligne verticale */}
              <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-slate-100"/>
              <div className="space-y-4">
                {validees.map((t, i) => (
                  <div key={t.id} className="relative flex items-start gap-3">
                    <div className={`absolute -left-5 top-1 w-3 h-3 rounded-full border-2 border-white ${
                      i === validees.length - 1 ? 'bg-green-500' : 'bg-[#0BBFBF]'
                    }`}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{t.libelle}</p>
                      {t.zone_nom && <p className="text-xs text-slate-400 mt-0.5">{t.zone_nom}</p>}
                    </div>
                    {t.heure_validation && (
                      <span className="text-xs text-slate-400 shrink-0 tabular-nums">
                        {new Date(t.heure_validation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Galerie photos */}
        {photos.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-3">Photos ({photos.length})</h2>
            <div className="grid grid-cols-3 gap-2">
              {photos.map(t => (
                <div key={t.id} className="aspect-square rounded-xl overflow-hidden bg-slate-100 relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.photo_url!} alt={t.libelle} className="w-full h-full object-cover"/>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
                    <p className="text-[9px] text-white font-medium p-1.5 opacity-0 group-hover:opacity-100 transition-opacity truncate w-full">
                      {t.libelle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commentaire */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Commentaire</h2>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={3}
            placeholder="Problème constaté, remarque particulière pour le manager…"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition"
          />
        </div>

        {/* Bouton envoyer */}
        <button onClick={handleEnvoyer} disabled={sending}
          className="w-full h-14 rounded-2xl text-white font-bold text-base active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg"
          style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
          {sending
            ? <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                Envoi en cours…
              </span>
            : '📤 Envoyer au manager'}
        </button>

        <div className="h-4"/>
      </div>
    </div>
  )
}
