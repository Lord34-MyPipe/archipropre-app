import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

const STATUT_ORDER: Record<string, number> = { actif: 0, futur: 1, sommeil: 2, termine: 3 }

function calcStatut(
  actif: boolean,
  dateDebut: string,
  dateFin: string,
  today: string,
): 'actif' | 'futur' | 'sommeil' | 'termine' {
  if (dateFin < today)              return 'termine'
  if (dateDebut > today)            return actif ? 'futur' : 'sommeil'
  if (!actif)                       return 'sommeil'
  return 'actif'
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: residenceId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const admin = await createAdminClient()

  // Ownership check
  const { data: residence } = await admin.from('residences')
    .select('id')
    .eq('id', residenceId)
    .eq('manager_id', user.id)
    .single()
  if (!residence) return NextResponse.json({ error: 'Résidence introuvable ou non autorisée' }, { status: 403 })

  // Aujourd'hui en Europe/Paris (même pattern que dashboard)
  const _dateFmt = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const todayStr = _dateFmt.format(new Date())

  // Fetch parallèle : contrats + contrat_id des zones + contrat_id des interventions
  const [
    { data: contratsRaw },
    { data: zonesRaw },
    { data: intRaw },
  ] = await Promise.all([
    admin.from('contrats_residences')
      .select('id, libelle, type_contrat, montant_mensuel, nb_interventions_mois, date_debut, date_fin, taux_horaire_facturation, creneaux_acceptes, agent_prefere_id, qr_code_token, actif')
      .eq('residence_id', residenceId)
      .order('date_debut', { ascending: false }),
    // Seulement les IDs pour compter — pas de transfert de données inutile
    admin.from('zones_residence')
      .select('contrat_id')
      .eq('residence_id', residenceId)
      .not('contrat_id', 'is', null),
    admin.from('interventions')
      .select('contrat_id')
      .eq('residence_id', residenceId)
      .not('contrat_id', 'is', null),
  ])

  const contrats = contratsRaw ?? []

  // Résolution batch des noms d'agents (évite N+1)
  const agentIds = [...new Set(contrats.map(c => c.agent_prefere_id).filter(Boolean))] as string[]
  const agentMap = new Map<string, { prenom: string; nom: string }>()
  if (agentIds.length > 0) {
    const { data: agents } = await admin.from('profiles')
      .select('id, prenom, nom')
      .in('id', agentIds)
    for (const a of agents ?? []) agentMap.set(a.id, { prenom: a.prenom, nom: a.nom })
  }

  // Comptages par contrat_id en JS (une seule passe)
  const zonesByContrat = new Map<string, number>()
  for (const z of zonesRaw ?? []) {
    if (z.contrat_id) zonesByContrat.set(z.contrat_id, (zonesByContrat.get(z.contrat_id) ?? 0) + 1)
  }
  const intByContrat = new Map<string, number>()
  for (const i of intRaw ?? []) {
    if (i.contrat_id) intByContrat.set(i.contrat_id, (intByContrat.get(i.contrat_id) ?? 0) + 1)
  }

  // Construction + tri
  const result = contrats
    .map(c => {
      const statut = calcStatut(c.actif ?? false, c.date_debut, c.date_fin, todayStr)
      const agent  = c.agent_prefere_id ? (agentMap.get(c.agent_prefere_id) ?? null) : null
      return {
        id:                       c.id,
        libelle:                  c.libelle,
        type_contrat:             c.type_contrat,
        montant_mensuel:          c.montant_mensuel,
        nb_interventions_mois:    c.nb_interventions_mois,
        date_debut:               c.date_debut,
        date_fin:                 c.date_fin,
        taux_horaire_facturation: c.taux_horaire_facturation,
        creneaux_acceptes:        c.creneaux_acceptes,
        agent_prefere_id:         c.agent_prefere_id,
        agent_prenom:             agent?.prenom ?? null,
        agent_nom:                agent?.nom    ?? null,
        qr_code_token:            c.qr_code_token,
        statut_calcule:           statut,
        nb_zones:                 zonesByContrat.get(c.id) ?? 0,
        nb_interventions:         intByContrat.get(c.id)   ?? 0,
      }
    })
    .sort((a, b) => {
      const diff = (STATUT_ORDER[a.statut_calcule] ?? 9) - (STATUT_ORDER[b.statut_calcule] ?? 9)
      if (diff !== 0) return diff
      return b.date_debut.localeCompare(a.date_debut)
    })

  return NextResponse.json(result)
}
