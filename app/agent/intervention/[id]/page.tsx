'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { TacheIntervention, Intervention, Residence } from '@/lib/types'

type FullIntervention = Intervention & { residences: Residence }

interface PhotoZoneItem {
  id: string
  path: string      // chemin stockage, ex: {intervention_id}/{zone}/{ts}.jpg
  signedUrl: string // URL signée 1h, générée au chargement/upload
}

export default function InterventionPage() {
  const params  = useParams<{ id: string }>()
  const router  = useRouter()

  const [intervention, setIntervention] = useState<FullIntervention | null>(null)
  const [taches,       setTaches]       = useState<TacheIntervention[]>([])
  const [photosZone,   setPhotosZone]   = useState<Record<string, PhotoZoneItem[]>>({})
  const [loading,      setLoading]      = useState(true)
  const [uploadingZone, setUploadingZone] = useState<string | null>(null)
  const [confirming,   setConfirming]   = useState(false)
  const [finalizing,   setFinalizing]   = useState(false)
  const [showZones,    setShowZones]    = useState(false)
  const [zonesDurees,  setZonesDurees]  = useState<Record<string, number>>({})
  const [savingZones,  setSavingZones]  = useState(false)

  // ── Chargement ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: inter }, { data: t }, { data: pz }] = await Promise.all([
      supabase.from('interventions').select('*, residences(*)').eq('id', params.id).single(),
      supabase.from('taches_intervention').select('*').eq('intervention_id', params.id)
        .order('zone_nom').order('created_at'),
      supabase.from('photos_zone').select('id, zone_nom, photo_url').eq('intervention_id', params.id),
    ])
    setIntervention(inter as FullIntervention | null)
    setTaches(t ?? [])

    // Génère les URLs signées pour toutes les photos existantes
    const signedItems = await Promise.all(
      (pz ?? []).map(async p => {
        const { data: signed } = await supabase.storage
          .from('photos-interventions')
          .createSignedUrl(p.photo_url, 3600)
        return {
          zone_nom: p.zone_nom as string,
          item: { id: p.id as string, path: p.photo_url as string, signedUrl: signed?.signedUrl ?? '' },
        }
      })
    )
    const grouped: Record<string, PhotoZoneItem[]> = {}
    signedItems.forEach(({ zone_nom, item }) => {
      if (!grouped[zone_nom]) grouped[zone_nom] = []
      grouped[zone_nom].push(item)
    })
    setPhotosZone(grouped)
    setLoading(false)
  }, [params.id])

  useEffect(() => { load() }, [load])

  // ── Upload photo pour une zone ────────────────────────────────────────────────
  async function handlePhotoZone(zoneNom: string, file: File) {
    setUploadingZone(zoneNom)
    const supabase = createClient()
    const ts      = Date.now()
    const ext     = file.name.split('.').pop() ?? 'jpg'
    const safeName = zoneNom.replace(/[^a-zA-Z0-9_-]/g, '_')
    const path    = `${params.id}/${safeName}/${ts}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('photos-interventions')
      .upload(path, file, { upsert: false })

    if (upErr) {
      alert('Erreur upload : ' + upErr.message)
      setUploadingZone(null)
      return
    }

    // Enregistre le chemin en base
    const { data: inserted } = await supabase
      .from('photos_zone')
      .insert({ intervention_id: params.id, zone_nom: zoneNom, photo_url: path })
      .select('id')
      .single()

    // URL signée pour affichage immédiat
    const { data: signed } = await supabase.storage
      .from('photos-interventions')
      .createSignedUrl(path, 3600)

    if (inserted && signed?.signedUrl) {
      setPhotosZone(prev => ({
        ...prev,
        [zoneNom]: [...(prev[zoneNom] ?? []), { id: inserted.id as string, path, signedUrl: signed.signedUrl }],
      }))
    }
    setUploadingZone(null)
  }

  // ── Suppression photo zone ────────────────────────────────────────────────────
  async function handleDeletePhotoZone(zoneNom: string, photo: PhotoZoneItem) {
    const supabase = createClient()
    await Promise.all([
      supabase.storage.from('photos-interventions').remove([photo.path]),
      supabase.from('photos_zone').delete().eq('id', photo.id),
    ])
    setPhotosZone(prev => ({
      ...prev,
      [zoneNom]: (prev[zoneNom] ?? []).filter(p => p.id !== photo.id),
    }))
  }

  // ── Cocher/décocher une tâche (mise à jour optimiste) ────────────────────────
  async function toggleTache(tache: TacheIntervention) {
    const supabase = createClient()
    const newVal   = !tache.validee
    const now      = newVal ? new Date().toISOString() : null
    // Optimiste : mise à jour locale immédiate
    setTaches(prev => prev.map(t =>
      t.id === tache.id ? { ...t, validee: newVal, heure_validation: now } : t
    ))
    await supabase.from('taches_intervention')
      .update({ validee: newVal, heure_validation: now })
      .eq('id', tache.id)
  }

  // ── Finaliser l'intervention ──────────────────────────────────────────────────
  async function handleFinaliser() {
    setFinalizing(true)
    setConfirming(false)
    const supabase = createClient()
    const now      = new Date().toISOString()
    const disponible = intervention?.heure_fin_prevue
      ? new Date(now) < new Date(`${intervention.date_prevue}T${intervention.heure_fin_prevue}`)
      : false
    await supabase.from('interventions').update({
      statut: 'terminee',
      heure_fin: now,
      disponible_apres_fin: disponible,
    }).eq('id', params.id)
    setFinalizing(false)
    setShowZones(true)
  }

  // ── Enregistrer les temps par zone ───────────────────────────────────────────
  async function handleSaveZones(skip = false) {
    if (!skip) {
      setSavingZones(true)
      const supabase = createClient()
      for (const [zone, minutes] of Object.entries(zonesDurees)) {
        if (minutes > 0) {
          await supabase.from('taches_intervention')
            .update({ duree_reelle_minutes: minutes })
            .eq('intervention_id', params.id)
            .eq('zone_nom', zone)
        }
      }
      setSavingZones(false)
    }
    router.push(`/agent/rapport/${params.id}`)
  }

  // ── Calculs dérivés ───────────────────────────────────────────────────────────
  const groupes: Record<string, TacheIntervention[]> = {}
  for (const t of taches) {
    const z = t.zone_nom ?? 'Général'
    groupes[z] = [...(groupes[z] ?? []), t]
  }
  const zones = Object.keys(groupes)

  // Zone complète = toutes tâches cochées + ≥ 1 photo
  function zoneComplete(zone: string): boolean {
    const zt = groupes[zone] ?? []
    return zt.length > 0 && zt.every(t => t.validee) && (photosZone[zone]?.length ?? 0) > 0
  }

  const zonesCompletes     = zones.filter(z => zoneComplete(z)).length
  const toutesZonesComplete = zones.length > 0 && zonesCompletes === zones.length

  const totalTaches = taches.length
  const nbValidees  = taches.filter(t => t.validee).length
  const progres     = totalTaches > 0 ? Math.round((nbValidees / totalTaches) * 100) : 0

  // ── Rendu chargement ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#1A5FA8] border-t-transparent rounded-full animate-spin mx-auto"/>
        <div className="space-y-2 px-8">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-200 rounded-2xl animate-pulse"/>)}
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

  // ── Rendu principal ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header sticky */}
      <div
        className="px-5 pt-10 pb-5 sticky top-0 z-10"
        style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-blue-200 text-sm mb-3 active:opacity-70"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          Retour
        </button>

        <h1 className="text-xl font-bold text-white truncate">{intervention.residences?.nom}</h1>
        <p className="text-blue-200 text-sm truncate mt-0.5">{intervention.residences?.adresse}</p>

        {/* Compteur zones + tâches */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
            toutesZonesComplete
              ? 'bg-green-500/20 text-green-300'
              : 'bg-white/10 text-blue-200'
          }`}>
            {zonesCompletes}/{zones.length} zone{zones.length > 1 ? 's' : ''} complète{zones.length > 1 ? 's' : ''}
          </div>
          <span className="text-blue-200 text-xs">{nbValidees}/{totalTaches} tâches cochées</span>
        </div>

        {/* Barre de progression des tâches */}
        <div className="mt-3">
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
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

      {/* Zones */}
      <div className="px-5 py-4 space-y-4 pb-36">
        {zones.map(zone => {
          const zoneTaches    = groupes[zone]
          const zonePhotos    = photosZone[zone] ?? []
          const complete      = zoneComplete(zone)
          const toutesCoches  = zoneTaches.every(t => t.validee)

          return (
            <div
              key={zone}
              className={`rounded-2xl border-2 overflow-hidden transition-all ${
                complete ? 'border-green-200' : 'border-slate-200'
              }`}
            >
              {/* En-tête de zone */}
              <div className={`px-4 py-3.5 flex items-center justify-between ${
                complete ? 'bg-green-50' : 'bg-white'
              }`}>
                <div className="flex items-center gap-2.5">
                  {complete ? (
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                      </svg>
                    </div>
                  ) : (
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                      toutesCoches ? 'border-amber-400' : 'border-slate-300'
                    }`}/>
                  )}
                  <h2 className="font-bold text-slate-800">{zone}</h2>
                </div>
                {complete ? (
                  <span className="text-xs text-green-600 font-semibold">✓ Complète</span>
                ) : toutesCoches && zonePhotos.length === 0 ? (
                  <span className="text-xs text-amber-600 font-semibold">📸 Photo requise</span>
                ) : (
                  <span className="text-xs text-slate-400">
                    {zoneTaches.filter(t => t.validee).length}/{zoneTaches.length}
                  </span>
                )}
              </div>

              {/* Liste des tâches — cases à cocher uniquement */}
              <div className="bg-white divide-y divide-slate-50">
                {zoneTaches.map(tache => (
                  <button
                    key={tache.id}
                    onClick={() => toggleTache(tache)}
                    className="w-full flex items-center gap-3 px-4 py-4 active:bg-slate-50 transition-colors text-left"
                  >
                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      tache.validee ? 'bg-green-500 border-green-500' : 'border-slate-300'
                    }`}>
                      {tache.validee && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm flex-1 leading-snug ${
                      tache.validee ? 'line-through text-slate-400' : 'text-slate-800 font-medium'
                    }`}>
                      {tache.libelle}
                    </span>
                    {tache.heure_validation && (
                      <span className="text-[10px] text-green-600 shrink-0 tabular-nums">
                        {new Date(tache.heure_validation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Section photo de zone */}
              <div className="bg-slate-50 px-4 pt-3 pb-4 border-t border-slate-100">

                {/* Miniatures existantes */}
                {zonePhotos.length > 0 && (
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {zonePhotos.map(photo => (
                      <div key={photo.id} className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.signedUrl}
                          alt="Photo zone"
                          className="w-full h-full object-cover"
                        />
                        {!complete && (
                          <button
                            onClick={() => handleDeletePhotoZone(zone, photo)}
                            className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow font-bold leading-none"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Bouton ajouter photo — masqué si zone complète */}
                {!complete && (
                  <label className="cursor-pointer block">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={e => e.target.files?.[0] && handlePhotoZone(zone, e.target.files[0])}
                    />
                    {uploadingZone === zone ? (
                      <div className="flex items-center gap-2.5 h-12 px-4 rounded-xl bg-[#0BBFBF]/10 text-[#0BBFBF] text-sm font-semibold">
                        <div className="w-4 h-4 border-2 border-[#0BBFBF] border-t-transparent rounded-full animate-spin"/>
                        Envoi en cours…
                      </div>
                    ) : (
                      <div className={`flex items-center gap-2.5 h-12 px-4 rounded-xl border-2 border-dashed text-sm font-medium transition-colors active:scale-[0.98] ${
                        toutesCoches && zonePhotos.length === 0
                          ? 'border-amber-400 text-amber-600 bg-amber-50'
                          : 'border-slate-300 text-slate-500 hover:border-[#0BBFBF] hover:text-[#0BBFBF]'
                      }`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/>
                        </svg>
                        {zonePhotos.length > 0 ? 'Ajouter une photo' : 'Prendre une photo pour valider cette zone'}
                      </div>
                    )}
                  </label>
                )}

                {complete && (
                  <p className="text-xs text-green-600 font-medium">
                    ✓ {zonePhotos.length} photo{zonePhotos.length > 1 ? 's' : ''} — zone validée
                  </p>
                )}
              </div>
            </div>
          )
        })}

        {zones.length === 0 && (
          <div className="text-center py-14 text-slate-400">
            <p className="text-4xl mb-3">📋</p>
            <p>Aucune tâche pour cette intervention.</p>
          </div>
        )}
      </div>

      {/* Bouton valider rapport — visible quand toutes zones complètes */}
      {toutesZonesComplete && !finalizing && (
        <div className="fixed bottom-20 left-0 right-0 max-w-lg mx-auto px-5 z-20">
          <button
            onClick={() => setConfirming(true)}
            className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-xl shadow-green-500/30 active:scale-[0.98] transition-all"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
          >
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

      {/* Écran saisie temps par zone */}
      {showZones && (
        <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto">
          <div
            className="px-5 pt-10 pb-5 sticky top-0 z-10"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
          >
            <p className="text-blue-200 text-xs mb-1 uppercase tracking-wider">Étape optionnelle</p>
            <h1 className="text-xl font-bold text-white">Temps passé par zone</h1>
            <p className="text-blue-200 text-sm mt-1">Ces données aident à calibrer les plannings futurs.</p>
          </div>
          <div className="px-5 py-6 space-y-6 pb-4">
            {zones.map(zone => {
              const selected = zonesDurees[zone] ?? 0
              return (
                <div key={zone}>
                  <p className="font-semibold text-slate-700 mb-3">{zone}</p>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 45, 60, 90, 120].map(min => {
                      const h = Math.floor(min / 60)
                      const m = min % 60
                      const label = min < 60 ? `${min}min` : m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`
                      const isSel = selected === min
                      return (
                        <button
                          key={min}
                          onClick={() => setZonesDurees(p => ({ ...p, [zone]: isSel ? 0 : min }))}
                          className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                            isSel ? 'bg-[#0A2E5A] text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {selected > 0 && (
                    <p className="text-xs text-[#0BBFBF] mt-2 font-medium">
                      ✓ {selected < 60 ? `${selected}min` : `${Math.floor(selected/60)}h${selected%60 > 0 ? String(selected%60).padStart(2,'0') : '00'}`} sélectionné
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <div className="px-5 pb-10 flex gap-3 sticky bottom-0 bg-slate-50 pt-3 border-t border-slate-100">
            <button
              onClick={() => handleSaveZones(true)}
              className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-medium text-sm active:opacity-70"
            >
              Passer
            </button>
            <button
              onClick={() => handleSaveZones(false)}
              disabled={savingZones}
              className="flex-[2] py-3.5 rounded-2xl text-white font-bold text-sm shadow-lg active:scale-[0.98] transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
            >
              {savingZones ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>
                  Enregistrement…
                </span>
              ) : 'Enregistrer les temps'}
            </button>
          </div>
        </div>
      )}

      {/* Modal confirmation clôture */}
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
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm active:opacity-70"
              >
                Annuler
              </button>
              <button
                onClick={handleFinaliser}
                className="flex-[2] py-3 rounded-xl text-white font-bold text-sm shadow-lg"
                style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
