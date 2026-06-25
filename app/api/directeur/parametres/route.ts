import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

async function getDirecteurId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'directeur' ? user.id : null
}

export async function GET() {
  const directeurId = await getDirecteurId()
  if (!directeurId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const admin = await createAdminClient()
  const { data } = await admin.from('parametres_societe').select('*').limit(1).maybeSingle()
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const directeurId = await getDirecteurId()
  if (!directeurId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { tauxHoraireAgent, coutKm, fraisGenerauxMois } = await req.json()
  const admin = await createAdminClient()

  const { data: existing } = await admin.from('parametres_societe').select('id').limit(1).maybeSingle()

  const payload = {
    taux_horaire_agent:  tauxHoraireAgent  ?? 23,
    cout_km:             coutKm            ?? 0.45,
    frais_generaux_mois: fraisGenerauxMois ?? 0,
    updated_at:          new Date().toISOString(),
    updated_by:          directeurId,
  }

  if (existing) {
    await admin.from('parametres_societe').update(payload).eq('id', existing.id)
  } else {
    await admin.from('parametres_societe').insert(payload)
  }

  return NextResponse.json({ ok: true })
}
