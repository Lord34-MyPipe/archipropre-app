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
export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { residenceId, dateDebut, interventions } = await req.json()
  if (!residenceId || !dateDebut || !Array.isArray(interventions) || interventions.length === 0)
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()

  // Vérifier ownership
  const { data: res } = await admin.from('residences')
    .select('id').eq('id', residenceId).eq('manager_id', managerId).single()
  if (!res) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Créer le planning
  const { data: planning, error: pErr } = await admin.from('plannings').insert({
    semaine: dateDebut,
    statut:  'publie',
    manager_id: managerId,
  }).select().single()

  if (pErr || !planning)
    return NextResponse.json({ error: pErr?.message ?? 'Erreur création planning' }, { status: 400 })

  // Insérer les interventions planifiées
  const rows = interventions.map((i: {
    date: string; agentId: string | null
    heureDebut: string; heureFin: string; typePrincipal: string
  }) => ({
    planning_id:  planning.id,
    residence_id: residenceId,
    agent_id:     i.agentId ?? null,
    date:         i.date,
    heure_debut:  i.heureDebut ?? null,
    heure_fin:    i.heureFin   ?? null,
    recurrence:   i.typePrincipal === 'hebdo' ? 'hebdo' : 'ponctuelle',
  }))

  const { error: iErr } = await admin.from('interventions_planifiees').insert(rows)
  if (iErr) {
    // Annuler le planning créé
    await admin.from('plannings').delete().eq('id', planning.id)
    return NextResponse.json({ error: iErr.message }, { status: 400 })
  }

  return NextResponse.json({ planningId: planning.id, count: rows.length })
}
