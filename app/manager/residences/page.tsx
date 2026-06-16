import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence } from '@/lib/types'
import ManagerResidencesClient from '@/components/manager/ManagerResidencesClient'
import type { ResidenceMapItem } from '@/components/shared/ResidencesMap'
import type { EtatResidenceInfo } from '@/components/manager/ResidenceCard'

export const dynamic = 'force-dynamic'

export default async function ManagerResidences() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()

  const [r1, r2] = await Promise.all([
    supabase.from('residences').select('*').eq('manager_id', user.id).order('nom'),
    supabase.from('profiles').select('id, nom, prenom').eq('manager_id', user.id).eq('role', 'agent').eq('actif', true),
  ])

  const residences = r1.data as Residence[] | null
  const agents     = r2.data as { id: string; nom: string; prenom: string }[] | null

  // Fetch états depuis la vue
  const residenceIds = (residences ?? []).map(r => r.id)
  const etatMap = new Map<string, EtatResidenceInfo>()
  if (residenceIds.length > 0) {
    const { data: etatRows } = await admin
      .from('v_etat_residence')
      .select('*')
      .in('residence_id', residenceIds)
    ;(etatRows ?? []).forEach((e: EtatResidenceInfo & { residence_id: string }) => {
      etatMap.set(e.residence_id, e)
    })
  }

  const agentMap = new Map((agents ?? []).map(a => [a.id, `${a.prenom} ${a.nom}`]))

  const residencesWithMeta = (residences ?? []).map(r => ({
    ...r,
    agentNom: r.agent_prefere_id ? (agentMap.get(r.agent_prefere_id) ?? null) : null,
    _etat: etatMap.get(r.id) ?? null,
  })) as (ResidenceMapItem & { _etat: EtatResidenceInfo | null })[]

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <h1 className="text-2xl font-bold">Mes résidences</h1>
        <p className="text-blue-300 text-sm mt-0.5">{residencesWithMeta.length} résidence(s)</p>
      </div>
      <ManagerResidencesClient
        residences={residencesWithMeta}
        agents={agents ?? []}
        total={residencesWithMeta.length}
      />
    </div>
  )
}
