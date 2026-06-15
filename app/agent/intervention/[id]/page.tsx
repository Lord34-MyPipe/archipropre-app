'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { TacheIntervention, Intervention, Residence } from '@/lib/types'

type TacheWithZone = TacheIntervention

export default function InterventionPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [intervention, setIntervention] = useState<(Intervention & { residences: Residence }) | null>(null)
  const [taches, setTaches]   = useState<TacheWithZone[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: inter }, { data: t }] = await Promise.all([
      supabase.from('interventions').select('*, residences(*)').eq('id', params.id).single(),
      supabase.from('taches_intervention').select('*').eq('intervention_id', params.id).order('zone_nom,created_at'),
    ])
    setIntervention(inter as (Intervention & { residences: Residence }) | null)
    setTaches(t ?? [])
    setLoading(false)
  }, [params.id])

  useEffect(() => { load() }, [load])

  async function handlePhoto(tacheId: string, file: File) {
    setUploading(tacheId)
    const supabase = createClient()
    const ext  = file.name.split('.').pop()
    const path = `${params.id}/${tacheId}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('photos-interventions').upload(path, file, { upsert: true })

    if (upErr) { alert('Erreur upload : ' + upErr.message); setUploading(null); return }

    const { data: { publicUrl } } = supabase.storage.from('photos-interventions').getPublicUrl(path)

    await supabase.from('taches_intervention').update({ photo_url: publicUrl }).eq('id', tacheId)
    setUploading(null)
    load()
  }

  async function toggleTache(tache: TacheWithZone) {
    if (!tache.photo_url && !tache.validee) {
      alert('Prenez une photo avant de valider cette tâche.')
      return
    }
    const supabase = createClient()
    await supabase.from('taches_intervention').update({
      validee: !tache.validee,
      heure_validation: !tache.validee ? new Date().toISOString() : null,
    }).eq('id', tache.id)
    load()
  }

  const total    = taches.length
  const validees = taches.filter(t => t.validee).length
  const progres  = total > 0 ? Math.round((validees / total) * 100) : 0
  const toutValide = total > 0 && validees === total

  // Grouper par zone
  const groupes: Record<string, TacheWithZone[]> = {}
  for (const t of taches) {
    const z = t.zone_nom ?? 'Général'
    groupes[z] = [...(groupes[z] ?? []), t]
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#1A5FA8] border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-sm text-slate-500">Chargement…</p>
      </div>
    </div>
  )

  if (!intervention) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-500">Intervention introuvable.</p>
    </div>
  )

  return (
    <div className="fade-up min-h-screen bg-slate-50">
      {/* Header */}
      <div className="px-5 pt-10 pb-5 sticky top-0 z-10"
        style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-blue-200 text-sm mb-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          Retour
        </button>
        <h1 className="text-xl font-bold text-white truncate">
          {(intervention as { residences?: { nom?: string } }).residences?.nom}
        </h1>
        <p className="text-blue-200 text-sm truncate">
          {(intervention as { residences?: { adresse?: string } }).residences?.adresse}
        </p>

        {/* Barre de progression */}
        <div className="mt-4 mb-1">
          <div className="flex justify-between text-xs text-blue-200 mb-1.5">
            <span>{validees}/{total} tâches</span>
            <span>{progres}%</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-[#0BBFBF] rounded-full transition-all duration-500"
              style={{ width: `${progres}%` }}/>
          </div>
        </div>
      </div>

      {/* Tâches groupées par zone */}
      <div className="px-5 py-4 space-y-5 pb-32">
        {Object.entries(groupes).map(([zone, zoneTaches]) => (
          <div key={zone}>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 pl-1">{zone}</h2>
            <div className="space-y-2">
              {zoneTaches.map(tache => (
                <div key={tache.id}
                  className={`bg-white rounded-2xl border transition-all ${
                    tache.validee ? 'border-green-200 bg-green-50/50' : 'border-slate-100'
                  }`}>
                  <div className="p-4 flex items-center gap-3">
                    <button onClick={() => toggleTache(tache)}
                      className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        tache.validee
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-slate-300 hover:border-[#1A5FA8]'
                      }`}>
                      {tache.validee && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${tache.validee ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {tache.libelle}
                      </p>
                      {tache.heure_validation && (
                        <p className="text-xs text-green-600 mt-0.5">
                          Validée à {new Date(tache.heure_validation).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
                        </p>
                      )}
                    </div>

                    {/* Photo */}
                    <label className="shrink-0 cursor-pointer">
                      <input type="file" accept="image/*" capture="environment" className="sr-only"
                        onChange={e => e.target.files?.[0] && handlePhoto(tache.id, e.target.files[0])}/>
                      <div className={`w-12 h-12 rounded-xl overflow-hidden border-2 flex items-center justify-center transition-all ${
                        tache.photo_url
                          ? 'border-green-400'
                          : 'border-dashed border-slate-300 hover:border-[#0BBFBF]'
                      }`}>
                        {uploading === tache.id ? (
                          <div className="w-4 h-4 border-2 border-[#0BBFBF] border-t-transparent rounded-full animate-spin"/>
                        ) : tache.photo_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={tache.photo_url} alt="" className="w-full h-full object-cover"/>
                        ) : (
                          <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"/>
                          </svg>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {total === 0 && (
          <div className="text-center py-12 text-slate-400">
            <p className="text-4xl mb-3">📋</p>
            <p>Aucune tâche pour cette intervention.</p>
          </div>
        )}
      </div>

      {/* Bouton valider rapport */}
      {toutValide && (
        <div className="fixed bottom-20 left-0 right-0 max-w-lg mx-auto px-5">
          <button onClick={() => router.push(`/agent/rapport/${params.id}`)}
            className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-lg shadow-green-500/30 active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
            ✅ Valider le rapport final
          </button>
        </div>
      )}
    </div>
  )
}
