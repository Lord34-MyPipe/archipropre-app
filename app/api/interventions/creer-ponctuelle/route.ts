import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['manager', 'directeur'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const body = await req.json() as {
    residence_id?:       string
    agent_id?:           string
    date_prevue?:        string   // 'YYYY-MM-DD'
    heure_debut_prevue?: string   // 'HH:MM'
    heure_fin_prevue?:   string   // 'HH:MM'
    tache_libelle?:      string
  }

  const { residence_id, agent_id, date_prevue, heure_debut_prevue, heure_fin_prevue, tache_libelle } = body

  if (!residence_id)  return NextResponse.json({ error: 'residence_id manquant' },  { status: 400 })
  if (!agent_id)      return NextResponse.json({ error: 'agent_id manquant' },      { status: 400 })
  if (!date_prevue)   return NextResponse.json({ error: 'date_prevue manquante' },  { status: 400 })
  if (!tache_libelle?.trim()) return NextResponse.json({ error: 'tache_libelle manquant' }, { status: 400 })

  const admin = await createAdminClient()

  // ── 1. Créer l'intervention ───────────────────────────────────────────────
  const { data: intervention, error: errInter } = await admin
    .from('interventions')
    .insert({
      agent_id,
      residence_id,
      date_prevue,
      heure_debut_prevue: heure_debut_prevue ?? null,
      heure_fin_prevue:   heure_fin_prevue   ?? null,
      statut:             'planifiee',
    })
    .select()
    .single()

  if (errInter || !intervention) {
    console.error('[creer-ponctuelle] insert intervention:', errInter?.message)
    return NextResponse.json({ error: errInter?.message ?? 'Erreur création intervention' }, { status: 500 })
  }

  // ── 2. Créer la tâche liée (tache_template_id = null = tâche ponctuelle) ──
  const { error: errTache } = await admin
    .from('taches_intervention')
    .insert({
      intervention_id:  intervention.id,
      tache_template_id: null,
      libelle:          tache_libelle.trim(),
      validee:          false,
    })

  if (errTache) {
    console.error('[creer-ponctuelle] insert tache_intervention:', errTache.message)
    // L'intervention est créée — on la signale mais on ne rollback pas côté API
    return NextResponse.json(
      { error: `Intervention créée (${intervention.id}) mais tâche non enregistrée : ${errTache.message}` },
      { status: 207 }
    )
  }

  return NextResponse.json(intervention, { status: 201 })
}
