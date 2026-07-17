import type { SupabaseClient } from '@supabase/supabase-js'

// Rapport syndic (P3-2) — construction du payload, PARTAGÉE entre :
// - GET /api/residences/[id]/rapport-syndic (S1, vue manager live)
// - POST /api/residences/[id]/rapport-syndic/lien (S5, snapshot figé au moment
//   de la génération du lien)
// - app/rapport/[token]/page.tsx (S5, page publique — resigne les photos du
//   snapshot à chaque vue, ne reconstruit jamais les données)
// Une seule source de vérité pour le calcul : ne doit JAMAIS diverger entre
// ces appelants. INTERDIT ABSOLU dans le payload : aucune durée, heure, coût,
// marge. Garde-fou : chaque SELECT liste explicitement ses colonnes, jamais
// SELECT *.

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function isValidDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

// Libellé période — "Juin 2026" si [debut,fin] couvre exactement un mois
// civil, sinon "dd/mm/aaaa – dd/mm/aaaa". Calcul purement calendaire (Y-M-D),
// aucun new Date() dérivé d'un instant réel : pas de risque de fuseau horaire.
export function formatPeriodeLibelle(debut: string, fin: string): string {
  const [ay, am, ad] = debut.split('-').map(Number)
  const [by, bm, bd] = fin.split('-').map(Number)
  const dernierJourMoisDebut = new Date(Date.UTC(ay, am, 0)).getUTCDate()
  const debutEstPremierJour = ad === 1
  const finEstDernierJourMemeMois = ay === by && am === bm && bd === dernierJourMoisDebut

  if (debutEstPremierJour && finEstDernierJourMemeMois) {
    const mois = MOIS_FR[am - 1]
    return `${mois.charAt(0).toUpperCase()}${mois.slice(1)} ${ay}`
  }
  const fmt = (d: number, m: number, y: number) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
  return `${fmt(ad, am, ay)} – ${fmt(bd, bm, by)}`
}

export interface PhotoPayload {
  zone_nom: string
  photo_url: string
  signed_url?: string | null
}
export interface TacheNonRealiseePayload {
  zone_nom: string
  libelle: string
  commentaire: string
  date: string
}
export interface BatimentPayload {
  libelle: string | null
  dates_passage: string[]
  zones_traitees: string[]
  photos: PhotoPayload[]
  taches_non_realisees: TacheNonRealiseePayload[]
}
export interface RapportSyndicPayload {
  residence: { nom: string; adresse: string | null }
  periode: { debut: string; fin: string; libelle: string }
  nb_passages: number
  batiments: BatimentPayload[]
}

interface TacheRow {
  intervention_id: string
  zone_nom: string | null
  statut_tache: string
  libelle: string
  commentaire: string | null
}
interface PhotoRow {
  intervention_id: string
  zone_nom: string
  photo_url: string
}
interface InterventionRow {
  id: string
  batiment: string | null
  date_prevue: string
}

// Construit le payload avec les chemins storage BRUTS (pas de signed_url) —
// la signature est une étape séparée (signerPhotos), volontairement pour que
// le snapshot S5 puisse stocker les chemins bruts sans jamais persister
// d'URL signée (qui expirerait). L'ownership (résidence ↔ manager) est
// vérifiée par l'appelant AVANT d'invoquer cette fonction, pas ici.
export async function construireRapportSyndic(
  admin: SupabaseClient,
  params: { residenceId: string; debut: string; fin: string; contratId?: string | null }
): Promise<RapportSyndicPayload | null> {
  const { residenceId, debut, fin, contratId } = params

  const { data: residence } = await admin
    .from('residences')
    .select('id, nom, adresse')
    .eq('id', residenceId)
    .maybeSingle()
  if (!residence) return null

  let interQuery = admin
    .from('interventions')
    .select('id, batiment, date_prevue')
    .eq('residence_id', residenceId)
    .gte('date_prevue', debut)
    .lte('date_prevue', fin)
    .in('statut', ['terminee', 'validee'])
  if (contratId) interQuery = interQuery.eq('contrat_id', contratId)
  const { data: interventionsRaw } = await interQuery as { data: InterventionRow[] | null }

  const interventions = interventionsRaw ?? []
  const interventionIds = interventions.length
    ? interventions.map(i => i.id)
    : ['00000000-0000-0000-0000-000000000000']

  const [{ data: tachesRaw }, { data: photosRaw }] = await Promise.all([
    admin.from('taches_intervention')
      .select('intervention_id, zone_nom, statut_tache, libelle, commentaire')
      .in('intervention_id', interventionIds),
    admin.from('photos_zone')
      .select('intervention_id, zone_nom, photo_url')
      .in('intervention_id', interventionIds),
  ]) as [{ data: TacheRow[] | null }, { data: PhotoRow[] | null }]

  const tachesParIntervention = new Map<string, TacheRow[]>()
  for (const t of tachesRaw ?? []) {
    const arr = tachesParIntervention.get(t.intervention_id)
    if (arr) arr.push(t)
    else tachesParIntervention.set(t.intervention_id, [t])
  }

  const photosParIntervention = new Map<string, PhotoRow[]>()
  for (const p of photosRaw ?? []) {
    const arr = photosParIntervention.get(p.intervention_id)
    if (arr) arr.push(p)
    else photosParIntervention.set(p.intervention_id, [p])
  }

  // Zones traitées d'une intervention — dérivées de taches_intervention +
  // photos_zone (règle zoneComplete de l'écran agent), PAS zones_intervention
  // (source non fiable, cf. audit — cas constaté où heure_cloture manque
  // malgré zone complète).
  function zonesCompletesDe(interventionId: string): string[] {
    const taches = tachesParIntervention.get(interventionId) ?? []
    const photos = photosParIntervention.get(interventionId) ?? []
    const photoZones = new Set(photos.map(p => p.zone_nom))

    const parZone = new Map<string, TacheRow[]>()
    for (const t of taches) {
      const zone = t.zone_nom ?? 'Général'
      const arr = parZone.get(zone)
      if (arr) arr.push(t)
      else parZone.set(zone, [t])
    }

    const completes: string[] = []
    for (const [zone, zt] of parZone) {
      const toutesTraitees = zt.length > 0 && zt.every(t => t.statut_tache === 'realisee' || t.statut_tache === 'non_realisee')
      if (toutesTraitees && photoZones.has(zone)) completes.push(zone)
    }
    return completes
  }

  const groupes = new Map<string, { libelle: string | null; interventions: InterventionRow[] }>()
  for (const inter of interventions) {
    const key = inter.batiment ?? '__mono__'
    const g = groupes.get(key)
    if (g) g.interventions.push(inter)
    else groupes.set(key, { libelle: inter.batiment, interventions: [inter] })
  }

  const batiments: BatimentPayload[] = [...groupes.values()].map(g => {
    const datesPassage = [...new Set(g.interventions.map(i => i.date_prevue))].sort()

    const zonesTraitees = new Set<string>()
    const photos: PhotoPayload[] = []
    const tachesNonRealisees: TacheNonRealiseePayload[] = []

    for (const inter of g.interventions) {
      for (const zone of zonesCompletesDe(inter.id)) zonesTraitees.add(zone)

      for (const p of (photosParIntervention.get(inter.id) ?? [])) {
        photos.push({ zone_nom: p.zone_nom, photo_url: p.photo_url })
      }

      for (const t of (tachesParIntervention.get(inter.id) ?? [])) {
        if (t.statut_tache === 'non_realisee' && t.commentaire && t.commentaire.trim() !== '') {
          tachesNonRealisees.push({
            zone_nom:    t.zone_nom ?? 'Général',
            libelle:     t.libelle,
            commentaire: t.commentaire,
            date:        inter.date_prevue,
          })
        }
      }
    }

    return {
      libelle:              g.libelle,
      dates_passage:        datesPassage,
      zones_traitees:       [...zonesTraitees].sort((a, b) => a.localeCompare(b, 'fr')),
      photos,
      taches_non_realisees: tachesNonRealisees,
    }
  }).sort((a, b) => (a.libelle ?? '').localeCompare(b.libelle ?? '', 'fr'))

  // Chiffre factuel : nombre de JOURS de passage distincts, tous bâtiments
  // confondus (pas le nombre d'interventions-bâtiments).
  const nbPassages = new Set(interventions.map(i => i.date_prevue)).size

  return {
    residence: { nom: residence.nom, adresse: residence.adresse },
    periode:   { debut, fin, libelle: formatPeriodeLibelle(debut, fin) },
    nb_passages: nbPassages,
    batiments,
  }
}

// Signe les photos (bucket privé photos-interventions, 1h) à partir des
// chemins bruts déjà présents sur les bâtiments. Jamais stockée : appelée à
// CHAQUE affichage (S1 live ou page publique du snapshot S5).
export async function signerPhotos(admin: SupabaseClient, batiments: BatimentPayload[]): Promise<BatimentPayload[]> {
  const bucket = admin.storage.from('photos-interventions')
  const chemins = new Set<string>()
  for (const b of batiments) for (const p of b.photos) chemins.add(p.photo_url)

  const signedUrlByPath = new Map<string, string | null>()
  await Promise.all(
    [...chemins].map(async chemin => {
      const { data } = await bucket.createSignedUrl(chemin, 3600)
      signedUrlByPath.set(chemin, data?.signedUrl ?? null)
    })
  )

  return batiments.map(b => ({
    ...b,
    photos: b.photos.map(p => ({ ...p, signed_url: signedUrlByPath.get(p.photo_url) ?? null })),
  }))
}
