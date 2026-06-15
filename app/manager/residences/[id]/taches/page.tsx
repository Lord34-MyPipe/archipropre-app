import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence, ZoneResidence, TacheTemplate } from '@/lib/types'
import TachesClient from './TachesClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TachesPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [r1, r2, r3] = await Promise.all([
    supabase.from('residences').select('*').eq('id', id).eq('manager_id', user.id).single(),
    supabase.from('zones_residence').select('*').eq('residence_id', id).order('ordre'),
    supabase.from('taches_template').select('*').eq('residence_id', id).order('zone_id').order('ordre'),
  ])

  if (!r1.data) redirect('/manager/residences')

  return (
    <TachesClient
      residence={r1.data as Residence}
      zones={(r2.data ?? []) as ZoneResidence[]}
      taches={(r3.data ?? []) as TacheTemplate[]}
    />
  )
}
