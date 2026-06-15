import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

// POST — valider et publier le planning généré
// Body: { residenceId, dateDebut, dateFin, interventions[], forceRegenerate? }
export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { residenceId, dateDebut, dateFin, interventions, forceRegenerate } = await req.json()
  if (!residenceId || !dateDebut || !Array.isArray(interventions) || interventions.length === 0)
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()

  // Vérifier ownership
  const { data: res } = await admin.from('residences')
    .select('id').eq('id', residenceId).eq('manager_id', managerId).single()
  if (!res) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Calcul de la date de fin réelle (dernière date des interventions ou dateFin fourni)
  const lastDate: string = dateFin
    ?? interventions.reduce((max: string, i: { date: string }) => i.date > max ? i.date : max, dateDebut)

  // Récupérer les planning_ids de ce manager
  const { data: mgPlannings } = await admin.from('plannings')
    .select('id').eq('manager_id', managerId).eq('statut', 'publie')
  const planningIds = (mgPlannings ?? []).map(p => p.id)

  if (planningIds.length > 0) {
    // Vérifier si un planning existe déjà pour cette résidence sur cette période
    const { data: existing, count } = await admin.from('interventions_planifiees')
      .select('id, planning_id', { count: 'exact' })
      .eq('residence_id', residenceId)
      .in('planning_id', planningIds)
      .gte('date', dateDebut)
      .lte('date', lastDate)
      .limit(1)

    if ((count ?? 0) > 0 && !forceRegenerate) {
      // Compter le total exact pour le message
      const { count: totalCount } = await admin.from('interventions_planifiees')
        .select('id', { count: 'exact', head: true })
        .eq('residence_id', residenceId)
        .in('planning_id', planningIds)
        .gte('date', dateDebut)
        .lte('date', lastDate)

      return NextResponse.json({
        error: 'PLANNING_EXISTS',
        existingCount: totalCount ?? 0,
        message: `Un planning de ${totalCount} interventions existe déjà pour cette résidence sur cette période.`,
      }, { status: 409 })
    }

    if ((count ?? 0) > 0 && forceRegenerate) {
      // Supprimer les anciennes interventions planifiées pour cette résidence × période
      await admin.from('interventions_planifiees')
        .delete()
        .eq('residence_id', residenceId)
        .in('planning_id', planningIds)
        .gte('date', dateDebut)
        .lte('date', lastDate)

      // Supprimer les plannings devenus orphelins
      const { data: remaining } = await admin.from('interventions_planifiees')
        .select('planning_id')
        .in('planning_id', planningIds)
      const stillUsed = new Set((remaining ?? []).map(r => r.planning_id))
      const orphans = planningIds.filter(id => !stillUsed.has(id))
      if (orphans.length > 0) {
        await admin.from('plannings').delete().in('id', orphans)
      }
    }
  }

  // Créer le nouveau planning
  const { data: planning, error: pErr } = await admin.from('plannings').insert({
    semaine:    dateDebut,
    statut:     'publie',
    manager_id: managerId,
  }).select().single()

  if (pErr || !planning)
    return NextResponse.json({ error: pErr?.message ?? 'Erreur création planning' }, { status: 400 })

  // Récupérer les interventions réelles déjà existantes (en_cours ou terminee) pour cette résidence+période
  const { data: existingInters } = await admin.from('interventions')
    .select('agent_id, date_prevue')
    .eq('residence_id', residenceId)
    .in('statut', ['en_cours', 'terminee'])
    .gte('date_prevue', dateDebut)
    .lte('date_prevue', lastDate)

  const existingSet = new Set(
    (existingInters ?? []).map(i => `${i.agent_id ?? ''}|${i.date_prevue}`)
  )

  // Insérer les interventions planifiées (en excluant les jours où une vraie intervention existe déjà)
  const rows = interventions
    .filter((i: { date: string; agentId: string | null }) =>
      !existingSet.has(`${i.agentId ?? ''}|${i.date}`)
    )
    .map((i: {
    date: string; agentId: string | null
    heureDebut: string; heureFin: string; typePrincipal: string
  }) => ({
    planning_id:  planning.id,
    residence_id: residenceId,
    agent_id:     i.agentId ?? null,
    date:         i.date,
    heure_debut:  i.heureDebut ?? null,
    heure_fin:    i.heureFin   ?? null,
    recurrence:   i.typePrincipal === 'hebdo'              ? 'hebdo'
               : i.typePrincipal === 'contrainte_horaire' ? 'contrainte_horaire'
               : 'ponctuelle',
  }))

  if (rows.length === 0) {
    await admin.from('plannings').delete().eq('id', planning.id)
    return NextResponse.json({ error: 'Aucune intervention à planifier (toutes déjà réalisées ou en cours)' }, { status: 400 })
  }

  const { error: iErr } = await admin.from('interventions_planifiees').insert(rows)
  if (iErr) {
    await admin.from('plannings').delete().eq('id', planning.id)
    return NextResponse.json({ error: iErr.message }, { status: 400 })
  }

  return NextResponse.json({ planningId: planning.id, count: rows.length })
}
