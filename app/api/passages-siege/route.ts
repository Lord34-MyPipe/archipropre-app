import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const ADRESSE_SIEGE_DEFAUT = '123 Rue de la Bandido, 34160 Castries'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profil } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profil || !['manager', 'directeur'].includes(profil.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await req.json()
  const { agent_id, commande_id, date, heure_prevue, motif, est_livraison_manager } = body as {
    agent_id: string
    commande_id: string | null
    date: string
    heure_prevue: string
    motif: string
    est_livraison_manager: boolean
  }

  if (!agent_id || !date || !heure_prevue || !motif) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  if (commande_id) {
    const { data: cmd } = await supabase
      .from('commandes_produits')
      .select('id, residences(manager_id)')
      .eq('id', commande_id)
      .maybeSingle()

    if (!cmd) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })

    const raw = (cmd as Record<string, unknown>).residences
    const residence = Array.isArray(raw) ? raw[0] : raw as { manager_id: string } | null
    if (residence?.manager_id !== user.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
  }

  const admin = await createAdminClient()

  const { data: passage, error: passErr } = await admin
    .from('passages_siege')
    .insert({
      agent_id,
      manager_id: user.id,
      commande_id: commande_id ?? null,
      date,
      heure_prevue,
      motif,
      statut: 'planifie',
      est_livraison_manager: est_livraison_manager ?? false,
    })
    .select('id')
    .single()

  if (passErr) return NextResponse.json({ error: passErr.message }, { status: 500 })

  if (commande_id) {
    await admin.from('commandes_produits').update({ statut: 'commande' }).eq('id', commande_id)
  }

  if (!est_livraison_manager) {
    const { data: params } = await admin
      .from('parametres_societe')
      .select('adresse_siege')
      .limit(1)
      .maybeSingle()

    const adresseSiege = (params as Record<string, unknown> | null)?.adresse_siege as string | null
      ?? ADRESSE_SIEGE_DEFAUT

    await admin.from('alertes').insert({
      type:            'passage_bureau',
      message:         `Passage au siège demandé le ${date} à ${heure_prevue.slice(0, 5)} — ${motif}`,
      destinataire_id: agent_id,
      lue:             false,
      metadata: {
        date,
        heure_prevue,
        motif,
        adresse_siege: adresseSiege,
        passage_id:    passage.id,
      },
    })
  }

  return NextResponse.json({ ok: true, passage_id: passage.id })
}
