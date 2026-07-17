import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Rapport syndic (P3-2, étape S1) — payload de données brutes pour un futur
// export/écran client. INTERDIT ABSOLU : aucune durée, heure, coût, marge.
// Garde-fou : chaque SELECT ci-dessous liste explicitement ses colonnes,
// jamais SELECT * — une nouvelle colonne sensible ajoutée un jour sur
// interventions/contrats ne doit jamais fuiter ici par accident.

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre']

function isValidDate(s: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

// Libellé période — "Juin 2026" si [debut,fin] couvre exactement un mois
// civil, sinon "dd/mm/aaaa – dd/mm/aaaa". Calcul purement calendaire (Y-M-D),
// aucun new Date() dérivé d'un instant réel : pas de risque de fuseau horaire.
function formatPeriodeLibelle(debut: string, fin: string): string {
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

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id: residenceId } = await params
  const debut = req.nextUrl.searchParams.get('debut')
  const fin = req.nextUrl.searchParams.get('fin')
  const contratId = req.nextUrl.searchParams.get('contratId')

  if (!isValidDate(debut) || !isValidDate(fin)) {
    return NextResponse.json({ error: 'Paramètres debut/fin requis (format YYYY-MM-DD)' }, { status: 400 })
  }
  if (debut > fin) {
    return NextResponse.json({ error: 'debut doit être antérieur ou égal à fin' }, { status: 400 })
  }

  const admin = await createAdminClient()

  // Ownership : la résidence doit appartenir à ce manager
  const { data: residence } = await admin
    .from('residences')
    .select('id, nom, adresse')
    .eq('id', residenceId)
    .eq('manager_id', user.id)
    .maybeSingle()
  if (!residence) return NextResponse.json({ error: 'Résidence introuvable' }, { status: 404 })

  // Passages réalisés de la période — fusion de TOUS les contrats actifs de la
  // résidence par défaut ; contratId filtre sur un seul si fourni.
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
  // photos_zone (règle zoneComplete de l'écran agent : toutes les tâches de
  // la zone traitées + ≥1 photo), PAS zones_intervention (source non fiable,
  // cf. audit — cas constaté où heure_cloture manque malgré zone complète).
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

  // Regroupement par BÂTIMENT (libelle texte, null = mono-bâtiment — un seul
  // groupe, comportement inchangé pour ce cas).
  const groupes = new Map<string, { libelle: string | null; interventions: InterventionRow[] }>()
  for (const inter of interventions) {
    const key = inter.batiment ?? '__mono__'
    const g = groupes.get(key)
    if (g) g.interventions.push(inter)
    else groupes.set(key, { libelle: inter.batiment, interventions: [inter] })
  }

  const batiments = [...groupes.values()].map(g => {
    const datesPassage = [...new Set(g.interventions.map(i => i.date_prevue))].sort()

    const zonesTraitees = new Set<string>()
    const photos: { zone_nom: string; photo_url: string }[] = []
    const tachesNonRealisees: { zone_nom: string; libelle: string; commentaire: string; date: string }[] = []

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

  // Chiffre factuel demandé : nombre de JOURS de passage distincts, tous
  // bâtiments confondus (pas le nombre d'interventions-bâtiments — une
  // résidence multi-bâtiments visitée un jour donné = 1 passage, pas N).
  const nbPassages = new Set(interventions.map(i => i.date_prevue)).size

  return NextResponse.json({
    residence: { nom: residence.nom, adresse: residence.adresse },
    periode:   { debut, fin, libelle: formatPeriodeLibelle(debut, fin) },
    nb_passages: nbPassages,
    batiments,
  })
}
