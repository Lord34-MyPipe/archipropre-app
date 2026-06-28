import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

interface LigneInput {
  produit_id?: string | null
  type_ligne: 'produit' | 'ampoule'
  quantite: number
  localisation?: string | null
  photo_avant_path?: string | null
  photo_apres_path?: string | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: interventionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  // Récupérer l'intervention + résidence + manager
  const { data: inter } = await supabase
    .from('interventions')
    .select('id, residence_id, contrat_id, agent_id')
    .eq('id', interventionId)
    .eq('agent_id', user.id)
    .maybeSingle()
  if (!inter) return NextResponse.json({ error: 'Intervention introuvable' }, { status: 404 })

  const { data: residence } = await supabase
    .from('residences')
    .select('id, nom, manager_id')
    .eq('id', inter.residence_id)
    .maybeSingle()
  if (!residence) return NextResponse.json({ error: 'Résidence introuvable' }, { status: 404 })

  const { lignes }: { lignes: LigneInput[] } = await req.json()
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne fournie' }, { status: 400 })
  }

  // Créer la commande
  const { data: commande, error: cmdError } = await supabase
    .from('commandes_produits')
    .insert({
      intervention_id: interventionId,
      agent_id: user.id,
      residence_id: inter.residence_id,
      contrat_id: inter.contrat_id ?? null,
      statut: 'en_attente',
    })
    .select('id')
    .single()
  if (cmdError) return NextResponse.json({ error: cmdError.message }, { status: 500 })

  // Créer les lignes
  const lignesInsert = lignes.map(l => ({
    commande_id: commande.id,
    produit_id: l.produit_id ?? null,
    type_ligne: l.type_ligne,
    quantite: l.quantite,
    localisation: l.localisation ?? null,
    photo_avant_path: l.photo_avant_path ?? null,
    photo_apres_path: l.photo_apres_path ?? null,
  }))
  const { error: lignesError } = await supabase
    .from('lignes_commande')
    .insert(lignesInsert)
  if (lignesError) return NextResponse.json({ error: lignesError.message }, { status: 500 })

  // Alerte pour le manager (admin client, bypass RLS)
  if (residence.manager_id) {
    const admin = await createAdminClient()
    const { data: agentProfil } = await admin
      .from('profiles')
      .select('prenom, nom')
      .eq('id', user.id)
      .maybeSingle()
    const agentNom = agentProfil
      ? `${agentProfil.prenom ?? ''} ${agentProfil.nom ?? ''}`.trim()
      : user.email ?? user.id

    const nbLignes = lignes.length
    const nbAmpoules = lignes.filter(l => l.type_ligne === 'ampoule').length
    const detail = nbAmpoules > 0
      ? `${nbLignes} signalement(s) dont ${nbAmpoules} ampoule(s)`
      : `${nbLignes} produit(s)`

    await admin.from('alertes').insert({
      intervention_id: interventionId,
      type: 'commande_produit',
      message: `${agentNom} a signalé ${detail} à commander pour ${residence.nom}.`,
      destinataire_id: residence.manager_id,
      metadata: {
        agent_id: user.id,
        agent_nom: agentNom,
        residence_id: inter.residence_id,
        residence_nom: residence.nom,
        commande_id: commande.id,
        nb_lignes: nbLignes,
      },
    })
  }

  return NextResponse.json({ commande_id: commande.id })
}
