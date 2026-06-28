import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: interventionId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { commentaire } = await req.json().catch(() => ({ commentaire: '' }))

  // Charger l'intervention + résidence + profil agent en parallèle
  const [{ data: inter }, { data: agentProfil }] = await Promise.all([
    supabase
      .from('interventions')
      .select('id, residence_id, residences(nom, manager_id)')
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

  const residenceRaw = (inter as Record<string, unknown>).residences
  const residence = Array.isArray(residenceRaw) ? residenceRaw[0] : residenceRaw as { nom: string; manager_id: string } | null
  const managerId = agentProfil?.manager_id ?? residence?.manager_id ?? null

  if (managerId) {
    const nomAgent = agentProfil
      ? `${agentProfil.prenom ?? ''} ${agentProfil.nom ?? ''}`.trim()
      : user.email ?? 'un agent'
    const nomResidence = residence?.nom ?? 'une résidence'
    const admin = await createAdminClient()
    await admin.from('alertes').insert({
      intervention_id: interventionId,
      type:            'rapport_soumis',
      message:         `Rapport soumis par ${nomAgent} — ${nomResidence}${commentaire ? ' : ' + commentaire : ''}`,
      destinataire_id: managerId,
      lue:             false,
    })
  }

  return NextResponse.json({ ok: true })
}
