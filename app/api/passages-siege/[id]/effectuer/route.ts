import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: passageId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const admin = await createAdminClient()

  const { data: passage } = await admin
    .from('passages_siege')
    .select('id, agent_id, manager_id, commande_id, date')
    .eq('id', passageId)
    .maybeSingle()

  if (!passage) return NextResponse.json({ error: 'Passage introuvable' }, { status: 404 })

  const p = passage as {
    id: string
    agent_id: string
    manager_id: string
    commande_id: string | null
    date: string
  }

  if (p.agent_id !== user.id && p.manager_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const now = new Date().toISOString()

  await admin.from('passages_siege').update({
    statut:         'effectue',
    heure_effectue: now,
  }).eq('id', passageId)

  if (p.commande_id) {
    await admin.from('commandes_produits').update({ statut: 'livre' }).eq('id', p.commande_id)
  }

  const { count } = await admin
    .from('interventions')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', p.agent_id)
    .eq('date_prevue', p.date)
    .in('statut', ['planifiee', 'en_cours'])

  const journeeCloturee = (count ?? 0) === 0

  if (journeeCloturee) {
    await admin.from('journees_agent').upsert(
      { agent_id: p.agent_id, date: p.date },
      { onConflict: 'agent_id,date', ignoreDuplicates: true },
    )
  }

  await admin.from('alertes').insert({
    type:            'commande_livree',
    message:         `Commande récupérée au siège`,
    destinataire_id: p.manager_id,
    lue:             false,
    metadata: { passage_id: passageId, commande_id: p.commande_id },
  })

  return NextResponse.json({ ok: true, journee_cloturee: journeeCloturee })
}
