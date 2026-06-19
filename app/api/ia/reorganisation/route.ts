import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic()

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

function joursOuvres(debut: string, fin: string): number {
  let count = 0
  const d = new Date(debut + 'T12:00:00Z')
  const f = new Date(fin + 'T12:00:00Z')
  while (d <= f) {
    const jour = d.getUTCDay()
    if (jour !== 0 && jour !== 6) count++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return count
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { agent_id, date_debut, date_fin, intervention_ids } = body as {
    agent_id: string
    date_debut: string
    date_fin: string
    intervention_ids: string[]
  }

  if (!agent_id || !date_debut || !date_fin || !intervention_ids?.length) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  const admin = await createAdminClient()

  // ── 4 fetches en parallèle ─────────────────────────────────────────────────

  const [
    { data: orphelinesRaw },
    { data: agentAbsent },
    { data: autresAgentsRaw },
    { data: parametres },
  ] = await Promise.all([

    // 1. Interventions orphelines avec contexte complet
    admin.from('interventions')
      .select(`
        id, date_prevue, heure_debut_prevue, heure_fin_prevue,
        residences(nom, adresse, lat, lng,
          contrats_residences(creneaux_acceptes, actif))
      `)
      .in('id', intervention_ids)
      .order('date_prevue'),

    // 2. Profil de l'agent absent
    admin.from('profiles')
      .select('prenom, nom, contrat_heures_hebdo, mode_deplacement, secteur_libelle')
      .eq('id', agent_id)
      .single(),

    // 3. Autres agents du même manager (v_charge_agent non paramétrable → requête directe)
    admin.from('profiles')
      .select(`
        id, prenom, nom, contrat_heures_hebdo, seuil_cible_pct,
        mode_deplacement, secteur_libelle, depart_lat, depart_lng,
        binome_agent_id
      `)
      .eq('role', 'agent')
      .eq('actif', true)
      .eq('manager_id', managerId)
      .neq('id', agent_id),

    // 4. Paramètres société (taux horaire pour contexte)
    admin.from('parametres_societe')
      .select('taux_horaire_agent')
      .single(),
  ])

  const orphelines = (orphelinesRaw ?? []) as Row[]
  const autresAgents = (autresAgentsRaw ?? []) as Row[]

  // ── Charge réelle de chaque agent sur la période d'absence ────────────────

  const chargesParAgent: Row[] = await Promise.all(
    autresAgents.map(async (agent) => {
      const { data: ints } = await admin
        .from('interventions')
        .select('heure_debut_prevue, heure_fin_prevue')
        .eq('agent_id', agent.id)
        .eq('statut', 'planifiee')
        .gte('date_prevue', date_debut)
        .lte('date_prevue', date_fin)

      const minutesPlanifiees = (ints ?? []).reduce((sum: number, i: Row) => {
        if (!i.heure_debut_prevue || !i.heure_fin_prevue) return sum
        const [hd, md] = i.heure_debut_prevue.substring(0, 5).split(':').map(Number)
        const [hf, mf] = i.heure_fin_prevue.substring(0, 5).split(':').map(Number)
        return sum + ((hf * 60 + mf) - (hd * 60 + md))
      }, 0)

      const nbJours = joursOuvres(date_debut, date_fin)
      const capaciteMinutes = (agent.contrat_heures_hebdo / 5) * nbJours * 60

      return {
        ...agent,
        minutes_planifiees: minutesPlanifiees,
        capacite_minutes:   capaciteMinutes,
        taux_charge_pct:    capaciteMinutes > 0
          ? Math.round((minutesPlanifiees / capaciteMinutes) * 100)
          : 0,
      }
    })
  )

  // ── Construction des prompts ───────────────────────────────────────────────

  const systemPrompt = `Tu es ANA, le moteur de réorganisation d'Archipropre.
Tu reçois des interventions orphelines (agent absent) et une liste d'agents disponibles avec leur charge.
Tu dois produire un plan de redistribution JSON STRICT.

RÈGLES ABSOLUES :
- Répondre UNIQUEMENT en JSON valide, aucun texte avant ou après
- Ne jamais inventer un agent_id, utiliser UNIQUEMENT les IDs fournis
- Ne jamais inventer une intervention_id, utiliser UNIQUEMENT les IDs fournis
- Pour chaque intervention : soit proposer un agent (redistribuer), soit recommander l'annulation
- Signaler tout dépassement de capacité ou conflit horaire dans "avertissements"
- Le champ "raison" est obligatoire pour les annulations

FORMAT DE RÉPONSE OBLIGATOIRE :
{
  "redistribuer": [
    {
      "intervention_id": "uuid-exact",
      "agent_id_propose": "uuid-exact",
      "agent_nom": "Prénom Nom",
      "charge_apres_pct": 87,
      "avertissements": []
    }
  ],
  "annuler": [
    {
      "intervention_id": "uuid-exact",
      "raison": "Aucun agent disponible sur ce créneau"
    }
  ],
  "resume": "12 interventions redistribuées sur 3 agents. 2 annulations suggérées faute de disponibilité."
}`

  const orphelinesStr = orphelines.map(i => {
    const res = i.residences as Row | null
    const contrats = Array.isArray(res?.contrats_residences) ? res.contrats_residences : []
    const contratActif = contrats.find((c: Row) => c.actif) ?? null
    return `- ID: ${i.id}
  Résidence: ${res?.nom ?? '?'} (${res?.adresse ?? '?'})
  Date: ${i.date_prevue} | ${i.heure_debut_prevue ?? '?'}→${i.heure_fin_prevue ?? '?'}
  Créneaux acceptés: ${JSON.stringify(contratActif?.creneaux_acceptes ?? 'non défini')}
  GPS: ${res?.lat ?? '?'},${res?.lng ?? '?'}`
  }).join('\n')

  const agentsStr = chargesParAgent.map(a =>
    `- ID: ${a.id}
  Nom: ${a.prenom} ${a.nom}
  Mode: ${a.mode_deplacement ?? 'voiture'}
  Secteur: ${a.secteur_libelle ?? 'non défini'}
  Charge sur la période: ${a.taux_charge_pct}% (${Math.round(a.minutes_planifiees / 60 * 10) / 10}h / ${Math.round(a.capacite_minutes / 60 * 10) / 10}h)
  Seuil cible: ${a.seuil_cible_pct ?? 80}%
  Binôme: ${a.binome_agent_id ? 'oui' : 'non'}`
  ).join('\n')

  const userPrompt = `AGENT ABSENT : ${agentAbsent?.prenom ?? '?'} ${agentAbsent?.nom ?? '?'}
PÉRIODE : ${date_debut} → ${date_fin}
TAUX HORAIRE AGENT : ${parametres?.taux_horaire_agent ?? 'non défini'}€/h

INTERVENTIONS ORPHELINES (${orphelines.length}) :
${orphelinesStr}

AGENTS DISPONIBLES (${chargesParAgent.length}) :
${agentsStr}

Produis le plan de redistribution optimal. Privilégie les agents du même secteur et avec la charge la plus faible. Signale tout dépassement.`

  // ── Appel Anthropic ────────────────────────────────────────────────────────

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2000,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userPrompt }],
  })

  const planText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')

  let plan
  try {
    const clean = planText.replace(/```json|```/g, '').trim()
    plan = JSON.parse(clean)
  } catch {
    return NextResponse.json({ error: 'Réponse IA invalide', raw: planText }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    plan,
    context: {
      agent_absent:  `${agentAbsent?.prenom ?? '?'} ${agentAbsent?.nom ?? '?'}`,
      periode:       `${date_debut} → ${date_fin}`,
      nb_orphelines: orphelines.length,
    },
  })
}
