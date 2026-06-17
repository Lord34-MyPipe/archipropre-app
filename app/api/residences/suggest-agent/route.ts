import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const { residenceId } = await req.json()
  if (!residenceId) return NextResponse.json({ error: 'residenceId manquant' }, { status: 400 })

  const admin = await createAdminClient()

  const [{ data: residence }, { data: agents }] = await Promise.all([
    admin.from('residences')
      .select('id, nom, adresse, competences_requises, vehicule_requis, agent_exclu_ids')
      .eq('id', residenceId)
      .eq('manager_id', user.id)
      .single(),
    admin.from('profiles')
      .select('id, nom, prenom, zones_geo, competences, vehicule, contrat_heures_hebdo, residences_attitrees, residences_exclues, binome_agent_id')
      .eq('manager_id', user.id)
      .eq('actif', true)
      .eq('role', 'agent')
      .order('nom'),
  ])

  if (!residence) return NextResponse.json({ error: 'Résidence introuvable' }, { status: 404 })

  const residenceDetails = residence

  const today = new Date().toISOString().split('T')[0]
  const in30  = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  const agentIds = (agents ?? []).map(a => a.id)

  let absenceMap: Record<string, { dateDebut: string; dateFin: string }[]> = {}
  if (agentIds.length > 0) {
    const [{ data: abs }, { data: cgs }] = await Promise.all([
      admin.from('absences').select('agent_id, date_debut, date_fin')
        .in('agent_id', agentIds).lte('date_debut', in30).gte('date_fin', today),
      admin.from('conges').select('agent_id, date_debut, date_fin')
        .in('agent_id', agentIds).lte('date_debut', in30).gte('date_fin', today)
        .eq('statut', 'approuve'),
    ])
    for (const row of [...(abs ?? []), ...(cgs ?? [])]) {
      absenceMap[row.agent_id] ??= []
      absenceMap[row.agent_id].push({ dateDebut: row.date_debut, dateFin: row.date_fin })
    }
  }

  const excludedIds: string[] = residence.agent_exclu_ids ?? []

  const agentLines = (agents ?? [])
    .filter(a => !excludedIds.includes(a.id))
    .map(a => {
      const absList = absenceMap[a.id] ?? []
      const absStr = absList.length > 0
        ? `absent(e) du ${absList.map(x => `${x.dateDebut} au ${x.dateFin}`).join(', ')}`
        : 'disponible'
      return [
        `- ID: ${a.id}`,
        `  Nom: ${a.prenom} ${a.nom}`,
        `  Zones: ${(a.zones_geo ?? []).join(', ') || 'non renseignées'}`,
        `  Compétences: ${(a.competences ?? []).join(', ') || 'aucune'}`,
        `  Véhiculé: ${a.vehicule ? 'oui' : 'non'}`,
        `  Heures hebdo contrat: ${a.contrat_heures_hebdo ?? '?'}h`,
        `  Résidences déjà attitrées: ${(a.residences_attitrees ?? []).length}`,
        `  Disponibilité 30 jours: ${absStr}`,
        a.binome_agent_id ? `  Binôme avec: ${a.binome_agent_id}` : '',
      ].filter(Boolean).join('\n')
    }).join('\n\n')

  const prompt = `Tu es un assistant de planification pour une société de nettoyage. Tu dois choisir le meilleur agent attitré pour une résidence.

RÉSIDENCE :
- Nom: ${residenceDetails.nom}
- Adresse: ${residenceDetails.adresse ?? 'non renseignée'}
- Compétences requises: ${(residenceDetails.competences_requises ?? []).join(', ') || 'aucune'}
- Véhicule requis: ${residenceDetails.vehicule_requis ? 'oui' : 'non'}

AGENTS DISPONIBLES (non exclus) :
${agentLines || 'Aucun agent disponible'}

CONSIGNES :
1. Sélectionne l'agent (ou le binôme) le plus adapté.
2. Priorité : compatibilité géographique, compétences requises, disponibilité, charge de travail (moins d'attitrages = mieux).
3. Si un binôme existe et que les deux sont disponibles, préfère-le pour les résidences importantes.
4. Réponds UNIQUEMENT avec un objet JSON strict (pas de markdown, pas de texte avant/après) :
   {"agentId": "<uuid>", "raison": "<explication courte en français, max 2 phrases>"}

   Où agentId est l'ID de l'agent primary recommandé (celui avec le contrat principal).`

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 512,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: prompt }],
  })

  console.log('Réponse brute Claude:', JSON.stringify(message.content, null, 2))

  const textBlock = message.content.find(b => b.type === 'text')
  const rawText = textBlock?.type === 'text' ? textBlock.text : ''

  if (!rawText) {
    console.error('[suggest-agent] Aucun bloc text dans la réponse Claude')
    return NextResponse.json({ error: 'Réponse IA invalide (pas de texte)' }, { status: 500 })
  }

  const cleanText = rawText
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(cleanText)
  } catch (e1) {
    // Tentative : extraire le premier objet JSON {...} de la chaîne
    const match = cleanText.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[suggest-agent] Impossible de parser la réponse Claude:', e1, '\nTexte brut:', rawText)
      return NextResponse.json({ error: 'Format IA invalide — impossible de parser la réponse' }, { status: 500 })
    }
    try {
      raw = JSON.parse(match[0])
    } catch (e2) {
      console.error('[suggest-agent] Échec du parsing même après extraction:', e2, '\nExtrait:', match[0])
      return NextResponse.json({ error: 'Format IA invalide — JSON malformé' }, { status: 500 })
    }
  }

  // Normaliser : format simple { agentId, raison } ou liste { suggestions: [{agentId, raison}] }
  let agentId: string
  let raison: string

  if (typeof raw.agentId === 'string' && typeof raw.raison === 'string') {
    agentId = raw.agentId
    raison  = raw.raison
  } else if (Array.isArray(raw.suggestions) && raw.suggestions.length > 0) {
    const first = raw.suggestions[0] as Record<string, unknown>
    agentId = String(first.agentId ?? '')
    raison  = String(first.raison ?? '')
  } else {
    console.error('[suggest-agent] Structure inattendue:', JSON.stringify(raw))
    return NextResponse.json({ error: 'Champs manquants dans la réponse IA' }, { status: 500 })
  }

  if (!agentId || !raison) {
    return NextResponse.json({ error: 'Champs manquants dans la réponse IA' }, { status: 500 })
  }

  return NextResponse.json({ agentId, raison })
}
