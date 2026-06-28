'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { TacheIntervention, Intervention, Residence } from '@/lib/types'

type FullIntervention = Intervention & {
  residences: Residence
  contrats_residences: { libelle: string | null } | null
}

interface PhotoZoneItem {
  id: string
  path: string
  signedUrl: string
}

export default function InterventionPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [intervention,   setIntervention]   = useState<FullIntervention | null>(null)
  const [taches,         setTaches]         = useState<TacheIntervention[]>([])
  const [photosZone,     setPhotosZone]     = useState<Record<string, PhotoZoneItem[]>>({})
  const [loading,        setLoading]        = useState(true)
  const [uploadingZone,  setUploadingZone]  = useState<string | null>(null)
  const [confirming,     setConfirming]     = useState(false)
  const [finalizing,     setFinalizing]     = useState(false)
  const [expandedComment, setExpandedComment] = useState<string | null>(null)
  const [commentDraft,   setCommentDraft]   = useState<Record<string, string>>({})

  // ── Chargement ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const supabase = createClient()
    const [{ data: inter }, { data: t }, { data: pz }] = await Promise.all([
      supabase.from('interventions').select('*, residences(*), contrats_residences(libelle)').eq('id', params.id).single(),
      supabase.from('taches_intervention').select('*').eq('intervention_id', params.id)
        .order('zone_nom').order('created_at'),
      supabase.from('photos_zone').select('id, zone_nom, photo_url').eq('intervention_id', params.id),
    ])
    setIntervention(inter as FullIntervention | null)
    setTaches(t ?? [])

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

  // ── Enregistrer clôture de zone ───────────────────────────────────────────────
  async function cloturerZone(zone: string) {
    const supabase = createClient()
    await supabase.from('zones_intervention').upsert({
      intervention_id: params.id,
      zone_nom:        zone,
      heure_cloture:   new Date().toISOString(),
    }, { onConflict: 'intervention_id,zone_nom' })
  }

  // ── Changer statut d'une tâche (optimiste) ────────────────────────────────────
  async function setStatutTache(
    tache: TacheIntervention,
    nouveau: 'realisee' | 'non_realisee' | 'a_faire'
  ) {
    const supabase = createClient()
    const now = nouveau !== 'a_faire' ? new Date().toISOString() : null

    const newTaches = taches.map(t =>
      t.id === tache.id ? { ...t, statut_tache: nouveau, heure_validation: now } : t
    )
    setTaches(newTaches)

    await supabase.from('taches_intervention')
      .update({ statut_tache: nouveau, heure_validation: now })
      .eq('id', tache.id)

    // Clôturer la zone si elle devient complète
    const zone = tache.zone_nom ?? 'Général'
    const zoneTaches = newTaches.filter(t => (t.zone_nom ?? 'Général') === zone)
    const allTreated = zoneTaches.every(t => t.statut_tache === 'realisee' || t.statut_tache === 'non_realisee')
    if (allTreated && (photosZone[zone]?.length ?? 0) > 0) {
      await cloturerZone(zone)
    }
  }

  // ── Valider toute une zone d'un coup (→ 'realisee') ──────────────────────────
  async function validerZone(zone: string) {
    const supabase = createClient()
    const now = new Date().toISOString()

    const newTaches = taches.map(t =>
      (t.zone_nom ?? 'Général') === zone && t.statut_tache === 'a_faire'
        ? { ...t, statut_tache: 'realisee' as const, heure_validation: now }
        : t
    )
    setTaches(newTaches)

    const query = supabase.from('taches_intervention')
      .update({ statut_tache: 'realisee', heure_validation: now })
      .eq('intervention_id', params.id)
      .eq('statut_tache', 'a_faire')

    if (zone === 'Général') {
      await query.is('zone_nom', null)
    } else {
      await query.eq('zone_nom', zone)
    }

    const allTreated = newTaches
      .filter(t => (t.zone_nom ?? 'Général') === zone)
      .every(t => t.statut_tache === 'realisee' || t.statut_tache === 'non_realisee')
    if (allTreated && (photosZone[zone]?.length ?? 0) > 0) {
      await cloturerZone(zone)
    }
  }

  // ── Sauvegarder commentaire d'une tâche ───────────────────────────────────────
  async function saveCommentaire(tacheId: string, texte: string) {
    const supabase = createClient()
    setTaches(prev => prev.map(t => t.id === tacheId ? { ...t, commentaire: texte || null } : t))
    await supabase.from('taches_intervention').update({ commentaire: texte || null }).eq('id', tacheId)
    setExpandedComment(null)
  }

  // ── Upload photo pour une zone ─────────────────────────────────────────────────
  async function handlePhotoZone(zoneNom: string, file: File) {
    setUploadingZone(zoneNom)
    const supabase = createClient()
    const ts       = Date.now()
    const ext      = file.name.split('.').pop() ?? 'jpg'
    const safeName = zoneNom.replace(/[^a-zA-Z0-9_-]/g, '_')
    const path     = `${params.id}/${safeName}/${ts}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('photos-interventions')
      .upload(path, file, { upsert: false })

    if (upErr) {
      alert('Erreur upload : ' + upErr.message)
      setUploadingZone(null)
      return
    }

    const { data: inserted } = await supabase
      .from('photos_zone')
      .insert({ intervention_id: params.id, zone_nom: zoneNom, photo_url: path })
      .select('id')
      .single()

    const { data: signed } = await supabase.storage
      .from('photos-interventions')
      .createSignedUrl(path, 3600)

    if (inserted && signed?.signedUrl) {
      const newPhotoList = [
        ...(photosZone[zoneNom] ?? []),
        { id: inserted.id as string, path, signedUrl: signed.signedUrl },
      ]
      setPhotosZone(prev => ({ ...prev, [zoneNom]: newPhotoList }))

      // Clôturer si zone devient complète
      const zoneTaches = taches.filter(t => (t.zone_nom ?? 'Général') === zoneNom)
      const allTreated = zoneTaches.every(t => t.statut_tache === 'realisee' || t.statut_tache === 'non_realisee')
      if (allTreated && newPhotoList.length > 0) {
        await cloturerZone(zoneNom)
      }
    }
    setUploadingZone(null)
  }

  // ── Suppression photo zone ─────────────────────────────────────────────────────
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

  // ── Finaliser l'intervention ───────────────────────────────────────────────────
  async function handleFinaliser() {
    setFinalizing(true)
    setConfirming(false)
    const supabase = createClient()
    const now      = new Date().toISOString()
    const disponible = intervention?.heure_fin_prevue
      ? new Date(now) < new Date(`${intervention.date_prevue}T${intervention.heure_fin_prevue}`)
      : false
    await supabase.from('interventions').update({
      statut:              'terminee',
      heure_fin:           now,
      disponible_apres_fin: disponible,
    }).eq('id', params.id)
    setFinalizing(false)
    router.push(`/agent/intervention/${params.id}/controle-final`)
  }

  // ── Calculs dérivés ───────────────────────────────────────────────────────────
  const groupes: Record<string, TacheIntervention[]> = {}
  for (const t of taches) {
    const z = t.zone_nom ?? 'Général'
    groupes[z] = [...(groupes[z] ?? []), t]
  }
  const zones = Object.keys(groupes)

  function estTraitee(t: TacheIntervention): boolean {
    return t.statut_tache === 'realisee' || t.statut_tache === 'non_realisee'
  }

  function zoneComplete(zone: string): boolean {
    const zt = groupes[zone] ?? []
    return zt.length > 0 && zt.every(t => estTraitee(t)) && (photosZone[zone]?.length ?? 0) > 0
  }

  const zonesCompletes      = zones.filter(z => zoneComplete(z)).length
  const toutesZonesComplete = zones.length > 0 && zonesCompletes === zones.length
  const peutFinaliser       = zones.length > 0 && zonesCompletes >= 1
  const totalTaches         = taches.length
  const nbTraitees          = taches.filter(t => estTraitee(t)).length
  const progres             = totalTaches > 0 ? Math.round((nbTraitees / totalTaches) * 100) : 0

  // ── Rendu chargement ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#1A5FA8] border-t-transparent rounded-full animate-spin mx-auto"/>
        <div className="space-y-2 px-8">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-200 rounded-2xl animate-pulse"/>)}
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

  // ── Rendu principal ────────────────────────────────────────────────────────────
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
        {intervention.contrats_residences?.libelle && (
          <p className="text-[#0BBFBF] text-sm font-semibold truncate mt-0.5">{intervention.contrats_residences.libelle}</p>
        )}
        <p className="text-blue-200 text-sm truncate mt-0.5">{intervention.residences?.adresse}</p>

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
            toutesZonesComplete ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-blue-200'
          }`}>
            {zonesCompletes}/{zones.length} zone{zones.length > 1 ? 's' : ''} complète{zones.length > 1 ? 's' : ''}
          </div>
          <span className="text-blue-200 text-xs">{nbTraitees}/{totalTaches} tâches traitées</span>
        </div>

        <div className="mt-3">
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progres}%`, background: progres === 100 ? '#12B76A' : '#0BBFBF' }}
            />
          </div>
        </div>
      </div>

      {/* Zones */}
      <div className="px-5 py-4 space-y-4 pb-36">
        {zones.map(zone => {
          const zoneTaches   = groupes[zone]
          const zonePhotos   = photosZone[zone] ?? []
          const complete     = zoneComplete(zone)
          const toutesTraitees = zoneTaches.every(t => estTraitee(t))
          const aDesAfaire   = zoneTaches.some(t => t.statut_tache === 'a_faire')

          return (
            <div
              key={zone}
              className={`rounded-2xl border-2 overflow-hidden transition-all ${
                complete ? 'border-green-200' : 'border-slate-200'
              }`}
            >
              {/* En-tête de zone */}
              <div className={`px-4 py-3.5 flex items-center justify-between gap-3 ${
                complete ? 'bg-green-50' : 'bg-white'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  {complete ? (
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                      </svg>
                    </div>
                  ) : (
                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 ${
                      toutesTraitees ? 'border-amber-400' : 'border-slate-300'
                    }`}/>
                  )}
                  <h2 className="font-bold text-slate-800 truncate">{zone}</h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {complete ? (
                    <span className="text-xs text-green-600 font-semibold">✓ Complète</span>
                  ) : toutesTraitees && zonePhotos.length === 0 ? (
                    <span className="text-xs text-amber-600 font-semibold">📸 Photo requise</span>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {zoneTaches.filter(t => estTraitee(t)).length}/{zoneTaches.length}
                    </span>
                  )}

                  {/* Bouton "Tout valider" — visible si ≥1 tâche a_faire et zone non complète */}
                  {!complete && aDesAfaire && (
                    <button
                      onClick={() => validerZone(zone)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white active:opacity-80"
                      style={{ background: '#0A2E5A' }}
                    >
                      Tout valider
                    </button>
                  )}
                </div>
              </div>

              {/* Liste des tâches */}
              <div className="bg-white divide-y divide-slate-50">
                {zoneTaches.map(tache => {
                  const traite      = estTraitee(tache)
                  const commentOpen = expandedComment === tache.id
                  const draft       = commentDraft[tache.id] ?? tache.commentaire ?? ''

                  return (
                    <div key={tache.id}>
                      {/* Ligne principale */}
                      <div className="px-4 pt-4 pb-2 flex items-start gap-3">
                        {/* Icône statut */}
                        <div className={`w-6 h-6 rounded-full shrink-0 mt-0.5 flex items-center justify-center ${
                          tache.statut_tache === 'realisee'
                            ? 'bg-green-500'
                            : tache.statut_tache === 'non_realisee'
                              ? 'bg-red-400'
                              : 'border-2 border-slate-300'
                        }`}>
                          {tache.statut_tache === 'realisee' && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                            </svg>
                          )}
                          {tache.statut_tache === 'non_realisee' && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          )}
                        </div>

                        {/* Libellé */}
                        <span className={`flex-1 text-sm leading-snug ${
                          tache.statut_tache === 'realisee'
                            ? 'line-through text-slate-400'
                            : tache.statut_tache === 'non_realisee'
                              ? 'text-slate-400'
                              : 'text-slate-800 font-medium'
                        }`}>
                          {tache.libelle}
                        </span>

                        {/* Bouton commentaire */}
                        <button
                          onClick={() => {
                            setExpandedComment(commentOpen ? null : tache.id)
                            if (!commentOpen) setCommentDraft(p => ({ ...p, [tache.id]: tache.commentaire ?? '' }))
                          }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base transition-colors ${
                            tache.commentaire
                              ? 'bg-amber-100 text-amber-600'
                              : 'text-slate-300 active:bg-slate-100'
                          }`}
                          title="Commentaire"
                        >
                          💬
                        </button>
                      </div>

                      {/* Boutons action (tâche non traitée) */}
                      {tache.statut_tache === 'a_faire' && (
                        <div className="px-4 pb-4 flex gap-2">
                          <button
                            onClick={() => setStatutTache(tache, 'realisee')}
                            className="flex-1 py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-semibold border border-green-200 active:bg-green-100 transition-colors"
                          >
                            ✓ Réalisé
                          </button>
                          <button
                            onClick={() => setStatutTache(tache, 'non_realisee')}
                            className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold border border-red-200 active:bg-red-100 transition-colors"
                          >
                            ✗ Non réalisé
                          </button>
                        </div>
                      )}

                      {/* Badge statut + heure + annuler (tâche traitée) */}
                      {traite && (
                        <div className="px-4 pb-3 flex items-center gap-2">
                          {tache.statut_tache === 'realisee' ? (
                            <span className="text-xs text-green-600 font-semibold">✓ Réalisé</span>
                          ) : (
                            <span className="text-xs text-red-500 font-semibold">✗ Non réalisé</span>
                          )}
                          {tache.heure_validation && (
                            <span className="text-xs text-slate-400 tabular-nums">
                              {new Date(tache.heure_validation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          {!complete && (
                            <button
                              onClick={() => setStatutTache(tache, 'a_faire')}
                              className="ml-auto text-xs text-slate-400 underline active:opacity-70"
                            >
                              Annuler
                            </button>
                          )}
                        </div>
                      )}

                      {/* Commentaire affiché (si non ouvert) */}
                      {!commentOpen && tache.commentaire && (
                        <div className="px-4 pb-3 ml-9">
                          <p className="text-xs text-amber-800 bg-amber-50 rounded-xl px-3 py-2 italic border border-amber-100">
                            {tache.commentaire}
                          </p>
                        </div>
                      )}

                      {/* Éditeur commentaire inline */}
                      {commentOpen && (
                        <div className="px-4 pb-4">
                          <textarea
                            value={draft}
                            onChange={e => setCommentDraft(p => ({ ...p, [tache.id]: e.target.value }))}
                            rows={2}
                            placeholder="Ajouter un commentaire (problème, remarque…)"
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent"
                            autoFocus
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => setExpandedComment(null)}
                              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium active:opacity-70"
                            >
                              Annuler
                            </button>
                            <button
                              onClick={() => saveCommentaire(tache.id, draft)}
                              className="flex-[2] py-2.5 rounded-xl text-white text-sm font-semibold active:opacity-90"
                              style={{ background: '#0BBFBF' }}
                            >
                              Enregistrer
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Section photos de zone */}
              <div className="bg-slate-50 px-4 pt-3 pb-4 border-t border-slate-100">
                {zonePhotos.length > 0 && (
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {zonePhotos.map(photo => (
                      <div key={photo.id} className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.signedUrl} alt="Photo zone" className="w-full h-full object-cover"/>
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
                        toutesTraitees && zonePhotos.length === 0
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

      {/* Bouton valider rapport */}
      {peutFinaliser && !finalizing && (
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

      {/* Modal confirmation */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirming(false)}/>
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <p className="text-5xl mb-3">✅</p>
              <h3 className="text-lg font-bold text-slate-800">Valider l'intervention ?</h3>
              <p className="text-sm text-slate-500 mt-2">
                Cette action est <strong>irréversible</strong>. L'intervention sera marquée comme terminée.
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
