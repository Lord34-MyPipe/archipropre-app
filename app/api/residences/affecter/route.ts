import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

export async function PATCH(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { residenceId, agentPrefereId, agentExcluIds } = await req.json()
  if (!residenceId) return NextResponse.json({ error: 'residenceId manquant' }, { status: 400 })

  const admin = await createAdminClient()
  const { data: res } = await admin
    .from('residences').select('id').eq('id', residenceId).eq('manager_id', managerId).single()
  if (!res) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Chercher le binôme de l'agent affecté
  let agentSecondaireId: string | null = null
  let binomeNom: string | null = null
  if (agentPrefereId) {
    const { data: agentProfile } = await admin
      .from('profiles')
      .select('binome_agent_id, nom, prenom')
      .eq('id', agentPrefereId)
      .single()
    if (agentProfile?.binome_agent_id) {
      agentSecondaireId = agentProfile.binome_agent_id
      const { data: binome } = await admin
        .from('profiles')
        .select('nom, prenom')
        .eq('id', agentSecondaireId)
        .single()
      if (binome) {
        binomeNom = `${agentProfile.prenom} ${agentProfile.nom} + ${binome.prenom} ${binome.nom} (binôme)`
      }
    }
  }

  const { error } = await admin.from('residences').update({
    agent_prefere_id:    agentPrefereId ?? null,
    agent_secondaire_id: agentSecondaireId,
    agent_exclu_ids:     agentExcluIds ?? [],
  }).eq('id', residenceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, binomeNom })
}
