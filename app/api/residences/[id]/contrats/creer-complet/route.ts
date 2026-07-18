import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { volumeHebdoMinutes } from '@/lib/prorata'

export const dynamic = 'force-dynamic'

const JOURS_VALIDES = new Set(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])

interface Creneau {
  jours: string[]
  heure_debut: string
  heure_fin: string
}
interface IdentiteInput {
  libelle: string
  type_contrat: string
  date_debut: string
  date_fin: string
  montant_mensuel: number | null
  taux_mode: 'base' | 'specifique'
  taux_specifique: number | null
  taux_base: number
}
interface TacheStructure {
  libelle: string
  frequence_type: string
  jours_semaine: string[]
  duree_minutes: number
}
interface ZoneStructure {
  nom: string
  taches: TacheStructure[]
}
interface BatimentStructure {
  nom: string
  zones: ZoneStructure[]
}
interface StructureInput {
  batiments: BatimentStructure[]
}
interface TourneeTransverseInput {
  libelle: string
  zones: string[]
}
interface DispatchJourInput {
  jour: string
  batiments_complets: string[]
  tournees_transverses: TourneeTransverseInput[]
  containers: 'sortie' | 'rentree' | null
  duree_totale_estimee_minutes: number
}

// ── Auth manager + ownership résidence (même pattern que resolveAndCheck des routes contrats) ──

async function resolveAndCheck(residenceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 403 }) }

  const admin = await createAdminClient()
  const { data: residence } = await admin.from('residences')
    .select('id')
    .eq('id', residenceId)
    .eq('manager_id', user.id)
    .single()
  if (!residence) return { error: NextResponse.json({ error: 'Résidence introuvable ou non autorisée' }, { status: 403 }) }

  return { admin, user, residenceId }
}

function dureeCreneauMinutes(c: Creneau): number {
  const [h1, m1] = c.heure_debut.split(':').map(Number)
  const [h2, m2] = c.heure_fin.split(':').map(Number)
  if (!Number.isFinite(h1) || !Number.isFinite(m1) || !Number.isFinite(h2) || !Number.isFinite(m2)) return 0
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: residenceId } = await params

  const ctx = await resolveAndCheck(residenceId)
  if ('error' in ctx) return ctx.error
  const { admin } = ctx

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })

  const { identite, agent_prefere_id, creneaux_acceptes, structure, jours_ramassage_containers, dispatch_semaine } = body as {
    identite?: IdentiteInput
    agent_prefere_id?: string | null
    creneaux_acceptes?: Creneau[]
    minutes_hebdo_reelles?: number // reçu mais non utilisé — recalculé côté serveur ci-dessous
    structure?: StructureInput
    jours_ramassage_containers?: string[]
    dispatch_semaine?: DispatchJourInput[]
  }

  // ── Validations ──────────────────────────────────────────────────────────

  if (!identite || !identite.libelle?.trim())
    return NextResponse.json({ error: 'Le libellé est obligatoire.' }, { status: 400 })

  if (!identite.date_debut || !identite.date_fin)
    return NextResponse.json({ error: 'Les dates de début et de fin sont obligatoires.' }, { status: 400 })

  if (identite.date_fin <= identite.date_debut)
    return NextResponse.json({ error: 'La date de fin doit être après la date de début.' }, { status: 400 })

  if (!Array.isArray(creneaux_acceptes) || creneaux_acceptes.length === 0)
    return NextResponse.json({ error: "L'organisation actuelle (créneaux de passage) est obligatoire." }, { status: 400 })

  const zones = (structure?.batiments ?? []).flatMap(b => b.zones ?? [])
  if (zones.length === 0)
    return NextResponse.json({ error: 'Au moins une zone est requise.' }, { status: 400 })

  // jours_semaine des tâches ⊆ jours des creneaux_acceptes
  const joursAutorises = new Set(creneaux_acceptes.flatMap(c => c.jours ?? []))
  const joursOrphelins = new Set<string>()
  for (const zone of zones) {
    for (const tache of zone.taches ?? []) {
      for (const jour of tache.jours_semaine ?? []) {
        if (JOURS_VALIDES.has(jour) && !joursAutorises.has(jour)) joursOrphelins.add(jour)
      }
    }
  }
  if (joursOrphelins.size > 0)
    return NextResponse.json({
      error: `Jour(s) hors des créneaux de passage actuels : ${[...joursOrphelins].join(', ')}. Ajustez les jours des tâches ou ajoutez un créneau couvrant ce(s) jour(s).`,
    }, { status: 400 })

  // ── Calcul serveur (ne fait pas confiance au client) ────────────────────

  const tauxEffectif = identite.taux_mode === 'specifique' && identite.taux_specifique
    ? identite.taux_specifique
    : identite.taux_base

  const minutesHebdoReelles = creneaux_acceptes.reduce(
    (sum, c) => sum + dureeCreneauMinutes(c) * (c.jours?.length ?? 0), 0,
  )

  const { data: societeParams } = await admin.from('parametres_societe')
    .select('taux_horaire_cible')
    .limit(1)
    .maybeSingle()
  const tauxCible = societeParams?.taux_horaire_cible ?? 30

  const plafondRentable      = volumeHebdoMinutes(identite.montant_mensuel ?? null, tauxCible)
  const ecartRentableMinutes = Math.round(minutesHebdoReelles - plafondRentable)

  // ── Appel RPC (transaction atomique — cf migration 031) ─────────────────

  const p_contrat = {
    libelle:                  identite.libelle.trim(),
    type_contrat:             identite.type_contrat,
    date_debut:               identite.date_debut,
    date_fin:                 identite.date_fin,
    montant_mensuel:          identite.montant_mensuel,
    nb_interventions_mois:    null,
    taux_horaire_facturation: identite.taux_mode === 'specifique' ? identite.taux_specifique : null,
    agent_prefere_id:         agent_prefere_id || null,
    creneaux_acceptes:        creneaux_acceptes,
    jours_interdits:          [],
    notes_specifiques:        null,
    minutes_hebdo_reelles:    Math.round(minutesHebdoReelles),
    ecart_rentable_minutes:   ecartRentableMinutes,
  }

  const { data: rpcResult, error: rpcErr } = await admin.rpc('creer_contrat_complet', {
    p_residence_id: residenceId,
    p_contrat,
    p_structure: structure,
  })

  if (rpcErr) {
    console.error('[creer-complet] RPC creer_contrat_complet échouée:', rpcErr.message)
    return NextResponse.json({ error: rpcErr.message }, { status: 400 })
  }

  const result = rpcResult as { contrat_id: string; nb_zones: number; nb_taches: number }

  // ── Double-écriture agent (règle P2-11) ──────────────────────────────────
  // residences.agent_prefere_id est un miroir synchronisé de
  // contrats_residences.agent_prefere_id pour le contrat parties_communes
  // (même pattern que /api/residences/affecter). Sans cette synchro,
  // v_etat_residence (qui lit residences.agent_prefere_id) reste bloquée sur
  // a_configurer/a_agent=false même quand le contrat a bien un agent.
  if (p_contrat.agent_prefere_id && identite.type_contrat === 'parties_communes') {
    const { error: errResidence } = await admin.from('residences')
      .update({ agent_prefere_id: p_contrat.agent_prefere_id })
      .eq('id', residenceId)
    if (errResidence) {
      console.error('[creer-complet] Échec sync residences.agent_prefere_id:', errResidence.message)
      return NextResponse.json({ error: 'Échec sync agent résidence: ' + errResidence.message }, { status: 400 })
    }
  }

  // ── Répartition semaine (jours_ramassage_containers + dispatch_semaine) ──
  // Colonnes ajoutées par la migration 032, hors périmètre de la RPC 031 —
  // écrites ici via une UPDATE de suivi, seulement si fournies par le wizard.
  if (jours_ramassage_containers !== undefined || dispatch_semaine !== undefined) {
    const patch: Record<string, unknown> = {}
    if (jours_ramassage_containers !== undefined) patch.jours_ramassage_containers = jours_ramassage_containers
    if (dispatch_semaine !== undefined)           patch.dispatch_semaine = dispatch_semaine
    const { error: errDispatch } = await admin.from('contrats_residences')
      .update(patch)
      .eq('id', result.contrat_id)
    if (errDispatch) {
      console.error('[creer-complet] Échec écriture répartition semaine:', errDispatch.message)
      return NextResponse.json({ error: 'Contrat créé mais échec écriture répartition semaine: ' + errDispatch.message }, { status: 400 })
    }
  }

  return NextResponse.json({
    contrat_id: result.contrat_id,
    nb_zones:   result.nb_zones,
    nb_taches:  result.nb_taches,
  }, { status: 201 })
}
