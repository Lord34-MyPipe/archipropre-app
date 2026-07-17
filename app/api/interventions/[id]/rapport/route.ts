import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { displayIdentifiant } from '@/lib/agent-identifiant'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: interventionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { commentaire } = await req.json().catch(() => ({ commentaire: '' }))

  // Charger l'intervention de référence + résidence + profil agent en parallèle
  const [{ data: inter }, { data: agentProfil }] = await Promise.all([
    supabase
      .from('interventions')
      .select('id, agent_id, residence_id, contrat_id, date_prevue, heure_fin_prevue, residences(nom, manager_id)')
      .eq('id', interventionId)
      .eq('agent_id', user.id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('prenom, nom, manager_id')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  if (!inter) return NextResponse.json({ error: 'Intervention introuvable' }, { status: 404 })

  const interRow    = inter as Record<string, unknown>
  const agentId      = interRow.agent_id as string
  const residenceId  = interRow.residence_id as string
  const contratId    = interRow.contrat_id as string | null
  const datePrevue   = interRow.date_prevue as string
  const heureFinRef  = interRow.heure_fin_prevue as string | null

  const residenceRaw = interRow.residences
  const residence = Array.isArray(residenceRaw) ? residenceRaw[0] : residenceRaw as { nom: string; manager_id: string } | null
  const managerId = agentProfil?.manager_id ?? residence?.manager_id ?? null

  const admin = await createAdminClient()

  // Retrouver toute la mission du jour : même triplet (agent_id, contrat_id,
  // date_prevue). Mono-bâtiment (pas de contrat_id) : on ne peut retrouver que
  // l'intervention elle-même — la clôture groupée dégénère naturellement au cas
  // simple, sans if/else (étape 9h).
  let missionQuery = admin
    .from('interventions')
    .select('id, heure_fin_prevue')
    .eq('agent_id', agentId)
    .eq('date_prevue', datePrevue)
    .neq('statut', 'annulee')
  missionQuery = contratId
    ? missionQuery.eq('contrat_id', contratId)
    : missionQuery.eq('id', interventionId)
  const { data: missionRaw } = await missionQuery
  const mission = (missionRaw && missionRaw.length > 0)
    ? missionRaw as { id: string; heure_fin_prevue: string | null }[]
    : [{ id: interventionId, heure_fin_prevue: heureFinRef }]

  // Même heure_fin (serveur) sur toute la mission → temps global cohérent
  // (heure_scan est déjà partagée sur tous les bâtiments depuis 9e).
  // disponible_apres_fin reste calculé PAR bâtiment : heure_fin_prevue diffère
  // selon le bâtiment, "terminé en avance" n'a de sens que ligne par ligne.
  const now = new Date().toISOString()
  await Promise.all(mission.map(m => {
    const disponible = m.heure_fin_prevue
      ? new Date(now) < new Date(`${datePrevue}T${m.heure_fin_prevue}`)
      : false
    return admin.from('interventions').update({
      statut:               'terminee',
      heure_fin:            now,
      disponible_apres_fin: disponible,
    }).eq('id', m.id)
  }))

  if (managerId) {
    const prenomAgent = agentProfil?.prenom || displayIdentifiant(user.email) || 'un agent'
    const nomAgentComplet = agentProfil ? `${agentProfil.prenom ?? ''} ${agentProfil.nom ?? ''}`.trim() : prenomAgent
    const nomResidence = residence?.nom ?? 'une résidence'
    const nbBatiments = mission.length

    // Une seule alerte pour toute la mission (pas une par bâtiment) — même
    // convention que scan_hors_planning : intervention_id=null, contexte en
    // metadata plutôt que rattaché arbitrairement à un seul bâtiment.
    await admin.from('alertes').insert({
      intervention_id: null,
      type:            'rapport_soumis',
      message:         `Rapport soumis — ${nomResidence}${nbBatiments > 1 ? ` (${nbBatiments} bâtiments)` : ''} par ${prenomAgent}${commentaire ? ' : ' + commentaire : ''}`,
      destinataire_id: managerId,
      lue:             false,
      metadata: {
        agent_id:          agentId,
        agent_nom:         nomAgentComplet,
        contrat_id:        contratId,
        residence_id:      residenceId,
        residence_nom:     nomResidence,
        date:              datePrevue,
        nb_batiments:      nbBatiments,
        intervention_ids:  mission.map(m => m.id),
      },
    })
  }

  return NextResponse.json({ ok: true })
}
