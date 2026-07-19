'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { distanceMetres } from '@/lib/geo'
import { displayIdentifiant } from '@/lib/agent-identifiant'
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

    // 1. Token → contrat (contrats_residences.qr_code_token)
    const { data: contrat } = await supabase
      .from('contrats_residences')
      .select('id, libelle, residence_id, dispatch_semaine')
      .eq('qr_code_token', token)
      .maybeSingle()

    if (!contrat) {
      setStatus('error')
      setMessage('QR code non reconnu. Vérifiez que vous utilisez le bon QR code.')
      return
    }

    // 2. Résidence (géoloc + manager_id pour alertes)
    const { data: residence } = await supabase
      .from('residences')
      .select('id, nom, lat, lng, manager_id')
      .eq('id', contrat.residence_id)
      .single()

    if (!residence) {
      setStatus('error')
      setMessage('QR code non reconnu. Vérifiez que vous utilisez le bon QR code.')
      return
    }

    // 3. Géolocalisation
    let geoloc_lat: number | null = null
    let geoloc_lng: number | null = null
    let hors_zone = false
    let distanceM: number | null = null

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

      if (residence.lat && residence.lng) {
        const dist = distanceMetres(geoloc_lat, geoloc_lng, residence.lat, residence.lng)
        distanceM = Math.round(dist)
        if (dist > 200) hors_zone = true
      }
    } catch {
      // Géoloc refusée ou indisponible — on continue sans bloquer
    }

    // 4. Utilisateur + profil agent
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setStatus('error')
      setMessage('Session expirée. Reconnectez-vous.')
      return
    }

    const { data: agentProfil } = await supabase
      .from('profiles')
      .select('prenom, nom')
      .eq('id', user.id)
      .maybeSingle()
    const agentNom = agentProfil
      ? `${agentProfil.prenom ?? ''} ${agentProfil.nom ?? ''}`.trim()
      : displayIdentifiant(user.email) || user.id

    const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })

    // ── Mode test "scan hors-jour" (réversible, explicite, test terrain) ──────
    // Activé UNIQUEMENT par ?test=1 dans l'URL — JAMAIS par défaut. En prod
    // normale (paramètre absent), dateResolue === today et tout le reste de
    // cette fonction est rigoureusement identique à avant ce lot (une seule
    // requête sur `today`, comme aujourd'hui).
    // En mode test : élargit la résolution de "l'intervention du jour" à une
    // fenêtre J-3..J+3 et retient la date la plus proche d'aujourd'hui ayant
    // réellement une intervention planifiee/en_cours pour cet agent+ce
    // contrat (today lui-même gagne en cas d'égalité, cf tri stable + arrivée
    // en tête de liste). Ne touche à AUCUNE autre logique (zones, tâches,
    // rapport) : seule la date utilisée pour retrouver "l'intervention du
    // jour" change, tout le reste de la fonction consomme dateResolue/
    // jourCourant exactement comme il consommait today/new Date() avant.
    // DÉSACTIVATION : ne plus ajouter ?test=1 à l'URL/au lien envoyé à
    // l'agent — rien d'autre à faire, ce mode ne persiste aucun état nulle
    // part (ni en base, ni en cookie/localStorage), il ne vaut que pour CET
    // appel de processToken.
    const testMode = params.get('test') === '1'
    let dateResolue = today
    if (testMode) {
      const fmtParis = (d: Date) => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
      const centre  = new Date(today + 'T12:00:00')
      const jMoins3 = new Date(centre); jMoins3.setDate(jMoins3.getDate() - 3)
      const jPlus3  = new Date(centre); jPlus3.setDate(jPlus3.getDate() + 3)

      const { data: candidats } = await supabase
        .from('interventions')
        .select('date_prevue')
        .eq('agent_id', user.id)
        .eq('contrat_id', contrat.id)
        .gte('date_prevue', fmtParis(jMoins3))
        .lte('date_prevue', fmtParis(jPlus3))
        .in('statut', ['planifiee', 'en_cours'])

      const dates = [...new Set((candidats ?? []).map(c => c.date_prevue as string))]
      if (dates.length > 0) {
        dates.sort((a, b) =>
          Math.abs(new Date(a + 'T12:00:00').getTime() - centre.getTime()) -
          Math.abs(new Date(b + 'T12:00:00').getTime() - centre.getTime())
        )
        dateResolue = dates[0]
      }
      // eslint-disable-next-line no-console
      console.warn(`[SCAN TEST MODE ?test=1] fenêtre ${fmtParis(jMoins3)}..${fmtParis(jPlus3)} → date résolue: ${dateResolue}`)
    }

    setMessage('Recherche de l\'intervention…')

    // 5. TOUTES les interventions de CE CONTRAT pour la date résolue (binôme :
    // agent_id = user.id). Depuis le chantier bâtiments, un jour multi-bâtiments
    // = plusieurs interventions distinctes (une par bâtiment, enchaînées) — on
    // travaille désormais sur la liste complète, jamais sur un id fixe (étape 9,
    // §7.3). dateResolue === today hors mode test (comportement inchangé).
    const { data: intersJour } = await supabase
      .from('interventions')
      .select('id, statut, batiment')
      .eq('agent_id', user.id)
      .eq('contrat_id', contrat.id)
      .eq('date_prevue', dateResolue)
      .in('statut', ['planifiee', 'en_cours'])
      .order('heure_debut_prevue')

    // Pour l'instant (écran niveau 1 = étape 9b, pas encore fait) : on route
    // toujours vers la première de la liste. Mono-bâtiment (liste à 1 élément) →
    // comportement strictement identique à avant.
    const inter = (intersJour ?? [])[0] ?? null

    if (!inter) {
      // Anti-doublon : intervention déjà terminée/validée → rouvrir sans alerte
      const { data: interDone } = await supabase
        .from('interventions')
        .select('id')
        .eq('agent_id', user.id)
        .eq('contrat_id', contrat.id)
        .eq('date_prevue', dateResolue)
        .in('statut', ['terminee', 'validee'])
        .limit(1)
        .maybeSingle()

      if (interDone) {
        streamRef.current?.getTracks().forEach(t => t.stop())
        cancelAnimationFrame(rafRef.current)
        router.push(`/agent/intervention/${interDone.id}`)
        return
      }

      // Hors planning : alerte manager + message agent (dédoublonnée par agent+contrat+date)
      if (residence.manager_id) {
        const now = new Date()
        const heureFR = now.toLocaleTimeString('fr-FR', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
        })
        const dateFR = new Date(dateResolue + 'T12:00:00').toLocaleDateString('fr-FR', {
          day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris',
        })

        // Anti-doublon : skip si une alerte non lue existe déjà pour ce même événement
        const { data: existante } = await supabase
          .from('alertes')
          .select('id')
          .eq('type', 'scan_hors_planning')
          .eq('destinataire_id', residence.manager_id)
          .eq('lue', false)
          .filter('metadata->>agent_id', 'eq', user.id)
          .filter('metadata->>contrat_id', 'eq', contrat.id)
          .filter('metadata->>date', 'eq', dateResolue)
          .limit(1)
          .maybeSingle()

        if (!existante) {
          const residenceNom = residence.nom ?? contrat.residence_id
          const contratLibelle = contrat.libelle ?? 'contrat'
          await supabase.from('alertes').insert({
            intervention_id: null,
            type:            'scan_hors_planning',
            message:         `${agentNom} a scanné le contrat ${contratLibelle} (${residenceNom}) hors planning le ${dateFR} à ${heureFR}.`,
            destinataire_id: residence.manager_id,
            metadata: {
              agent_id:        user.id,
              agent_nom:       agentNom,
              contrat_id:      contrat.id,
              contrat_libelle: contratLibelle,
              residence_id:    contrat.residence_id,
              residence_nom:   residenceNom,
              date:            dateResolue,
              heure:           now.toISOString(),
            },
          })
        }
      }

      setStatus('error')
      setMessage(
        (testMode
          ? `Aucune intervention prévue dans les jours proches pour ce contrat`
          : `Aucune intervention prévue aujourd'hui pour ce contrat`) +
        `${contrat.libelle ? ` (${contrat.libelle})` : ''}.` +
        ` Votre manager a été informé.`
      )
      return
    }

    // 6. Démarrage GLOBAL : le chrono démarre UNE fois au scan, pour toute la
    // résidence — jamais par bâtiment (sinon le 2e bâtiment hériterait du temps
    // du 1er). On démarre donc TOUTES les interventions du jour encore
    // 'planifiee' en une passe, avec le même heure_scan/geoloc (étape 9e, §7.3).
    // Celles déjà 'en_cours' (rescan) ne sont pas retouchées, comme aujourd'hui.
    // Mono-bâtiment : la liste ne contient qu'1 id → comportement identique à avant.
    const idsADemarrer = (intersJour ?? [])
      .filter(i => i.statut === 'planifiee')
      .map(i => i.id)
    if (idsADemarrer.length > 0) {
      setMessage('Démarrage de l\'intervention…')
      await supabase.from('interventions').update({
        statut:     'en_cours',
        heure_scan: new Date().toISOString(),
        geoloc_lat,
        geoloc_lng,
      }).in('id', idsADemarrer)
    }

    // 7. Zones + tâches de CHAQUE BÂTIMENT de la mission du jour (toujours,
    // premier scan ET rescan) — étape 9c, §7.3, étendu au fix "reconstruction
    // multi-bâtiments" : cette logique tournait auparavant seulement sur
    // inter = intersJour[0], laissant les autres bâtiments sans
    // taches_intervention pour toujours (le 1er bâtiment restant en_cours
    // jusqu'à la clôture groupée 9h, jamais délogé de la position [0]). Même
    // logique exacte que pour un seul bâtiment, appliquée en boucle à toute la
    // liste. jourInter.batiment = null (mono-bâtiment) → aucun filtre, toutes
    // les zones du contrat comme avant. Mono-bâtiment : la liste ne contient
    // qu'1 élément → 1 seule itération, comportement identique à avant.
    // jourCourant = jour de semaine de dateResolue (PAS forcément "aujourd'hui"
    // en mode test) : pilote le filtre jours_semaine des tâches et la
    // recherche dans dispatch_semaine juste en dessous — doit rester cohérent
    // avec la date des interventions réellement traitées ci-dessus.
    const jourCourant = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', weekday: 'long',
    }).format(new Date(dateResolue + 'T12:00:00'))

    // Tournées transverses du jour (correctif "halls bi-hebdo") — une
    // intervention de tournée porte un batiment SYNTHÉTIQUE (ex. "Halls Bât
    // 7-8 (2e passage)") qui ne correspond à AUCUNE zones_residence.batiment
    // réelle : le filtre .eq('batiment', ...) ci-dessous renvoie alors 0 zone,
    // taches_intervention reste vide, et l'écran mission ne peut jamais passer
    // "Prêt" pour cette carte (cardState exige zonesTotal > 0). On résout donc
    // en repli, pour CE jour de la semaine uniquement, via dispatch_semaine.tournees_transverses
    // (zones au format "Bâtiment/Zone", même convention que generer/route.ts).
    type DispatchJourLite = { jour: string; tournees_transverses: { libelle: string; zones: string[] }[] }
    const dispatchAujourdhui = ((contrat.dispatch_semaine as DispatchJourLite[] | null) ?? [])
      .find(d => d.jour === jourCourant)
    const tourneeParLibelle = new Map<string, string[]>()
    for (const t of dispatchAujourdhui?.tournees_transverses ?? []) {
      tourneeParLibelle.set(t.libelle, t.zones)
    }

    for (const jourInter of (intersJour ?? [])) {
      // Zones de CE bâtiment — évite que les tâches de tous les bâtiments
      // atterrissent sur la même intervention et que les noms de zone
      // homonymes fusionnent (zone_nom redevient unique par intervention).
      let zonesQuery = supabase.from('zones_residence').select('id, nom, batiment').eq('contrat_id', contrat.id)
      if (jourInter.batiment) zonesQuery = zonesQuery.eq('batiment', jourInter.batiment)
      const { data: zonesInitiales } = await zonesQuery

      // Repli tournée transverse : le batiment ne matche aucune zone réelle,
      // mais correspond exactement au libellé d'une tournée du jour → on
      // résout les zones précises qu'elle vise (ex. les 2 halls concernés),
      // au lieu de laisser l'intervention sans aucune zone à traiter.
      let zones = zonesInitiales ?? []
      let estTournee = false
      if (zones.length === 0 && jourInter.batiment && tourneeParLibelle.has(jourInter.batiment)) {
        estTournee = true
        const { data: toutesZones } = await supabase
          .from('zones_residence').select('id, nom, batiment').eq('contrat_id', contrat.id)
        const cibles = new Set(
          (tourneeParLibelle.get(jourInter.batiment) ?? []).map(z => z.trim().toLowerCase())
        )
        zones = (toutesZones ?? []).filter(z => {
          const cle = z.batiment?.trim() ? `${z.batiment.trim()}/${z.nom.trim()}` : z.nom.trim()
          return cibles.has(cle.toLowerCase()) || cibles.has(z.nom.trim().toLowerCase())
        })
      }

      // Désambiguïsation nom de zone (repli tournée) : une tournée transverse
      // (ex. "Halls Bât 7-8") regroupe volontairement des zones de PLUSIEURS
      // bâtiments dans UNE seule intervention — leurs noms de zone sont
      // souvent identiques ("Hall d'entrée" partout). taches_intervention/
      // photos_zone/zones_intervention sont keyés par zone_nom SEUL : sans
      // préfixe, les deux halls fusionneraient en un seul groupe et une
      // photo sur l'un validerait l'autre à tort. Préfixe par le bâtiment
      // UNIQUEMENT quand un nom est dupliqué dans cette intervention précise
      // (bâtiment complet : 4 zones déjà toutes distinctes, aucun impact).
      const nomCounts = new Map<string, number>()
      for (const z of zones ?? []) nomCounts.set(z.nom, (nomCounts.get(z.nom) ?? 0) + 1)

      const zoneMap: Record<string, string> = {}
      const zoneIds: string[] = []
      const zoneNoms = new Set<string>()
      for (const z of zones ?? []) {
        const nomAffiche = (nomCounts.get(z.nom) ?? 0) > 1 && z.batiment
          ? `${z.batiment} — ${z.nom}`
          : z.nom
        zoneMap[z.id] = nomAffiche
        zoneIds.push(z.id)
        zoneNoms.add(nomAffiche)
      }

      // Détecter taches stale : zone_nom présente dans taches_intervention
      // mais absente des zones de ce bâtiment (résidu d'un scan pré-B6a ou mauvais contrat)
      let shouldRebuildTaches = jourInter.statut === 'planifiee'
      if (!shouldRebuildTaches) {
        const { data: existingTaches } = await supabase
          .from('taches_intervention')
          .select('zone_nom')
          .eq('intervention_id', jourInter.id)
        shouldRebuildTaches = (existingTaches ?? []).some(
          t => t.zone_nom != null && !zoneNoms.has(t.zone_nom)
        )
      }

      if (shouldRebuildTaches) {
        type TacheRaw = { id: string; libelle: string; jours_semaine: string[]; zone_id: string | null; tache_liee_id: string | null }
        let tachesDuJour: TacheRaw[] = []
        if (zoneIds.length > 0) {
          const { data: taches } = await supabase
            .from('taches_template')
            .select('id, libelle, jours_semaine, zone_id, tache_liee_id')
            .in('zone_id', zoneIds)
            .order('ordre')
          // tache_liee_id marque une tâche de "2e passage" (correctif halls
          // bi-hebdo) : elle appartient à la tournée transverse, jamais au
          // passage complet du bâtiment, même quand la zone est partagée par
          // les deux interventions. Une intervention tournée (estTournee) ne
          // garde QUE ces tâches liées ; une intervention bâtiment complet les
          // exclut (sinon la tournée serait doublée sur les deux visites).
          tachesDuJour = (taches as TacheRaw[] ?? []).filter(t => {
            if (estTournee) return t.tache_liee_id != null
            if (t.tache_liee_id != null) return false
            return !t.jours_semaine?.length || t.jours_semaine.includes(jourCourant)
          })
        }

        await supabase.from('taches_intervention').delete().eq('intervention_id', jourInter.id)
        if (tachesDuJour.length > 0) {
          await supabase.from('taches_intervention').insert(
            tachesDuJour.map(t => ({
              intervention_id:   jourInter.id,
              tache_template_id: t.id,
              libelle:           t.libelle,
              zone_nom:          t.zone_id ? (zoneMap[t.zone_id] ?? null) : null,
            }))
          )
        }
      }
    }

    // Alerte hors zone (premier scan uniquement) — enrichie sur le modèle de
    // scan_hors_planning (B6a) : agent/résidence/distance/date/heure stockés
    // dans metadata à la création (point-in-time), pas de join au render.
    if (inter.statut === 'planifiee' && hors_zone && residence.manager_id) {
      const nowHorsZone = new Date()
      const heureFR = nowHorsZone.toLocaleTimeString('fr-FR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
      }).replace(':', 'h')
      const dateFR = new Date(dateResolue + 'T12:00:00').toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris',
      })

      await supabase.from('alertes').insert({
        intervention_id: inter.id,
        type:            'hors_zone',
        message:         `${agentNom} a scanné ${residence.nom} à ${distanceM ?? '?'} m de la résidence le ${dateFR} à ${heureFR}.`,
        destinataire_id: residence.manager_id,
        metadata: {
          agent_id:      user.id,
          agent_nom:     agentNom,
          residence_id:  residence.id,
          residence_nom: residence.nom,
          distance_m:    distanceM,
          date:          dateResolue,
          heure:         nowHorsZone.toISOString(),
        },
      })
    }

    // 8. Naviguer — mono-bâtiment (1 intervention) : direct vers l'écran de zones,
    // comme aujourd'hui. Multi-bâtiment (étape 9b) : écran de choix niveau 1.
    streamRef.current?.getTracks().forEach(t => t.stop())
    cancelAnimationFrame(rafRef.current)
    if ((intersJour ?? []).length > 1) {
      router.push(`/agent/mission/${contrat.id}`)
    } else {
      router.push(`/agent/intervention/${inter.id}`)
    }
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
  const testModeUrl = params.get('test') === '1'

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

      {/* Bandeau mode test — visible tant que ?test=1 est dans l'URL, pour
          qu'il n'y ait jamais de doute sur le mode actif pendant le test terrain */}
      {testModeUrl && (
        <div className="mx-6 mb-2 px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-semibold text-center">
          MODE TEST — fenêtre élargie J-3/J+3 (retirez ?test=1 de l&apos;URL pour repasser en mode normal)
        </div>
      )}

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
