import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: commandeId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { statut } = await req.json()
  if (!['en_attente', 'commande', 'livre'].includes(statut)) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
  }

  // Vérifier ownership manager : la résidence doit appartenir à ce manager
  const { data: cmd } = await supabase
    .from('commandes_produits')
    .select('id, residence_id, residences(manager_id)')
    .eq('id', commandeId)
    .maybeSingle()
  if (!cmd) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })

  const residenceRaw = (cmd as Record<string, unknown>).residences
  const res = Array.isArray(residenceRaw) ? residenceRaw[0] : residenceRaw
  if ((res as { manager_id: string } | null)?.manager_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { error } = await supabase
    .from('commandes_produits')
    .update({ statut })
    .eq('id', commandeId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
