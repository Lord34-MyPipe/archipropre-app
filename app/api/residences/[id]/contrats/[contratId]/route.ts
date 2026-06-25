import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

const VALID_TYPES = ['parties_communes', 'containers', 'espaces_verts'] as const

type Params = Promise<{ id: string; contratId: string }>

async function resolveAndCheck(params: Params) {
  const { id: residenceId, contratId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) }

  const admin = await createAdminClient()

  const { data: residence } = await admin.from('residences')
    .select('id')
    .eq('id', residenceId)
    .eq('manager_id', user.id)
    .single()
  if (!residence) return { error: NextResponse.json({ error: 'Résidence introuvable ou non autorisée' }, { status: 403 }) }

  const { data: contrat } = await admin.from('contrats_residences')
    .select('id, residence_id, type_contrat, agent_prefere_id, actif')
    .eq('id', contratId)
    .eq('residence_id', residenceId)
    .single()
  if (!contrat) return { error: NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 }) }

  return { admin, user, residenceId, contratId, contratMeta: contrat }
}

// ── GET — détail complet d'un contrat ─────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const ctx = await resolveAndCheck(params)
  if ('error' in ctx) return ctx.error

  const { admin, contratId } = ctx

  const [{ data: contrat }, { data: societeParams }] = await Promise.all([
    admin.from('contrats_residences')
      .select('id, libelle, type_contrat, date_debut, date_fin, montant_mensuel, nb_interventions_mois, taux_horaire_facturation, creneaux_acceptes, jours_interdits, notes_specifiques, agent_prefere_id, actif')
      .eq('id', contratId)
      .single(),
    admin.from('parametres_societe')
      .select('taux_horaire_facturation_defaut')
      .limit(1)
      .maybeSingle(),
  ])

  if (!contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

  return NextResponse.json({
    ...contrat,
    tauxBase: societeParams?.taux_horaire_facturation_defaut ?? 25,
  })
}

// ── PATCH — édition d'un contrat ──────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const ctx = await resolveAndCheck(params)
  if ('error' in ctx) return ctx.error

  const { admin, user, residenceId, contratId, contratMeta } = ctx

  const body = await req.json()
  const {
    libelle, type_contrat, date_debut, date_fin,
    montant_mensuel, nb_interventions_mois,
    agent_prefere_id, taux_horaire_facturation,
    creneaux_acceptes, jours_interdits, notes_specifiques,
    actif,
  } = body

  // Validations
  if (libelle !== undefined) {
    const trimmed = typeof libelle === 'string' ? libelle.trim() : ''
    if (!trimmed) return NextResponse.json({ error: 'Le libellé ne peut pas être vide.' }, { status: 400 })
  }

  if (type_contrat !== undefined && !VALID_TYPES.includes(type_contrat)) {
    return NextResponse.json(
      { error: `type_contrat invalide. Valeurs acceptées : ${VALID_TYPES.join(', ')}` },
      { status: 400 },
    )
  }

  const effectiveDebut = date_debut ?? undefined
  const effectiveFin   = date_fin   ?? undefined
  if (effectiveDebut && effectiveFin && effectiveFin <= effectiveDebut) {
    return NextResponse.json({ error: 'date_fin doit être après date_debut.' }, { status: 400 })
  }

  // Construire l'objet de mise à jour (seulement les champs fournis, jamais qr_code_token)
  const patch: Record<string, unknown> = {}
  if (libelle !== undefined)                  patch.libelle = typeof libelle === 'string' ? libelle.trim() : libelle
  if (type_contrat !== undefined)             patch.type_contrat = type_contrat
  if (date_debut !== undefined)               patch.date_debut = date_debut
  if (date_fin !== undefined)                 patch.date_fin = date_fin
  if (montant_mensuel !== undefined)          patch.montant_mensuel = montant_mensuel
  if (nb_interventions_mois !== undefined)    patch.nb_interventions_mois = nb_interventions_mois
  if (agent_prefere_id !== undefined)         patch.agent_prefere_id = agent_prefere_id
  if (taux_horaire_facturation !== undefined) patch.taux_horaire_facturation = taux_horaire_facturation
  if (creneaux_acceptes !== undefined)        patch.creneaux_acceptes = creneaux_acceptes
  if (jours_interdits !== undefined)          patch.jours_interdits = jours_interdits
  if (notes_specifiques !== undefined)        patch.notes_specifiques = notes_specifiques
  if (actif !== undefined)                    patch.actif = actif

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour.' }, { status: 400 })
  }

  const { data: updated, error: patchErr } = await admin
    .from('contrats_residences')
    .update(patch)
    .eq('id', contratId)
    .select()
    .single()

  if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 400 })

  // Double-écriture agent_prefere_id → residences (transition P2-11)
  // Réplique uniquement si c'est le contrat parties_communes actif
  if (
    agent_prefere_id !== undefined &&
    contratMeta.type_contrat === 'parties_communes' &&
    contratMeta.actif
  ) {
    const { error: errResidence } = await admin
      .from('residences')
      .update({ agent_prefere_id })
      .eq('id', residenceId)
      .eq('manager_id', user.id)

    if (errResidence) {
      return NextResponse.json(
        { error: `Contrat mis à jour mais réplication résidence échouée : ${errResidence.message}` },
        { status: 500 },
      )
    }
  }

  return NextResponse.json(updated)
}

// ── DELETE — suppression (zone dangereuse) ────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const ctx = await resolveAndCheck(params)
  if ('error' in ctx) return ctx.error

  const { admin, contratId } = ctx

  // Guard serveur : compter les interventions liées (TOUS statuts)
  const { count, error: countErr } = await admin
    .from('interventions')
    .select('id', { count: 'exact', head: true })
    .eq('contrat_id', contratId)

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 400 })

  if ((count ?? 0) >= 1) {
    return NextResponse.json(
      {
        error: `Contrat avec historique (${count} intervention${count! > 1 ? 's' : ''}), suppression interdite. Utilisez la mise en sommeil.`,
      },
      { status: 409 },
    )
  }

  // Suppression transactionnelle via RPC (cascade zones + tâches, migration 018)
  const { error: rpcErr } = await admin.rpc('delete_contrat_cascade', {
    p_contrat_id: contratId,
  })

  if (rpcErr) {
    // La RPC RAISE une exception (incohérence DB ou guard interne) → 409
    return NextResponse.json({ error: rpcErr.message }, { status: 409 })
  }

  return NextResponse.json({ deleted: true })
}
