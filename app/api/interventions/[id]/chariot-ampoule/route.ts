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

  // Ownership
  const { data: inter } = await supabase
    .from('interventions')
    .select('id')
    .eq('id', interventionId)
    .eq('agent_id', user.id)
    .maybeSingle()
  if (!inter) return NextResponse.json({ error: 'Intervention introuvable' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const side = (formData.get('side') as string) ?? 'avant' // 'avant' | 'apres'
  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })

  const ext = file.name.split('.').pop() ?? 'jpg'
  const storagePath = `${interventionId}/${side}_${Date.now()}.${ext}`

  const admin = await createAdminClient()
  const { error: uploadError } = await admin.storage
    .from('photos-ampoules')
    .upload(storagePath, file, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  return NextResponse.json({ storage_path: storagePath })
}
