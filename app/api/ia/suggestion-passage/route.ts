import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic()
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
  const { agent_id, date } = body as { agent_id: string; date: string }
  if (!agent_id || !date) {
    return NextResponse.json({ error: 'agent_id et date requis' }, { status: 400 })
  }

  const admin = await createAdminClient()

  const [{ data: agent }, { data: interventions }, { data: params }] = await Promise.all([
    admin.from('profiles')
      .select('prenom, nom, mode_deplacement, adresse_domicile')
      .eq('id', agent_id).maybeSingle(),
    admin.from('interventions')
      .select('heure_debut_prevue, heure_fin_prevue, residences(nom, adresse)')
      .eq('agent_id', agent_id).eq('date_prevue', date)
      .order('heure_debut_prevue', { ascending: true }),
    admin.from('parametres_societe').select('adresse_siege').limit(1).maybeSingle(),
  ])

  const adresseSiege = (params as Record<string, unknown> | null)?.adresse_siege as string | null
    ?? ADRESSE_SIEGE_DEFAUT

  const lignes = (interventions ?? []).map((i: Record<string, unknown>) => {
    const res = Array.isArray(i.residences) ? i.residences[0] : i.residences as { nom: string; adresse: string } | null
    return `- ${String(i.heure_debut_prevue ?? '').slice(0, 5)}→${String(i.heure_fin_prevue ?? '').slice(0, 5)} : ${res?.nom ?? '?'} (${res?.adresse ?? ''})`
  }).join('\n')

  const a = agent as Record<string, unknown> | null

  const prompt = `Tu es un assistant RH pour une société de nettoyage.
Agent : ${a?.prenom ?? ''} ${a?.nom ?? ''}, mode de déplacement : ${a?.mode_deplacement ?? 'inconnu'}.
Adresse domicile : ${a?.adresse_domicile ?? 'inconnue'}.
Adresse du siège : ${adresseSiege}.
Planning du ${date} :
${lignes || '(aucune intervention planifiée)'}

Propose le meilleur créneau pour que l'agent passe au siège récupérer une commande.
Réponds UNIQUEMENT en JSON valide, sans markdown, avec exactement ces champs :
{"heure_suggeree":"HH:MM","position":"avant_premiere|entre_interventions|apres_derniere","justification":"..."}`

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 256,
      messages:   [{ role: 'user', content: prompt }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const result = JSON.parse(text)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({
      heure_suggeree: '07:30',
      position:       'avant_premiere',
      justification:  'Créneau par défaut — IA indisponible',
    })
  }
}
