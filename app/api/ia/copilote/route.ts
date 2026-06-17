import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { lireCacheTrajet, calculerTrajet, type ModeTrajet } from '@/lib/trajet'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic()

interface HistoriqueMessage {
  role: 'user' | 'assistant'
  content: string
}

function semaineDe(dateRef?: string | null): { debut: string; fin: string } {
  const base  = dateRef ? new Date(dateRef + 'T12:00:00') : new Date()
  const day   = base.getDay() === 0 ? 7 : base.getDay()
  const lundi = new Date(base)
  lundi.setDate(base.getDate() - (day - 1))
  const dimanche = new Date(lundi)
  dimanche.setDate(lundi.getDate() + 6)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { debut: fmt(lundi), fin: fmt(dimanche) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { message, historique = [], semaine: semaineParam }: {
    message: string
    historique: HistoriqueMessage[]
    semaine?: string | null
  } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Message vide' }, { status: 400 })

  const admin    = await createAdminClient()
  const semaine  = semaineDe(semaineParam)

  // ── Récupérer les agents du manager ──────────────────────────────────────────
  const { data: agentProfiles } = await admin
    .from('profiles')
    .select('id')
    .eq('manager_id', user.id)
    .eq('actif', true)
    .eq('role', 'agent')

  const agentIds = (agentProfiles ?? []).map(a => a.id)

  // ── Données en parallèle ─────────────────────────────────────────────────────
  const [
    { data: chargeData },
    { data: conflitsData },
    { data: interventionsData },
    { data: absencesData },
    { data: congesData },
  ] = await Promise.all([
    agentIds.length > 0
      ? admin.from('v_charge_agent').select('*').in('agent_id', agentIds)
      : Promise.resolve({ data: [] }),

    agentIds.length > 0
      ? admin.from('v_conflits_planning')
          .select('*')
          .in('agent_id', agentIds)
          .gte('date_prevue', semaine.debut)
          .lte('date_prevue', semaine.fin)
      : Promise.resolve({ data: [] }),

    agentIds.length > 0
      ? admin.from('interventions')
          .select('id, agent_id, residence_id, date_prevue, heure_debut_prevue, heure_fin_prevue, statut, residences(nom, lat, lng), profiles(nom, prenom, mode_deplacement, depart_lat, depart_lng)')
          .in('agent_id', agentIds)
          .gte('date_prevue', semaine.debut)
          .lte('date_prevue', semaine.fin)
          .neq('statut', 'annulee')
          .order('date_prevue')
      : Promise.resolve({ data: [] }),

    agentIds.length > 0
      ? admin.from('absences')
          .select('agent_id, date_debut, date_fin, profiles(nom, prenom)')
          .in('agent_id', agentIds)
          .lte('date_debut', semaine.fin)
          .gte('date_fin', semaine.debut)
      : Promise.resolve({ data: [] }),

    agentIds.length > 0
      ? admin.from('conges')
          .select('agent_id, date_debut, date_fin, profiles(nom, prenom)')
          .in('agent_id', agentIds)
          .lte('date_debut', semaine.fin)
          .gte('date_fin', semaine.debut)
          .eq('statut', 'approuve')
      : Promise.resolve({ data: [] }),
  ])

  // ── Formater les données pour le system prompt ────────────────────────────────
  type ChargeRow = {
    agent_id: string; nom_complet: string; taux_remplissage_pct: number
    capacite_disponible: number; mode_deplacement: string | null; secteur_libelle: string | null
  }
  type ConflitRow = {
    nom_agent?: string; agent_nom?: string
    residence_1_nom?: string; residence_nom_1?: string
    residence_2_nom?: string; residence_nom_2?: string
    date_prevue: string; duree_chevauchement_min?: number
  }
  type InterventionRow = {
    id: string; agent_id: string; date_prevue: string
    heure_debut_prevue: string | null; heure_fin_prevue: string | null; statut: string
    // Supabase retourne les relations en tableau ou objet selon le mode de requête
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    residences: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profiles: any
  }
  type AbsenceRow = {
    agent_id: string; date_debut: string; date_fin: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profiles: any
  }

  const agents        = (chargeData       ?? []) as ChargeRow[]
  const conflits      = (conflitsData     ?? []) as ConflitRow[]
  const interventions = (interventionsData ?? []) as unknown as InterventionRow[]
  const absences      = [...(absencesData ?? []), ...(congesData ?? [])] as unknown as AbsenceRow[]

  const agentsStr = agents.length > 0
    ? agents.map(a =>
        `agent_id=${a.agent_id} | ${a.nom_complet} | ${Math.round(a.taux_remplissage_pct)}% chargé | ${a.capacite_disponible.toFixed(1)}h libres | ${a.mode_deplacement ?? 'NC'} | ${a.secteur_libelle ?? 'NC'}`
      ).join('\n')
    : 'Aucun agent'

  const conflitsStr = conflits.length > 0
    ? conflits.map(c => {
        const nom  = c.nom_agent ?? c.agent_nom ?? '?'
        const r1   = c.residence_1_nom ?? c.residence_nom_1 ?? '?'
        const r2   = c.residence_2_nom ?? c.residence_nom_2 ?? '?'
        return `${nom} : ${r1} ET ${r2} le ${c.date_prevue}${c.duree_chevauchement_min ? ` (${c.duree_chevauchement_min} min chevauchement)` : ''}`
      }).join('\n')
    : 'Aucun conflit cette semaine'

  const interventionsStr = interventions.length > 0
    ? interventions.map(i => {
        const nom    = i.profiles ? `${i.profiles.prenom} ${i.profiles.nom}` : i.agent_id
        const res    = i.residences?.nom ?? '?'
        // UUIDs complets (36 chars) — ne pas tronquer
        const intId  = String(i.id)
        const agId   = String(i.agent_id)
        return `intervention_id=${intId} agent_id=${agId} | ${nom} | ${res} | ${i.date_prevue} ${i.heure_debut_prevue ?? '?'}→${i.heure_fin_prevue ?? '?'} | ${i.statut}`
      }).join('\n')
    : 'Aucune intervention cette semaine'

  const absencesStr = absences.length > 0
    ? absences.map(a => {
        const nom = a.profiles ? `${a.profiles.prenom} ${a.profiles.nom}` : a.agent_id
        return `${nom} : absent(e) du ${a.date_debut} au ${a.date_fin}`
      }).join('\n')
    : 'Aucune absence en cours'

  // ── Temps de trajet réels entre interventions consécutives ───────────────────
  // Grouper par (agent_id, date_prevue), trier par heure_debut, calculer trajets
  const trajetsLignes: string[] = []
  type GroupKey = string
  const groupes = new Map<GroupKey, typeof interventions>()
  for (const i of interventions) {
    const k: GroupKey = `${i.agent_id}|${i.date_prevue}`
    if (!groupes.has(k)) groupes.set(k, [])
    groupes.get(k)!.push(i)
  }

  await Promise.allSettled(
    [...groupes.entries()].map(async ([, group]) => {
      if (group.length < 2) return
      group.sort((a, b) => (a.heure_debut_prevue ?? '').localeCompare(b.heure_debut_prevue ?? ''))
      const nomAgent = group[0].profiles ? `${group[0].profiles.prenom} ${group[0].profiles.nom}` : group[0].agent_id
      const mode: ModeTrajet = (group[0].profiles?.mode_deplacement as ModeTrajet) ?? 'voiture'

      for (let idx = 0; idx < group.length - 1; idx++) {
        const curr = group[idx]
        const next = group[idx + 1]
        const latA = curr.residences?.lat as number | null
        const lngA = curr.residences?.lng as number | null
        const latB = next.residences?.lat as number | null
        const lngB = next.residences?.lng as number | null

        if (!latA || !lngA || !latB || !lngB) continue

        // D'abord cache, sinon OSRM (on n'attend pas plus de 6s)
        let trajet = await lireCacheTrajet(latA, lngA, latB, lngB, mode)
        if (!trajet) trajet = await calculerTrajet(latA, lngA, latB, lngB, mode)

        const resA = curr.residences?.nom ?? '?'
        const resB = next.residences?.nom ?? '?'
        trajetsLignes.push(
          `${nomAgent} le ${curr.date_prevue} : ${resA}→${resB} = ${trajet.duree_minutes} min (${trajet.distance_km} km, mode=${mode})${trajet.depuis_cache ? '' : ' [OSRM temps réel]'}`,
        )
      }
    })
  )

  const trajetsStr = trajetsLignes.length > 0 ? trajetsLignes.join('\n') : 'Aucun trajet inter-résidences calculé (GPS manquants ou interventions isolées)'

  const systemPrompt = `Tu es le copilote planning d'Archipropre Services.
Tu as accès en temps réel aux données suivantes (semaine du ${semaine.debut} au ${semaine.fin}) :

AGENTS ET CHARGE :
${agentsStr}

CONFLITS CETTE SEMAINE :
${conflitsStr}

INTERVENTIONS SEMAINE COURANTE :
${interventionsStr}

TEMPS DE TRAJET RÉELS ENTRE RÉSIDENCES (via OSRM) :
${trajetsStr}

ABSENCES ET CONGÉS :
${absencesStr}

RÈGLES :
- Réponds toujours en français, sois concis et actionnable.
- Quand tu proposes une réorganisation, donne l'impact chiffré (taux avant/après) pour chaque agent concerné.

RÈGLE HORAIRES OBLIGATOIRE : Quand tu affectes plusieurs interventions à un même agent le même jour, elles doivent OBLIGATOIREMENT être planifiées à la suite, jamais en simultané.

Algorithme à appliquer :
1. Pour chaque agent, trier ses interventions du jour par heure de début.
2. La première intervention commence à son heure normale ou à 08:00 par défaut.
3. Chaque intervention suivante commence à : heure_fin_intervention_précédente + temps_de_trajet_réel (section "TEMPS DE TRAJET" ci-dessus). Si le trajet n'est pas disponible, utiliser 15 min par défaut.
4. heure_fin = heure_debut + durée originale de l'intervention (heure_fin_prevue - heure_debut_prevue).

Exemple correct pour Marie le mardi :
- Cabinet Amma Avocats : 08:00 → 09:00 (1h)
- Cabinet Dentaire : 09:15 → 09:45 (30 min, après 15 min trajet)
- Agence MMA : 10:00 → 10:10 (10 min, après 15 min trajet)

Quand tu proposes des actions impliquant plusieurs interventions pour un même agent le même jour, inclure TOUJOURS un modifier_horaire pour CHAQUE intervention concernée, en calculant les heures séquentiellement. Ne jamais laisser deux interventions au même horaire pour le même agent.

Les heures doivent rester entre 07:00 et 20:00, ou dans les creneaux_acceptes du contrat si définis.

RÈGLE CAPACITÉ : Ne jamais proposer d'affecter plus d'interventions à un agent que sa capacite_disponible (en heures). Si la demande dépasse la capacité, répartir sur plusieurs agents disponibles et expliquer pourquoi.

- Quand une ou plusieurs actions sont applicables directement en base, termine ta réponse par un seul bloc [ACTIONS] contenant un tableau "actions". Tu peux combiner les deux types dans le même bloc. Format strict, SANS markdown autour :

[ACTIONS]
{"actions":[
  {"type":"reassigner_intervention","intervention_id":"<uuid-complet>","nouvel_agent_id":"<uuid-complet>","raison":"<explication courte>"},
  {"type":"modifier_horaire","intervention_id":"<uuid-complet>","nouvelle_heure_debut":"10:00","nouvelle_heure_fin":"11:30","raison":"<explication courte>"}
]}
[/ACTIONS]

- Si aucune action concrète n'est applicable, n'inclus PAS de bloc [ACTIONS].
- IMPORTANT : utilise TOUJOURS les UUIDs complets (36 caractères, format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) tels qu'ils apparaissent dans ce contexte. Ne tronque jamais un UUID.`

  const messages: Anthropic.MessageParam[] = [
    ...historique.map(h => ({ role: h.role, content: h.content } as Anthropic.MessageParam)),
    { role: 'user', content: message },
  ]

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2000,
    system:     systemPrompt,
    messages,
  })

  const fullText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.type === 'text' ? b.text : '')
    .join('')

  // ── Parser le bloc [ACTIONS] ──────────────────────────────────────────────────
  const actionsMatch = fullText.match(/\[ACTIONS\]([\s\S]*?)\[\/ACTIONS\]/)
  let actions: Record<string, unknown> | null = null
  let reponse = fullText

  if (actionsMatch) {
    reponse = fullText.replace(/\[ACTIONS\][\s\S]*?\[\/ACTIONS\]/, '').trim()
    try {
      const cleaned = actionsMatch[1]
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim()
      actions = JSON.parse(cleaned)
    } catch (e) {
      console.error('[copilote] Échec parsing actions:', e, '\nBrut:', actionsMatch[1])
    }
  }

  return NextResponse.json({ reponse, actions })
}
