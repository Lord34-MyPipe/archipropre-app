'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { TacheIntervention, Intervention, Residence } from '@/lib/types'
import { Building2, Camera, X, TriangleAlert, Check, Circle } from 'lucide-react'

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
  // Nb de bâtiments de la mission du jour (même résidence+contrat+date). >1 =
  // cet écran fait partie d'un niveau 1 (/agent/mission/[contratId]) : la
  // finalisation s'y trouve désormais (étape 9g), pas ici.
  const [nbBatimentsMission, setNbBatimentsMission] = useState(1)
  const [uploadingZone,  setUploadingZone]  = useState<string | null>(null)
  const [confirming,     setConfirming]     = useState(false)
  const [finalizing,     setFinalizing]     = useState(false)
  const [expandedComment, setExpandedComment] = useState<string | null>(null)
  const [commentDraft,   setCommentDraft]   = useState<Record<string, string>>({})
  // Panneau "?" — détail consultatif des tâches d'UNE zone (étape 9f, §7.3).
  // null = fermé. Purement UI : la validation reste au niveau zone.
  const [detailZone,     setDetailZone]     = useState<string | null>(null)
  // Toast d'erreur temporaire (remplace les alert() natifs)
  const [toast,          setToast]          = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

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

    // Combien de bâtiments (interventions) cette résidence/contrat a-t-elle
    // aujourd'hui ? Même critère que l'écran niveau 1 (agent_id, contrat_id,
    // date_prevue, statut != annulee) — détermine si le bouton de finalisation
    // doit être ici (mono) ou sur /agent/mission/[contratId] (multi).
    const interRow = inter as FullIntervention | null
    if (interRow?.contrat_id) {
      const { count } = await supabase
        .from('interventions')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', interRow.agent_id)
        .eq('contrat_id', interRow.contrat_id)
        .eq('date_prevue', interRow.date_prevue)
        .neq('statut', 'annulee')
      setNbBatimentsMission(count ?? 1)
    } else {
      setNbBatimentsMission(1)
    }

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

  // ── Changer statut d'une tâche (optimiste + rollback si échec) ─────────────
  async function setStatutTache(
    tache: TacheIntervention,
    nouveau: 'realisee' | 'non_realisee' | 'a_faire'
  ) {
    const supabase = createClient()
    const now = nouveau !== 'a_faire' ? new Date().toISOString() : null
    const previousTaches = taches

    const newTaches = taches.map(t =>
      t.id === tache.id ? { ...t, statut_tache: nouveau, heure_validation: now } : t
    )
    setTaches(newTaches)

    const { error } = await supabase.from('taches_intervention')
      .update({ statut_tache: nouveau, heure_validation: now })
      .eq('id', tache.id)

    if (error) {
      setTaches(previousTaches)
      showToast('Échec de la mise à jour — vérifiez votre connexion')
      return
    }

    // Clôturer la zone si elle devient complète
    const zone = tache.zone_nom ?? 'Général'
    const zoneTaches = newTaches.filter(t => (t.zone_nom ?? 'Général') === zone)
    const allTreated = zoneTaches.every(t => t.statut_tache === 'realisee' || t.statut_tache === 'non_realisee')
    if (allTreated && (photosZone[zone]?.length ?? 0) > 0) {
      await cloturerZone(zone)
    }
  }

  // ── Valider toute une zone d'un coup (→ 'realisee') — rollback si échec ─────
  async function validerZone(zone: string) {
    const supabase = createClient()
    const now = new Date().toISOString()
    const previousTaches = taches

    const newTaches = taches.map(t =>
      (t.zone_nom ?? 'Général') === zone && t.statut_tache === 'a_faire'
        ? { ...t, statut_tache: 'realisee' as const, heure_validation: now }
        : t
    )
    setTaches(newTaches)

    let query = supabase.from('taches_intervention')
      .update({ statut_tache: 'realisee', heure_validation: now })
      .eq('intervention_id', params.id)
      .eq('statut_tache', 'a_faire')

    if (zone === 'Général') {
      query = query.is('zone_nom', null)
    } else {
      query = query.eq('zone_nom', zone)
    }
    const { error } = await query

    if (error) {
      setTaches(previousTaches)
      showToast('Échec de la validation — vérifiez votre connexion')
      return
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

  // ── Signaler un problème sur une tâche (étape 9f) ─────────────────────────────
  // Compose les deux mécaniques existantes : statut → non_realisee + commentaire.
  // Ne bloque pas la validation du reste de la zone (validerZone ignore les
  // tâches déjà traitées, y compris non_realisee).
  async function signalerProbleme(tache: TacheIntervention, texte: string) {
    await setStatutTache(tache, 'non_realisee')
    await saveCommentaire(tache.id, texte)
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
      showToast('Échec de l\'envoi photo — réessayez')
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
  function handleFinaliser() {
    setFinalizing(true)
    setConfirming(false)
    // La mise à jour statut→terminee est faite server-side dans POST /api/interventions/[id]/rapport
    router.push(`/agent/intervention/${params.id}/controle-final`)
  }

  // ── Retour — vers l'écran niveau 1 (bâtiments) si on vient de là, sinon
  // navigation standard (étape 9f). intervention.batiment renseigné = résidence
  // multi-bâtiments = l'écran niveau 1 existe. Mono-bâtiment : comportement
  // inchangé (router.back()), aucun contexte "bâtiment" à afficher.
  function handleBack() {
    if (intervention?.batiment && intervention?.contrat_id) {
      router.push(`/agent/mission/${intervention.contrat_id}`)
    } else {
      router.back()
    }
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
  // Mono-bâtiment uniquement (étape 9g) — pour une mission multi-bâtiments, la
  // finalisation se fait depuis le niveau 1, jamais depuis un bâtiment seul.
  const isMulti             = nbBatimentsMission > 1
  const peutFinaliser        = !isMulti && zones.length > 0 && zonesCompletes >= 1
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

  const zoneDetailTaches = detailZone ? (groupes[detailZone] ?? []) : []

  // ── Rendu principal ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header sticky */}
      <div
        className="px-5 pt-10 pb-5 sticky top-0 z-10"
        style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
      >
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-blue-200 text-sm mb-3 active:opacity-70"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          Retour
        </button>

        <h1 className="text-xl font-bold text-white truncate">{intervention.residences?.nom}</h1>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {intervention.contrats_residences?.libelle && (
            <span className="text-[#0BBFBF] text-sm font-semibold truncate">{intervention.contrats_residences.libelle}</span>
          )}
          {intervention.batiment && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-white text-xs font-bold">
              <Building2 className="w-3 h-3" />
              {intervention.batiment}
            </span>
          )}
        </div>
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

      {/* Zones — validation PAR ZONE (étape 9f, §7.3). Le détail des 5 tâches
          n'est plus affiché par défaut : il est consultatif, derrière le "?". */}
      <div className="px-5 py-4 space-y-4 pb-36">
        {zones.map(zone => {
          const zoneTaches     = groupes[zone]
          const zonePhotos     = photosZone[zone] ?? []
          const complete       = zoneComplete(zone)
          const aDesAfaire     = zoneTaches.some(t => t.statut_tache === 'a_faire')
          const nbSignalements = zoneTaches.filter(t => t.statut_tache === 'non_realisee').length

          return (
            <div
              key={zone}
              className={`rounded-2xl border-2 overflow-hidden transition-all ${
                complete ? 'border-green-200' : 'border-slate-200'
              }`}
            >
              {/* En-tête de zone */}
              <div className={`px-4 py-3.5 flex items-center gap-3 ${complete ? 'bg-green-50' : 'bg-white'}`}>
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {complete ? (
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                    </div>
                  ) : (
                    <Circle className={`w-6 h-6 shrink-0 ${nbSignalements > 0 ? 'text-amber-400' : 'text-slate-300'}`} strokeWidth={2} />
                  )}
                  <div className="min-w-0">
                    <h2 className="font-bold text-slate-800 truncate">{zone}</h2>
                    {complete ? (
                      <p className="text-xs text-green-600 font-semibold mt-0.5">
                        ✓ Photo · Zone validée{nbSignalements > 0 ? ` · ${nbSignalements} signalement${nbSignalements > 1 ? 's' : ''}` : ''}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {zoneTaches.length} tâche{zoneTaches.length > 1 ? 's' : ''}
                        {nbSignalements > 0 ? ` · ${nbSignalements} signalée${nbSignalements > 1 ? 's' : ''}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bouton Détail "?" — panneau consultatif, jamais bloquant */}
                <button
                  onClick={() => setDetailZone(zone)}
                  className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 font-bold text-sm active:bg-slate-200 transition-colors"
                  title="Détail des tâches"
                >
                  ?
                </button>
              </div>

              {/* Actions principales — Photo + Valider la zone */}
              {!complete && (
                <div className="bg-white px-4 pb-4 pt-1 space-y-3">
                  {zonePhotos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {zonePhotos.map(photo => (
                        <div key={photo.id} className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-200 shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.signedUrl} alt="Photo zone" className="w-full h-full object-cover"/>
                          <button
                            onClick={() => handleDeletePhotoZone(zone, photo)}
                            className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow font-bold leading-none"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={e => e.target.files?.[0] && handlePhotoZone(zone, e.target.files[0])}
                      />
                      {uploadingZone === zone ? (
                        <div className="h-12 rounded-xl bg-[#0BBFBF]/10 text-[#0BBFBF] text-sm font-semibold flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-[#0BBFBF] border-t-transparent rounded-full animate-spin"/>
                          Envoi…
                        </div>
                      ) : (
                        <div className={`h-12 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-sm font-semibold transition-colors active:scale-[0.98] ${
                          zonePhotos.length === 0
                            ? 'border-amber-400 text-amber-600 bg-amber-50'
                            : 'border-slate-300 text-slate-500'
                        }`}>
                          <Camera className="w-4 h-4 shrink-0" />
                          Photo
                        </div>
                      )}
                    </label>

                    {aDesAfaire && (
                      <button
                        onClick={() => validerZone(zone)}
                        className="flex-[1.4] h-12 rounded-xl text-white font-bold text-sm active:opacity-90 transition-opacity"
                        style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
                      >
                        ✓ Valider la zone
                      </button>
                    )}
                  </div>

                  {!aDesAfaire && zonePhotos.length === 0 && (
                    <p className="text-xs text-amber-600 text-center font-medium">📸 Une photo est nécessaire pour valider la zone</p>
                  )}
                </div>
              )}
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

      {/* Panneau "?" — détail consultatif d'une zone (étape 9f) */}
      {detailZone && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDetailZone(null)}/>
          <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-800 truncate">Détail — {detailZone}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Pour rappel — la validation se fait par zone</p>
              </div>
              <button
                onClick={() => setDetailZone(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0 active:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-2 divide-y divide-slate-50">
              {zoneDetailTaches.map(tache => {
                const commentOpen = expandedComment === tache.id
                const draft       = commentDraft[tache.id] ?? tache.commentaire ?? ''
                const signale     = tache.statut_tache === 'non_realisee'
                const realisee    = tache.statut_tache === 'realisee'

                return (
                  <div key={tache.id} className="py-3.5">
                    <div className="flex items-center gap-3">
                      {realisee ? (
                        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 text-white" strokeWidth={3} />
                        </div>
                      ) : signale ? (
                        <div className="w-5 h-5 rounded-full bg-red-400 flex items-center justify-center shrink-0">
                          <X className="w-3 h-3 text-white" strokeWidth={3} />
                        </div>
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 shrink-0" strokeWidth={2} />
                      )}
                      <span className={`flex-1 text-sm ${
                        realisee ? 'text-slate-400 line-through' : signale ? 'text-red-600 font-medium' : 'text-slate-700 font-medium'
                      }`}>
                        {tache.libelle}
                      </span>
                    </div>

                    {/* Commentaire existant (affiché si l'éditeur n'est pas ouvert) */}
                    {!commentOpen && tache.commentaire && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-2 ml-8 italic">
                        {tache.commentaire}
                      </p>
                    )}

                    {!commentOpen ? (
                      <div className="flex items-center gap-3 mt-2 ml-8">
                        <button
                          onClick={() => {
                            setExpandedComment(tache.id)
                            setCommentDraft(p => ({ ...p, [tache.id]: tache.commentaire ?? '' }))
                          }}
                          className={`flex items-center gap-1.5 text-xs font-semibold ${signale ? 'text-red-500' : 'text-slate-400'}`}
                        >
                          <TriangleAlert className="w-3.5 h-3.5" />
                          {signale ? 'Modifier le signalement' : 'Signaler un problème'}
                        </button>
                        {signale && (
                          <button
                            onClick={() => setStatutTache(tache, 'a_faire')}
                            className="text-xs text-slate-400 underline active:opacity-70"
                          >
                            Annuler
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 ml-8 space-y-2">
                        <textarea
                          value={draft}
                          onChange={e => setCommentDraft(p => ({ ...p, [tache.id]: e.target.value }))}
                          rows={2}
                          placeholder="Décrivez le problème (accès bloqué, local fermé…)"
                          className="w-full px-3 py-2.5 rounded-xl border border-red-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-transparent"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setExpandedComment(null)}
                            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium active:opacity-70"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={() => signalerProbleme(tache, draft)}
                            className="flex-[2] py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold active:opacity-90"
                          >
                            Confirmer le signalement
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {zoneDetailTaches.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-6">Aucune tâche pour cette zone.</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 shrink-0 pb-safe">
              <button
                onClick={() => setDetailZone(null)}
                className="w-full h-12 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm active:bg-slate-200"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Toast erreur réseau */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-red-600 text-white rounded-2xl shadow-lg text-sm font-semibold animate-pulse max-w-xs text-center">
          {toast}
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
