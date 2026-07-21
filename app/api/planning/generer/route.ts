import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { computeProrataZones, volumeHebdoMinutes, nbPassagesHebdo, type ProrataZoneInput } from '@/lib/prorata'
import { type DispatchJour } from '@/lib/dispatchSemaine'

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

const DAY_ISO: Record<string, number> = {
  lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7,
}

// Fuseau métier (règle CONTEXT.md) : jamais toISOString()/getDay() bruts pour
// une date métier — toISOString() est UTC alors que getDay() est local, les
// deux dérivent au fil des heures/saisons (bug corrigé ici, cf CONTEXT!).
// On dérive TOUJOURS le jour de semaine ET la date depuis le même instant, en
// heure de Paris explicite (même pattern que agent/scan/page.tsx et
// /api/ia/copilote/route.ts).
const TZ_PARIS = 'Europe/Paris'
// weekday 'long' en locale fr-FR rend directement "lundi", "mardi"… en
// minuscules — coïncide avec les clés utilisées partout dans ce fichier
// (jours_semaine, creneaux_acceptes, DAY_ISO).
const fmtWeekdayParis = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ_PARIS, weekday: 'long' })
const dateParisISO = (d: Date): string => d.toLocaleDateString('fr-CA', { timeZone: TZ_PARIS })

/** Normalise "HH:MM:SS" → "HH:MM", null si null */
const normalizeTime = (t: string | null | undefined): string | null =>
  t ? t.substring(0, 5) : null

/** Ajoute des minutes à "HH:MM" → "HH:MM" */
function addMinutes(heure: string, minutes: number): string {
  const [h, m] = heure.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Réduit heure_fin selon facteur_binome.
 * Entrée : "HH:MM" (déjà normalisé par normalizeTime — les "HH:MM:SS" de la DB sont strippés en amont).
 * Ex : ("08:00", "09:00", 0.5) → dureeMin=60 → dureeReduite=30 → "08:30"
 */
function reduireHeureFin(hDebut: string, hFin: string, facteur: number): string {
  const [dh, dm] = hDebut.split(':').map(Number)
  const [fh, fm] = hFin.split(':').map(Number)
  const dureeMin    = (fh * 60 + fm) - (dh * 60 + dm)
  const dureeReduite = Math.round(dureeMin * facteur)
  return addMinutes(hDebut, dureeReduite)
}

interface Creneau {
  jours: string[]
  heure_debut: string
  heure_fin: string
  label?: string
}

/** Trouve le créneau couvrant un jour donné, ou null */
function creneauPourJour(creneaux: Creneau[], jour: string): Creneau | null {
  return creneaux.find(c => c.jours.includes(jour)) ?? null
}

interface ZoneRow {
  id: string
  nom: string
  batiment: string | null
  coef_duree: number
  duree_minutes: number | null
}

/**
 * Regroupe les zones du contrat par bâtiment (étape 8b-3, §5.2).
 * Même logique et même tri que zoneGroups dans TachesClient.tsx, pour rester
 * cohérent avec l'écran de config : mono-bâtiment (aucune étiquette) → un seul
 * groupe { label: null } = comportement actuel inchangé.
 */
function groupZonesByBatiment(zones: ZoneRow[]): { label: string | null; zones: ZoneRow[] }[] {
  const hasBatiment = zones.some(z => z.batiment && z.batiment.trim() !== '')
  if (!hasBatiment) return [{ label: null, zones }]

  const parBatiment = new Map<string, ZoneRow[]>()
  const sansBatiment: ZoneRow[] = []
  for (const z of zones) {
    const b = z.batiment?.trim()
    if (b) {
      const arr = parBatiment.get(b) ?? []
      arr.push(z)
      parBatiment.set(b, arr)
    } else {
      sansBatiment.push(z)
    }
  }
  const keys = [...parBatiment.keys()].sort((a, b) =>
    a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }),
  )
  const groups: { label: string | null; zones: ZoneRow[] }[] =
    keys.map(b => ({ label: b, zones: parBatiment.get(b)! }))
  if (sansBatiment.length > 0) groups.push({ label: 'Sans bâtiment', zones: sansBatiment })
  return groups
}

// POST — génère les interventions et les insère dans la table interventions
// Body: { residenceId, contratId, dateDebut?, dateFin? }
export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { residenceId, contratId, dateDebut: bodyDebut, dateFin: bodyFin } = body
  console.log('[generer] body reçu:', { residenceId, contratId, bodyDebut, bodyFin, managerId })

  if (!residenceId)
    return NextResponse.json({ error: 'residenceId manquant' }, { status: 400 })
  if (!contratId)
    return NextResponse.json({ error: 'contratId manquant' }, { status: 400 })

  const admin = await createAdminClient()

  // ── 1. Vérification ownership ────────────────────────────────────────────────
  const { data: res } = await admin.from('residences')
    .select('id, nom, lat, lng, agent_prefere_id, actif')
    .eq('id', residenceId).eq('manager_id', managerId).single()
  console.log('[generer] résidence:', res ? `"${res.nom}" agent=${res.agent_prefere_id ?? 'aucun'}` : 'NON TROUVÉE')
  if (!res) return NextResponse.json({ error: 'Résidence introuvable ou non autorisée' }, { status: 403 })
  if (!res.actif) return NextResponse.json({ error: 'Résidence en sommeil — réactivez-la avant de régénérer le planning.' }, { status: 403 })

  // ── 2. Contrat explicite — plus de "guess" parties_communes le plus récent ──
  const { data: contrat } = await admin.from('contrats_residences')
    .select('id, date_debut, date_fin, jours_obliges, jours_interdits, creneaux_acceptes, agent_prefere_id, montant_mensuel, taux_horaire_facturation, dispatch_semaine')
    .eq('id', contratId)
    .eq('residence_id', residenceId)
    .eq('actif', true)
    .single()

  console.log('[generer] contrat:', contrat
    ? `${contrat.date_debut} → ${contrat.date_fin} | creneaux=${JSON.stringify(contrat.creneaux_acceptes)}`
    : 'AUCUN contrat trouvé')
  if (!contrat)
    return NextResponse.json({ error: 'Contrat introuvable, inactif ou n\'appartient pas à cette résidence.' }, { status: 400 })

  // DETTE multi-contrats : le fallback résidence.agent_prefere_id peut être incorrect
  // quand un contrat a son propre agent distinct de l'agent résidence.
  // À corriger quand chaque contrat aura systématiquement agent_prefere_id renseigné.
  const effectiveAgentId = contrat.agent_prefere_id ?? res.agent_prefere_id
  console.log('[generer] agent effectif:', effectiveAgentId,
    contrat.agent_prefere_id ? '(depuis contrat)' : '(fallback résidence)')
  if (!effectiveAgentId)
    return NextResponse.json({ error: 'Aucun agent attitré pour cette résidence.' }, { status: 400 })

  // ── 1b. Binôme + facteur depuis profiles (source de vérité unique) ────────────
  const { data: agentPref } = await admin
    .from('profiles')
    .select('binome_agent_id, facteur_binome')
    .eq('id', effectiveAgentId)
    .single()

  const binomeAgentId = agentPref?.binome_agent_id ?? null
  const facteurBinome = (agentPref?.facteur_binome ?? 1) as number

  const creneaux: Creneau[] = contrat.creneaux_acceptes ?? []
  const joursObliges: string[]   = contrat.jours_obliges  ?? []
  const joursInterdits: string[] = contrat.jours_interdits ?? []

  // Plage de dates : paramètres body en priorité, sinon durée du contrat
  const dateDebut = bodyDebut ?? contrat.date_debut
  const dateFin   = bodyFin   ?? contrat.date_fin

  // ── 2b. Volume horaire vendu — même formule que le compteur de contrôle 8b-2 ──
  const { data: parametresSociete } = await admin
    .from('parametres_societe')
    .select('taux_horaire_facturation_defaut')
    .limit(1)
    .maybeSingle()

  const tauxEffectif  = contrat.taux_horaire_facturation ?? parametresSociete?.taux_horaire_facturation_defaut ?? 25
  const volumeHebdoMin = volumeHebdoMinutes(contrat.montant_mensuel ?? null, tauxEffectif)
  console.log('[generer] volume hebdo vendu:', Math.round(volumeHebdoMin), 'min (taux effectif:', tauxEffectif, ')')

  // ── 3. Zones + tâches hebdomadaires du contrat ──────────────────────────────
  const { data: zonesContrat } = await admin.from('zones_residence')
    .select('id, nom, batiment, coef_duree, duree_minutes').eq('contrat_id', contratId)

  const zoneIds = (zonesContrat ?? []).map((z: { id: string }) => z.id)

  if (!zoneIds.length)
    return NextResponse.json(
      { error: 'Aucune zone configurée pour ce contrat.' },
      { status: 400 }
    )

  const { data: taches, error: tachesErr } = await admin.from('taches_template')
    .select('id, libelle, zone_id, jours_semaine')
    .in('zone_id', zoneIds)
    .eq('frequence_type', 'hebdo')

  console.log('[generer] taches hebdo:', taches?.length ?? 0,
    tachesErr ? `ERREUR: ${tachesErr.message}` : '',
    taches?.map(t => `"${t.libelle}"[${(t.jours_semaine ?? []).join(',')}]`).join(', '))

  if (!taches?.length)
    return NextResponse.json(
      { error: 'Aucune tâche hebdomadaire configurée pour ce contrat.' },
      { status: 400 }
    )

  // ── 3b. Répartition semaine (chantier "Répartition semaine", item 4) ────────
  // Contrat avec dispatch_semaine renseigné (validé par le manager en étape 3
  // du wizard, ou via la répartition semaine sur un contrat existant) → chaque
  // jour de passage génère EXACTEMENT les bâtiments/tournées/containers du
  // dispatch, plus rien d'autre (R1 : un bâtiment = une seule intervention/
  // semaine). Contrat sans dispatch (dispatch_semaine null ou vide, TOUS les
  // contrats existants avant ce chantier) → comportement 100% inchangé
  // ci-dessous (rétrocompatibilité stricte, exigée explicitement).
  const dispatchSemaine: DispatchJour[] = (contrat.dispatch_semaine as DispatchJour[] | null) ?? []
  const dispatchActive = dispatchSemaine.length > 0
  console.log('[generer] dispatch_semaine:', dispatchActive ? `actif (${dispatchSemaine.length} jour(s))` : 'inactif — logique historique')

  // ── 4. Jours actifs ──────────────────────────────────────────────────────────
  const JOURS_FR: Record<string, string> = {
    lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
    jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
  }

  const joursFromTaches = [...new Set(taches.flatMap(t => t.jours_semaine ?? []))]
  const joursBase       = dispatchActive ? dispatchSemaine.map(d => d.jour) : (joursObliges.length > 0 ? joursObliges : joursFromTaches)
  const joursSkipped    = joursBase.filter(j => joursInterdits.includes(j))
  const joursActifs     = joursBase.filter(j => !joursInterdits.includes(j))

  joursSkipped.forEach(j =>
    console.log(`[generer] Jour "${j}" ignoré car interdit par le contrat`)
  )
  console.log('[generer] jours actifs:', joursActifs,
    `(source: ${dispatchActive ? 'dispatch_semaine' : joursObliges.length > 0 ? 'jours_obliges du contrat' : 'taches_template'})`)

  if (!joursActifs.length) {
    const detail = joursSkipped.length > 0
      ? `Tous les jours (${joursSkipped.map(j => JOURS_FR[j] ?? j).join(', ')}) sont interdits par le contrat. Modifiez les tâches ou les jours interdits.`
      : 'Aucun jour disponible (liste vide).'
    return NextResponse.json({ error: `Impossible de générer : ${detail}` }, { status: 400 })
  }

  const warnings: string[] = joursSkipped.map(
    j => `${JOURS_FR[j] ?? j} ignoré (jour interdit par le contrat)`
  )

  // ── 4b. Durée par zone (prorata pondéré, étape 8b-3 — §4) ──────────────────
  // Même logique que le compteur de contrôle 8b-2 (TachesClient.tsx) : une
  // zone avec duree_minutes saisie fournit sa durée hebdo explicite
  // (durée d'UN passage × nb de passages) au prorata ; sinon repli sur le
  // prorata pondéré (coef_duree). Remplace l'ancien calcul par somme des
  // taches_template.duree_minutes (cassé : les templates créent les tâches
  // à 0min, cf audit 8b-3).
  const zoneTachesMap = new Map<string, { frequence_type: 'hebdo'; jours_semaine: string[] }[]>()
  for (const t of taches) {
    if (!t.zone_id) continue
    const arr = zoneTachesMap.get(t.zone_id) ?? []
    arr.push({ frequence_type: 'hebdo', jours_semaine: t.jours_semaine ?? [] })
    zoneTachesMap.set(t.zone_id, arr)
  }

  const prorataInputs: ProrataZoneInput[] = (zonesContrat ?? []).map(z => {
    const zTaches     = zoneTachesMap.get(z.id) ?? []
    const nbPassages  = nbPassagesHebdo(zTaches)
    return {
      id: z.id,
      coefDuree: z.coef_duree ?? 1,
      taches: zTaches,
      dureeExpliciteHebdoMin: z.duree_minutes != null ? z.duree_minutes * nbPassages : null,
    }
  })
  const prorataResults  = computeProrataZones(volumeHebdoMin, prorataInputs)
  const prorataByZoneId = new Map(prorataResults.map(r => [r.zoneId, r]))
  console.log('[generer] prorata zones:', prorataResults.map(
    r => `${r.zoneId.slice(0, 8)}=${Math.round(r.dureePassageMin)}min×${r.nbPassages}(${r.source})`
  ).join(', '))

  // ── 4c. Regroupement par bâtiment (§5.2) — mono-bâtiment = un seul groupe ──
  const zoneGroups = groupZonesByBatiment(zonesContrat ?? [])
  console.log('[generer] bâtiments:', zoneGroups.map(g => g.label ?? '(mono-bâtiment)').join(', '))

  // ── 4d. Résolution des noms de zones (item 4 + correctif durée dispatch) ───
  // En mode dispatch, la durée par bâtiment/tournée n'est PLUS un prorata sur
  // le volume vendu de TOUT le contrat (c'était le bug : chaque bâtiment
  // recevait systématiquement volumeHebdoMin/9, peu importe le jour ou le
  // nombre de bâtiments partageant ce jour — cf diagnostic). Elle est
  // maintenant dérivée du créneau RÉEL du jour, réparti entre les unités
  // (bâtiments complets + tournées) effectivement prévues CE jour-là — voir
  // §5 plus bas. zoneParNomComplet reste nécessaire pour résoudre les noms de
  // zones des tournées transverses ("Bâtiment/Zone").
  const zoneParNomComplet = new Map<string, ZoneRow>()
  if (dispatchActive) {
    for (const z of (zonesContrat ?? []) as ZoneRow[]) {
      const cle = z.batiment?.trim() ? `${z.batiment.trim()}/${z.nom.trim()}` : z.nom.trim()
      zoneParNomComplet.set(cle.toLowerCase(), z)
      zoneParNomComplet.set(z.nom.trim().toLowerCase(), z) // repli nom seul (collision = dernier gagne, acceptable)
    }
  }

  const dispatchByJour = new Map(dispatchSemaine.map(d => [d.jour, d]))
  const DUREE_CONTAINERS_MIN = 5 // estimation forfaitaire (sortie/rentrée bacs) — pas de zone dédiée

  // ── 5. Génération des dates ──────────────────────────────────────────────────
  // Ancrage à midi (comme semaineDe() dans /api/ia/copilote/route.ts) : évite
  // tout risque de bascule de jour local↔Paris au parsing, quel que soit le
  // fuseau système du serveur.
  const start   = new Date(dateDebut + 'T12:00:00')
  const end     = new Date(dateFin   + 'T12:00:00')
  const current = new Date(start)

  type InterventionRow = {
    agent_id: string
    residence_id: string
    contrat_id: string
    date_prevue: string
    heure_debut_prevue: string
    heure_fin_prevue: string
    statut: string
    batiment: string | null
  }

  const rows: InterventionRow[] = []

  while (current <= end) {
    const dayName = fmtWeekdayParis.format(current)

    if (dispatchActive) {
      // ── Mode dispatch (item 4) : exactement ce que le jour prévoit, rien de plus ──
      const dEntry = dispatchByJour.get(dayName)
      if (dEntry) {
        const dateStr    = dateParisISO(current)
        const creneau    = creneauPourJour(creneaux, dayName)
        const hDebutJour = creneau ? normalizeTime(creneau.heure_debut) ?? '08:00' : '08:00'
        const hFinMax    = creneau ? normalizeTime(creneau.heure_fin) ?? null : null
        let curseur      = hDebutJour

        const pousserLigne = (label: string, duree: number) => {
          const hDebut = curseur
          const hFin   = addMinutes(hDebut, duree)
          if (hFinMax && hFin > hFinMax) {
            warnings.push(`${JOURS_FR[dayName] ?? dayName} — ${label} dépasse la fin du créneau (${hFin} > ${hFinMax})`)
            console.warn(`[generer] ⚠️ ${dateStr} (${dayName}) "${label}" : heure_fin=${hFin} > fin créneau=${hFinMax} (durée=${duree}min)`)
          }
          rows.push({
            agent_id: effectiveAgentId, residence_id: residenceId, contrat_id: contrat.id,
            date_prevue: dateStr, heure_debut_prevue: hDebut, heure_fin_prevue: hFin,
            statut: 'planifiee', batiment: label,
          })
          curseur = hFin
        }

        // R1 : bâtiments complets — TOUTES les zones du groupe, sans filtre par jour
        // (c'est précisément ce qui cassait avant : un filtre par jour dupliquait
        // le bâtiment sur chaque jour actif au lieu d'un seul passage/semaine).
        // Résolution AVANT calcul de durée : seuls les bâtiments trouvés consomment
        // du temps du créneau (un bâtiment introuvable est juste ignoré, en warning).
        const batimentsResolus: { nom: string }[] = []
        for (const nom of dEntry.batiments_complets) {
          const group = zoneGroups.find(g => g.label === nom)
          if (!group) {
            warnings.push(`${JOURS_FR[dayName] ?? dayName} — bâtiment "${nom}" du dispatch introuvable dans les zones configurées, ignoré`)
            console.warn(`[generer] ⚠️ dispatch "${nom}" sans zoneGroup correspondant (résidence=${residenceId})`)
            continue
          }
          batimentsResolus.push({ nom })
        }

        // R3 : tournées transverses — zones identifiées par "Bâtiment/Zone" (ou nom seul)
        const tourneesResolues: { libelle: string }[] = dEntry.tournees_transverses.map(t => {
          const zonesMatchees = [...new Set(
            t.zones.map(nz => zoneParNomComplet.get(nz.trim().toLowerCase())).filter((z): z is ZoneRow => !!z)
          )]
          if (zonesMatchees.length === 0) {
            warnings.push(`${JOURS_FR[dayName] ?? dayName} — tournée "${t.libelle}" : zones non reconnues (${t.zones.join(', ') || 'aucune'})`)
          }
          return { libelle: t.libelle || 'Tournée transverse' }
        })

        // ── Correctif durée dispatch : le créneau du JOUR (moins containers
        // éventuels) est réparti entre les unités (bâtiments complets +
        // tournées) réellement prévues ce jour-là — jamais une moyenne globale
        // sur les 9 bâtiments du contrat entier (bug d'origine). Répartition en
        // Math.floor + reste distribué aux N premières unités : la somme des
        // durées arrondies vaut EXACTEMENT le budget disponible, donc jamais de
        // dépassement de créneau introduit par l'arrondi lui-même.
        const dureeCreneauJour = hFinMax != null ? (() => {
          const [h1, m1] = hDebutJour.split(':').map(Number)
          const [h2, m2] = hFinMax.split(':').map(Number)
          return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
        })() : null
        const dureeContainers  = dEntry.containers ? DUREE_CONTAINERS_MIN : 0
        const nbUnitesJour     = batimentsResolus.length + tourneesResolues.length

        let dureeParUnite = 0
        let uniteBonus    = 0
        if (nbUnitesJour > 0) {
          if (dureeCreneauJour != null) {
            const budgetDisponible = Math.max(0, dureeCreneauJour - dureeContainers)
            dureeParUnite = Math.floor(budgetDisponible / nbUnitesJour)
            uniteBonus    = budgetDisponible - dureeParUnite * nbUnitesJour
          } else {
            dureeParUnite = 60 // repli si aucun créneau connu ce jour (cf ancien comportement)
          }
        }

        let uniteIndex = 0
        for (const { nom } of batimentsResolus) {
          pousserLigne(nom, dureeParUnite + (uniteIndex < uniteBonus ? 1 : 0))
          uniteIndex++
        }
        for (const { libelle } of tourneesResolues) {
          pousserLigne(libelle, dureeParUnite + (uniteIndex < uniteBonus ? 1 : 0))
          uniteIndex++
        }

        // R4 : containers — pas de zone dédiée, estimation forfaitaire
        if (dEntry.containers) {
          pousserLigne(dEntry.containers === 'sortie' ? 'Containers — sortie' : 'Containers — rentrée', dureeContainers)
        }
      }
    } else if (joursActifs.includes(dayName)) {
      // ── Mode historique (aucun dispatch) — comportement 100% inchangé ──────────
      const dateStr  = dateParisISO(current)
      const creneau  = creneauPourJour(creneaux, dayName)
      const hFinMax  = creneau ? normalizeTime(creneau.heure_fin) ?? null : null

      // Curseur horaire : enchaînement des bâtiments (§5.2) — le bâtiment N+1
      // démarre à la fin du bâtiment N. Mono-bâtiment = un seul passage, curseur
      // inchangé par rapport à avant.
      let curseur = creneau ? normalizeTime(creneau.heure_debut) ?? '08:00' : '08:00'

      for (const group of zoneGroups) {
        const zonesActives = group.zones.filter(z =>
          (zoneTachesMap.get(z.id) ?? []).some(t => t.jours_semaine.includes(dayName))
        )
        if (!zonesActives.length) continue // ce bâtiment n'a rien de planifié ce jour-là

        const dureeBrute = zonesActives.reduce(
          (sum, z) => sum + (prorataByZoneId.get(z.id)?.dureePassageMin ?? 0), 0
        )
        // Repli 60min si volume vendu absent (contrat sans montant) — évite une
        // intervention de durée nulle ; n'utilise plus toute la fenêtre du
        // créneau comme avant (incompatible avec l'enchaînement multi-bâtiment).
        const duree  = dureeBrute > 0 ? Math.round(dureeBrute) : 60
        const hDebut = curseur
        const hFin   = addMinutes(hDebut, duree)

        if (hFinMax && hFin > hFinMax) {
          const label = group.label ?? 'résidence'
          warnings.push(`${JOURS_FR[dayName] ?? dayName} — ${label} dépasse la fin du créneau (${hFin} > ${hFinMax})`)
          console.warn(`[generer] ⚠️ ${dateStr} (${dayName}) bâtiment="${label}" : heure_fin=${hFin} > fin créneau=${hFinMax} (durée=${duree}min)`)
        }

        rows.push({
          agent_id:           effectiveAgentId,
          residence_id:       residenceId,
          contrat_id:         contrat.id,
          date_prevue:        dateStr,
          heure_debut_prevue: hDebut,
          heure_fin_prevue:   hFin,
          statut:             'planifiee',
          batiment:           group.label, // null = mono-bâtiment (étape 8b-4, §7.4)
        })

        curseur = hFin // le bâtiment suivant démarre ici (trajet inter-bâtiments non modélisé, cf §5.2)
      }
    }
    current.setDate(current.getDate() + 1)
  }

  // ── 6. Filtrer les dates passées (le DELETE ne couvre que >= aujourd'hui) ────
  // "Aujourd'hui" en heure Paris (même pattern que agent/scan/page.tsx) — pas
  // toISOString() qui reste sur la veille jusqu'à 1h/2h du matin en France.
  const today = dateParisISO(new Date())
  const rowsFuturs = rows.filter(r => r.date_prevue >= today)

  console.log(`[generer] ${rows.length} interventions générées, ${rowsFuturs.length} futures (>= ${today})`)
  console.log('Interventions à créer:', rows?.length)

  if (!rowsFuturs.length)
    return NextResponse.json(
      { error: 'Aucune intervention future générée sur la période du contrat.' },
      { status: 400 }
    )

  // ── 6b. Binôme : interventions miroir, durée éventuellement réduite ──────────
  // Source de vérité : profiles.binome_agent_id (pas residences.agent_secondaire_id)
  //
  // Mode dispatch (top-down, dispatchActive) : le créneau est un budget de
  // PRÉSENCE fixe, les 2 agents sont sur site SIMULTANÉMENT sur le même
  // créneau — aucune raison de raccourcir les horaires (fix 21/07, audit
  // GMCO : la réduction ×facteurBinome, pensée pour un modèle bottom-up où
  // la durée = travail à répartir entre agents, créait un décalage/trou
  // artificiel une fois appliquée à des horaires déjà dérivés du créneau).
  //
  // Mode historique (aucun dispatch_semaine) : comportement 100% inchangé —
  // ces contrats n'ont jamais eu de notion de créneau-budget par jour, la
  // réduction ×facteurBinome reste le seul modèle de durée disponible pour
  // eux (rétrocompatibilité stricte, exigée explicitement).
  let rowsForUI = rowsFuturs          // aperçu retourné au client
  let allRows   = [...rowsFuturs]

  if (binomeAgentId) {
    if (dispatchActive) {
      const mirrorRows = rowsFuturs.map(r => ({ ...r, agent_id: binomeAgentId }))
      allRows   = [...rowsFuturs, ...mirrorRows]
      rowsForUI = rowsFuturs   // aperçu cohérent : mêmes horaires que la ligne principale
      console.log(`[generer] binôme ${binomeAgentId} (dispatch top-down) : ${mirrorRows.length} miroirs, mêmes horaires (présence simultanée sur le créneau)`)
    } else {
      const rowsReduits = rowsFuturs.map(r => ({
        ...r,
        heure_fin_prevue: reduireHeureFin(r.heure_debut_prevue, r.heure_fin_prevue, facteurBinome),
      }))
      const mirrorRows = rowsReduits.map(r => ({ ...r, agent_id: binomeAgentId }))
      allRows   = [...rowsReduits, ...mirrorRows]
      rowsForUI = rowsReduits   // aperçu cohérent avec ce qui est inséré en base
      console.log(`[generer] binôme ${binomeAgentId} facteur=${facteurBinome} : ${mirrorRows.length} miroirs, durée réduite`)
    }
  }

  // ── 7. DELETE + INSERT atomique via RPC PostgreSQL ──────────────────────────
  const { data: insertedCount, error: rpcErr } = await admin.rpc('planifier_interventions', {
    p_residence_id: residenceId,
    p_contrat_id:   contratId,
    p_lignes:       allRows,
  })
  console.log('RPC result:', rpcErr, insertedCount)
  if (rpcErr) {
    console.error('[generer] ❌ RPC planifier_interventions échoué:', rpcErr.message)
    return NextResponse.json({ error: rpcErr.message }, { status: 400 })
  }

  console.log(`[generer] ✅ ${insertedCount} interventions insérées (transaction atomique)`)

  const interventionsForUI = rowsForUI.map(r => ({
    date:       r.date_prevue,
    dayName:    fmtWeekdayParis.format(new Date(r.date_prevue + 'T12:00:00')),
    heureDebut: r.heure_debut_prevue,
    heureFin:   r.heure_fin_prevue,
    agentId:    r.agent_id,
    agentNom:   null,
    batiment:   r.batiment,
    taches:     [],
    typePrincipal: 'hebdo',
  }))

  return NextResponse.json({
    count:         insertedCount as number,
    interventions: interventionsForUI,
    agentId:       effectiveAgentId,
    warnings,
  })
}

export { DAY_ISO }
