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
    binome_agent_id?:    string   // présent si intervention binôme
    date_prevue?:        string   // 'YYYY-MM-DD'
    heure_debut_prevue?: string   // 'HH:MM'
    heure_fin_prevue?:   string   // 'HH:MM' — déjà réduit par facteur_binome si binôme
    tache_libelle?:      string
  }

  const { residence_id, agent_id, binome_agent_id, date_prevue, heure_debut_prevue, heure_fin_prevue, tache_libelle } = body

  if (!residence_id)           return NextResponse.json({ error: 'residence_id manquant' },  { status: 400 })
  if (!agent_id)               return NextResponse.json({ error: 'agent_id manquant' },      { status: 400 })
  if (!date_prevue)            return NextResponse.json({ error: 'date_prevue manquante' },  { status: 400 })
  if (!tache_libelle?.trim())  return NextResponse.json({ error: 'tache_libelle manquant' }, { status: 400 })

  const admin = await createAdminClient()
  const isBinome = !!binome_agent_id

  // ── Création agent principal ──────────────────────────────────────────────────
  const { data: intervention1, error: err1 } = await admin
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

  if (err1 || !intervention1) {
    console.error('[creer-ponctuelle] insert intervention1:', err1?.message)
    return NextResponse.json({ error: err1?.message ?? 'Erreur création intervention' }, { status: 500 })
  }

  const { error: errTache1 } = await admin
    .from('taches_intervention')
    .insert({
      intervention_id:   intervention1.id,
      tache_template_id: null,
      libelle:           tache_libelle.trim(),
      validee:           false,
    })

  if (errTache1) {
    // Rollback intervention1
    await admin.from('interventions').delete().eq('id', intervention1.id)
    console.error('[creer-ponctuelle] insert tache1 + rollback:', errTache1.message)
    return NextResponse.json({ error: `Erreur tâche agent principal : ${errTache1.message}` }, { status: 500 })
  }

  // ── Création intervention miroir binôme (si applicable) ───────────────────────
  if (isBinome) {
    const { data: intervention2, error: err2 } = await admin
      .from('interventions')
      .insert({
        agent_id:           binome_agent_id,
        residence_id,
        date_prevue,
        heure_debut_prevue: heure_debut_prevue ?? null,
        heure_fin_prevue:   heure_fin_prevue   ?? null,
        statut:             'planifiee',
      })
      .select()
      .single()

    if (err2 || !intervention2) {
      // Rollback intervention1 + tache1
      await admin.from('taches_intervention').delete().eq('intervention_id', intervention1.id)
      await admin.from('interventions').delete().eq('id', intervention1.id)
      console.error('[creer-ponctuelle] insert intervention2 + rollback:', err2?.message)
      return NextResponse.json({ error: `Erreur création intervention binôme : ${err2?.message}` }, { status: 500 })
    }

    const { error: errTache2 } = await admin
      .from('taches_intervention')
      .insert({
        intervention_id:   intervention2.id,
        tache_template_id: null,
        libelle:           tache_libelle.trim(),
        validee:           false,
      })

    if (errTache2) {
      // Rollback tout
      await admin.from('interventions').delete().eq('id', intervention2.id)
      await admin.from('taches_intervention').delete().eq('intervention_id', intervention1.id)
      await admin.from('interventions').delete().eq('id', intervention1.id)
      console.error('[creer-ponctuelle] insert tache2 + rollback total:', errTache2.message)
      return NextResponse.json({ error: `Erreur tâche agent binôme : ${errTache2.message}` }, { status: 500 })
    }

    return NextResponse.json({ intervention1, intervention2, binome: true }, { status: 201 })
  }

  return NextResponse.json(intervention1, { status: 201 })
}
