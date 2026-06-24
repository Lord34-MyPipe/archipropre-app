import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const admin = await createAdminClient()

  // Vérifier ownership
  const { data: res } = await admin.from('residences').select('id').eq('id', id).eq('manager_id', user.id).single()
  if (!res) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const dateLimit = new Date()
  dateLimit.setDate(dateLimit.getDate() - 30)
  const dateLimitStr = dateLimit.toISOString().split('T')[0]

  const [r1, r2, r3, r4] = await Promise.all([
    admin.from('taches_template').select('*').eq('residence_id', id).order('zone_id').order('ordre'),
    admin.from('contrats_residences').select('*').eq('residence_id', id).eq('actif', true).maybeSingle(),
    admin.from('parametres_societe').select('taux_horaire_agent, cout_km, frais_generaux_mois').limit(1).maybeSingle(),
    supabase.from('interventions')
      .select('heure_scan, heure_fin')
      .eq('residence_id', id)
      .eq('statut', 'terminee')
      .not('heure_scan', 'is', null)
      .not('heure_fin', 'is', null)
      .gte('date_prevue', dateLimitStr),
  ])

  let statsReel: { totalMin: number; count: number } | null = null
  const intersReel = r4.data ?? []
  if (intersReel.length > 0) {
    let totalMin = 0
    for (const i of intersReel) {
      const diff = (new Date(i.heure_fin as string).getTime() - new Date(i.heure_scan as string).getTime()) / 60000
      if (diff > 0 && diff < 600) totalMin += diff
    }
    if (totalMin > 0) statsReel = { totalMin, count: intersReel.length }
  }

  return NextResponse.json({
    taches: r1.data ?? [],
    contrat: r2.data ?? null,
    parametres: r3.data ?? null,
    statsReel,
  })
}
