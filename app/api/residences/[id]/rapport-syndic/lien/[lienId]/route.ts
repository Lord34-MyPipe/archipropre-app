import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Rapport syndic (P3-2, étape S5) — révocation d'un lien : actif=false.
// La page publique (app/rapport/[token]/page.tsx) filtre déjà sur actif=true,
// donc ce simple flag suffit à couper l'accès immédiatement, y compris aux
// photos (plus aucune signed URL n'est générée pour un lien inactif).

interface RouteContext { params: Promise<{ id: string; lienId: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id: residenceId, lienId } = await params
  const admin = await createAdminClient()

  // Ownership : la résidence doit appartenir à ce manager
  const { data: residence } = await admin
    .from('residences')
    .select('id')
    .eq('id', residenceId)
    .eq('manager_id', user.id)
    .maybeSingle()
  if (!residence) return NextResponse.json({ error: 'Résidence introuvable' }, { status: 404 })

  const { error } = await admin
    .from('rapports_syndic_liens')
    .update({ actif: false, revoked_at: new Date().toISOString() })
    .eq('id', lienId)
    .eq('residence_id', residenceId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
