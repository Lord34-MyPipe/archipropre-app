import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteContext) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await params
  const admin = await createAdminClient()

  // Ownership check
  const { data: res } = await admin
    .from('residences')
    .select('id')
    .eq('id', id)
    .eq('manager_id', managerId)
    .single()
  if (!res) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const body = await req.json() as { action: 'suspendre' | 'reactiver' }
  const { action } = body

  if (action === 'suspendre') {
    const todayStr = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })

    // Annuler toutes les interventions futures planifiées
    const { data: annulees, error: errAnnul } = await admin
      .from('interventions')
      .update({ statut: 'annulee' })
      .eq('residence_id', id)
      .eq('statut', 'planifiee')
      .gte('date_prevue', todayStr)
      .select('id')

    if (errAnnul) return NextResponse.json({ error: errAnnul.message }, { status: 500 })

    // Passer la résidence en sommeil
    const { error: errSommeil } = await admin
      .from('residences')
      .update({ actif: false })
      .eq('id', id)

    if (errSommeil) return NextResponse.json({ error: errSommeil.message }, { status: 500 })

    return NextResponse.json({ success: true, interventionsAnnulees: annulees?.length ?? 0 })
  }

  if (action === 'reactiver') {
    const { error: errReactiv } = await admin
      .from('residences')
      .update({ actif: true })
      .eq('id', id)

    if (errReactiv) return NextResponse.json({ error: errReactiv.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Action invalide (suspendre | reactiver)' }, { status: 400 })
}
