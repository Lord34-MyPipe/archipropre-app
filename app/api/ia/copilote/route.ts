import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { lireCacheTrajet, calculerTrajet, type ModeTrajet } from '@/lib/trajet'
import { geocoder } from '@/lib/geocodage'

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

  // ── Date du jour côté serveur, fuseau Europe/Paris ───────────────────────────
  // toISOString() est UTC — en pleine nuit française on obtiendrait la veille.
  // On passe par Intl pour obtenir la date locale réelle à Montpellier.
  const maintenant  = new Date()
  const TZ          = 'Europe/Paris'
  // YYYY-MM-DD en heure Paris
  const dateJourISO = new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(maintenant)
  // "demain" : on incrémente à partir de la date Paris, pas UTC
  const [pyear, pmonth, pday] = dateJourISO.split('-').map(Number)
  const demainParis = new Date(pyear, pmonth - 1, pday + 1)  // objet local JS — on n'utilise que les champs numériques
  const demainISO   = `${demainParis.getFullYear()}-${String(demainParis.getMonth() + 1).padStart(2, '0')}-${String(demainParis.getDate()).padStart(2, '0')}`
  // Libellé lisible en français
  const dateJourLisible = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(maintenant)

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
    { data: residencesData },
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
          .select('id, agent_id, residence_id, date_prevue, heure_debut_prevue, heure_fin_prevue, statut, residences(nom, lat, lng), profiles(nom, prenom, mode_deplacement)')
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

    // Toutes les résidences du manager (même sans planning actif)
    admin.from('residences')
      .select('id, nom, adresse, lat, lng, actif')
      .eq('manager_id', user.id)
      .order('nom'),
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
  type ResidenceRow = {
    id: string; nom: string; adresse: string | null
    lat: number | null; lng: number | null; actif: boolean
  }

  const agents        = (chargeData       ?? []) as ChargeRow[]
  const conflits      = (conflitsData     ?? []) as ConflitRow[]
  const interventions = (interventionsData ?? []) as unknown as InterventionRow[]
  const absences      = [...(absencesData ?? []), ...(congesData ?? [])] as unknown as AbsenceRow[]
  const residences    = (residencesData   ?? []) as ResidenceRow[]

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

  const residencesStr = residences.length > 0
    ? residences.map(r => {
        const gps   = (r.lat != null && r.lng != null) ? `lat=${r.lat},lng=${r.lng}` : 'GPS manquant'
        const etat  = r.actif ? 'actif' : 'inactif'
        return `residence_id=${r.id} | ${r.nom} | ${r.adresse ?? 'adresse inconnue'} | ${gps} | ${etat}`
      }).join('\n')
    : 'Aucune résidence'

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

DATE DU JOUR : ${dateJourLisible} (${dateJourISO}) — fuseau Europe/Paris
Quand le manager dit "aujourd'hui", utilise ${dateJourISO}. "Demain" = ${demainISO}. Ne jamais inventer une date passée ou future arbitraire.

RÈGLE ABSOLUE — ANTI-HALLUCINATION :
Tu ne dois JAMAIS affirmer avoir créé, modifié, affecté ou supprimé quoi que ce soit en base de données.
Tu ne fais que PROPOSER. Toute action réelle passe obligatoirement par une validation explicite du manager via un bouton dans l'interface.
N'écris jamais "c'est créé", "c'est fait", "intervention enregistrée", "client ajouté" ni aucune formulation similaire.
Si tu ne peux pas matérialiser une demande par une proposition structurée (bloc [ACTIONS], [PROPOSITION_CLIENT] ou [PROPOSITION_INTERVENTION]), dis-le clairement au lieu d'inventer un succès.
Tu as accès en temps réel aux données suivantes (semaine du ${semaine.debut} au ${semaine.fin}) :

RÉSIDENCES DU MANAGER (liste complète — utilise ces residence_id pour toute proposition) :
${residencesStr}

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
- IMPORTANT : utilise TOUJOURS les UUIDs complets (36 caractères, format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) tels qu'ils apparaissent dans ce contexte. Ne tronque jamais un UUID.

CRÉATION DE CLIENT (nouvelle résidence) :
Si le manager demande de créer un nouveau client, une nouvelle résidence ou un nouveau site, tu dois :
1. Identifier le nom du client et l'adresse depuis le message.
2. Si l'adresse semble incomplète (pas de ville, pas de numéro), demander des précisions AVANT d'émettre le bloc.
3. NE PAS inventer de coordonnées GPS — c'est le serveur qui les obtient via géocodage.
4. Terminer ta réponse par un bloc [PROPOSITION_CLIENT], format strict SANS markdown autour :

[PROPOSITION_CLIENT]
{"nom":"<nom exact du client>","adresse":"<adresse complète avec ville>"}
[/PROPOSITION_CLIENT]

5. Expliquer brièvement que tu vas vérifier l'adresse et que la fiche sera soumise à validation avant création.
6. Ne jamais inclure un bloc [ACTIONS] en même temps qu'un bloc [PROPOSITION_CLIENT].

INTERVENTION PONCTUELLE :
Si le manager demande de créer, ajouter ou planifier une intervention ponctuelle (hors récurrence), tu dois :
1. Identifier la résidence (cherche son nom dans la section RÉSIDENCES DU MANAGER ci-dessus pour obtenir le residence_id réel — ne jamais inventer un UUID), l'agent, la date, le créneau horaire et le libellé de la tâche.
2. Si une information clé manque (résidence, date, créneau), demande-la avant d'émettre le bloc.
3. Terminer ta réponse par un bloc [PROPOSITION_INTERVENTION], format strict SANS markdown autour :

[PROPOSITION_INTERVENTION]
{"residence_id":"<uuid-complet>","residence_nom":"<nom affiché>","agent_id":"<uuid-complet>","agent_nom":"<nom affiché>","date_prevue":"<YYYY-MM-DD>","heure_debut_prevue":"<HH:MM>","heure_fin_prevue":"<HH:MM>","tache_libelle":"<libellé de la tâche>"}
[/PROPOSITION_INTERVENTION]

4. Résumer la proposition en une phrase avant le bloc.
5. Ne jamais inclure [ACTIONS] ou [PROPOSITION_CLIENT] en même temps qu'un [PROPOSITION_INTERVENTION].`

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

  // ── Parser le bloc [PROPOSITION_CLIENT] + géocodage ───────────────────────────
  const propositionMatch = reponse.match(/\[PROPOSITION_CLIENT\]([\s\S]*?)\[\/PROPOSITION_CLIENT\]/)
  let propositionClient: Record<string, unknown> | null = null

  if (propositionMatch) {
    reponse = reponse.replace(/\[PROPOSITION_CLIENT\][\s\S]*?\[\/PROPOSITION_CLIENT\]/, '').trim()
    try {
      const raw = JSON.parse(
        propositionMatch[1].replace(/```json/gi, '').replace(/```/g, '').trim()
      ) as { nom?: string; adresse?: string }

      const nomClient     = raw.nom?.trim()
      const adresseClient = raw.adresse?.trim()

      if (nomClient && adresseClient) {
        const geo = await geocoder(adresseClient)
        if (geo) {
          propositionClient = {
            nom:                nomClient,
            adresse_normalisee: geo.adresse_normalisee,
            lat:                geo.lat,
            lng:                geo.lng,
          }
        } else {
          propositionClient = {
            nom:    nomClient,
            adresse: adresseClient,
            erreur: 'Adresse introuvable — précisez le numéro, la rue et la ville.',
          }
        }
      }
    } catch (e) {
      console.error('[copilote] Échec parsing PROPOSITION_CLIENT:', e)
    }
  }

  // ── Parser le bloc [PROPOSITION_INTERVENTION] ─────────────────────────────────
  const interventionMatch = reponse.match(/\[PROPOSITION_INTERVENTION\]([\s\S]*?)\[\/PROPOSITION_INTERVENTION\]/)
  let propositionIntervention: Record<string, unknown> | null = null

  if (interventionMatch) {
    reponse = reponse.replace(/\[PROPOSITION_INTERVENTION\][\s\S]*?\[\/PROPOSITION_INTERVENTION\]/, '').trim()
    try {
      const raw = JSON.parse(
        interventionMatch[1].replace(/```json/gi, '').replace(/```/g, '').trim()
      ) as {
        residence_id?:       string
        residence_nom?:      string
        agent_id?:           string
        agent_nom?:          string
        date_prevue?:        string
        heure_debut_prevue?: string
        heure_fin_prevue?:   string
        tache_libelle?:      string
      }

      if (raw.residence_id && raw.agent_id && raw.date_prevue && raw.tache_libelle) {
        propositionIntervention = {
          residence_id:       raw.residence_id,
          residence_nom:      raw.residence_nom ?? raw.residence_id,
          agent_id:           raw.agent_id,
          agent_nom:          raw.agent_nom ?? raw.agent_id,
          date_prevue:        raw.date_prevue,
          heure_debut_prevue: raw.heure_debut_prevue ?? null,
          heure_fin_prevue:   raw.heure_fin_prevue ?? null,
          tache_libelle:      raw.tache_libelle,
        }
      }
    } catch (e) {
      console.error('[copilote] Échec parsing PROPOSITION_INTERVENTION:', e)
    }
  }

  return NextResponse.json({ reponse, actions, propositionClient, propositionIntervention })
}
