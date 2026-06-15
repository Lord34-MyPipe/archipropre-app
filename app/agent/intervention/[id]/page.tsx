'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { TacheIntervention, Intervention, Residence } from '@/lib/types'

type FullIntervention = Intervention & { residences: Residence }

export default function InterventionPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [intervention, setIntervention] = useState<FullIntervention | null>(null)
  const [taches, setTaches]   = useState<TacheIntervention[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: inter }, { data: t }] = await Promise.all([
      supabase.from('interventions').select('*, residences(*)').eq('id', params.id).single(),
      supabase.from('taches_intervention').select('*').eq('intervention_id', params.id).order('zone_nom').order('created_at'),
    ])
    setIntervention(inter as FullIntervention | null)
    setTaches(t ?? [])
    setLoading(false)
  }, [params.id])

  useEffect(() => { load() }, [load])

  async function handlePhoto(tacheId: string, file: File) {
    setUploading(tacheId)
    const supabase = createClient()
    const ts  = Date.now()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${params.id}/${tacheId}/${ts}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('photos-interventions').upload(path, file, { upsert: true })

    if (upErr) {
      alert("Erreur lors de l'upload : " + upErr.message)
      setUploading(null)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('photos-interventions').getPublicUrl(path)
    await supabase.from('taches_intervention').update({ photo_url: publicUrl }).eq('id', tacheId)
    setUploading(null)
    load()
  }

  async function handleDeletePhoto(tache: TacheIntervention) {
    const supabase = createClient()
    await supabase.from('taches_intervention').update({ photo_url: null, validee: false, heure_validation: null }).eq('id', tache.id)
    load()
  }

  async function toggleTache(tache: TacheIntervention) {
    if (!tache.photo_url && !tache.validee) {
      alert('📸 Prenez une photo avant de valider cette tâche.')
      return
    }
    const supabase = createClient()
    await supabase.from('taches_intervention').update({
      validee: !tache.validee,
      heure_validation: !tache.validee ? new Date().toISOString() : null,
    }).eq('id', tache.id)
    load()
  }

  async function handleFinaliser() {
    setFinalizing(true)
    setConfirming(false)
    const supabase = createClient()
    const now = new Date().toISOString()

    const heureFinPrevue = intervention?.heure_fin_prevue
    const disponible = heureFinPrevue
      ? new Date(now) < new Date(`${intervention?.date_prevue}T${heureFinPrevue}`)
      : false

    await supabase.from('interventions').update({
      statut: 'terminee',
      heure_fin: now,
      disponible_apres_fin: disponible,
    }).eq('id', params.id)

    setFinalizing(false)
    router.push(`/agent/rapport/${params.id}`)
  }

  const total    = taches.length
  const validees = taches.filter(t => t.validee).length
  const progres  = total > 0 ? Math.round((validees / total) * 100) : 0
  const toutValide = total > 0 && validees === total

  const groupes: Record<string, TacheIntervention[]> = {}
  for (const t of taches) {
    const z = t.zone_nom ?? 'Général'
    groupes[z] = [...(groupes[z] ?? []), t]
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#1A5FA8] border-t-transparent rounded-full animate-spin mx-auto"/>
        <div className="space-y-2 px-8">
          {[1,2,3].map(i => (
            <div key={i} className="h-16 bg-slate-200 rounded-2xl animate-pulse"/>
          ))}
        </div>
      </div>
    </div>
  )

  if (!intervention) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-4xl mb-3">❌</p>
        <p className="text-slate-500">Intervention introuvable.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header sticky */}
      <div className="px-5 pt-10 pb-5 sticky top-0 z-10"
        style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-blue-200 text-sm mb-3 active:opacity-70">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          Retour
        </button>
        <h1 className="text-xl font-bold text-white truncate">
          {intervention.residences?.nom}
        </h1>
        <p className="text-blue-200 text-sm truncate mt-0.5">
          {intervention.residences?.adresse}
        </p>

        {/* Barre de progression */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-blue-200 mb-1.5">
            <span>{validees}/{total} tâche{total > 1 ? 's' : ''} validée{validees > 1 ? 's' : ''}</span>
            <span className="font-semibold">{progres}%</span>
          </div>
          <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progres}%`,
                background: progres === 100 ? '#12B76A' : '#0BBFBF',
              }}
            />
          </div>
        </div>
      </div>

      {/* Tâches groupées par zone */}
      <div className="px-5 py-4 space-y-6 pb-36">
        {Object.entries(groupes).map(([zone, zoneTaches]) => (
          <div key={zone}>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pl-1">{zone}</h2>
            <div className="space-y-2">
              {zoneTaches.map(tache => (
                <div key={tache.id}
                  className={`bg-white rounded-2xl border-2 transition-all ${
                    tache.validee ? 'border-green-200 bg-green-50/30' : 'border-slate-100'
                  }`}>
                  <div className="p-4 flex items-center gap-3">
                    {/* Checkbox */}
                    <button onClick={() => toggleTache(tache)}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        tache.validee
                          ? 'bg-green-500 border-green-500 text-white'
                          : tache.photo_url
                          ? 'border-[#1A5FA8] hover:bg-[#1A5FA8]/10'
                          : 'border-slate-300 cursor-not-allowed opacity-50'
                      }`}>
                      {tache.validee && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        </svg>
                      )}
                    </button>

                    {/* Libellé */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium text-sm ${tache.validee ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {tache.libelle}
                      </p>
                      {tache.heure_validation && (
                        <p className="text-xs text-green-600 mt-0.5">
                          ✓ Validée à {new Date(tache.heure_validation).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
                        </p>
                      )}
                      {!tache.photo_url && !tache.validee && (
                        <p className="text-xs text-amber-600 mt-0.5">📸 Photo requise</p>
                      )}
                    </div>

                    {/* Photo */}
                    <div className="shrink-0 relative">
                      {uploading === tache.id ? (
                        <div className="w-14 h-14 rounded-xl bg-slate-100 border-2 border-dashed border-[#0BBFBF] flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-[#0BBFBF] border-t-transparent rounded-full animate-spin"/>
                        </div>
                      ) : tache.photo_url ? (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={tache.photo_url} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-green-400"/>
                          {!tache.validee && (
                            <button onClick={() => handleDeletePhoto(tache)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow">
                              ×
                            </button>
                          )}
                        </div>
                      ) : (
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" capture="environment" className="sr-only"
                            onChange={e => e.target.files?.[0] && handlePhoto(tache.id, e.target.files[0])}/>
                          <div className="w-14 h-14 rounded-xl border-2 border-dashed border-slate-300 hover:border-[#0BBFBF] flex flex-col items-center justify-center gap-0.5 transition-colors">
                            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/>
                            </svg>
                            <span className="text-[9px] text-slate-400">Photo</span>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {total === 0 && (
          <div className="text-center py-14 text-slate-400">
            <p className="text-4xl mb-3">📋</p>
            <p>Aucune tâche pour cette intervention.</p>
          </div>
        )}
      </div>

      {/* Bouton valider rapport */}
      {toutValide && !finalizing && (
        <div className="fixed bottom-20 left-0 right-0 max-w-lg mx-auto px-5 z-20">
          <button onClick={() => setConfirming(true)}
            className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-xl shadow-green-500/30 active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
            ✅ Valider le rapport final
          </button>
        </div>
      )}
      {finalizing && (
        <div className="fixed bottom-20 left-0 right-0 max-w-lg mx-auto px-5 z-20">
          <div className="w-full h-14 rounded-2xl bg-green-500 flex items-center justify-center gap-2 text-white font-bold">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
            Finalisation…
          </div>
        </div>
      )}

      {/* Modal confirmation */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirming(false)}/>
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <p className="text-5xl mb-3">✅</p>
              <h3 className="text-lg font-bold text-slate-800">Valider l'intervention ?</h3>
              <p className="text-sm text-slate-500 mt-2">
                Cette action est <strong>irréversible</strong>. L'intervention sera marquée comme terminée et le rapport envoyé au manager.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirming(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors">
                Annuler
              </button>
              <button onClick={handleFinaliser}
                className="flex-[2] py-3 rounded-xl text-white font-bold text-sm shadow-lg"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
