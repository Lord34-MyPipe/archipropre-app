import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic()

interface HistoriqueMessage {
  role: 'user' | 'assistant'
  content: string
}

function semaineCourante(): { debut: string; fin: string } {
  const now   = new Date()
  const day   = now.getDay() === 0 ? 7 : now.getDay()
  const lundi = new Date(now)
  lundi.setDate(now.getDate() - (day - 1))
  const vendredi = new Date(lundi)
  vendredi.setDate(lundi.getDate() + 6)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { debut: fmt(lundi), fin: fmt(vendredi) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { message, historique = [] }: { message: string; historique: HistoriqueMessage[] } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Message vide' }, { status: 400 })

  const admin    = await createAdminClient()
  const semaine  = semaineCourante()

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
          .select('id, agent_id, residence_id, date_prevue, heure_debut_prevue, heure_fin_prevue, statut, residences(nom), profiles(nom, prenom)')
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

  const systemPrompt = `Tu es le copilote planning d'Archipropre Services.
Tu as accès en temps réel aux données suivantes (semaine du ${semaine.debut} au ${semaine.fin}) :

AGENTS ET CHARGE :
${agentsStr}

CONFLITS CETTE SEMAINE :
${conflitsStr}

INTERVENTIONS SEMAINE COURANTE :
${interventionsStr}

ABSENCES ET CONGÉS :
${absencesStr}

RÈGLES :
- Réponds toujours en français, sois concis et actionnable.
- Quand tu proposes une réorganisation, donne l'impact chiffré (taux avant/après) pour chaque agent concerné.

RÈGLE HORAIRES : Les heures d'intervention ne sont PAS fixes sauf si le contrat de la résidence spécifie des creneaux_acceptes non vides. Quand tu détectes un chevauchement horaire, tu peux proposer de décaler l'heure de début d'une intervention pour éviter le conflit. L'heure de début doit rester dans les créneaux acceptés du contrat si définis, sinon entre 07:00 et 20:00. Pour décaler une intervention, utilise le type d'action "modifier_horaire" (voir format ci-dessous).

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
