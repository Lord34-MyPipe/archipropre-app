import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import RapportSyndicClient from './RapportSyndicClient'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export default async function RapportSyndicPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Ownership check — comme les autres pages résidence
  const { data: residence } = await supabase
    .from('residences')
    .select('nom')
    .eq('id', id)
    .eq('manager_id', user.id)
    .single()
  if (!residence) redirect('/manager/residences')

  return <RapportSyndicClient residenceId={id} residenceNom={residence.nom} />
}
