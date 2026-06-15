import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence } from '@/lib/types'
import DirecteurResidencesClient from '@/components/directeur/DirecteurResidencesClient'
import type { ResidenceMapItem } from '@/components/shared/ResidencesMap'

export default async function DirecteurResidences() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [r1, r2, r3, r4] = await Promise.all([
    supabase.from('residences').select('*').order('nom'),
    supabase.from('profiles').select('id, nom, prenom').eq('role', 'manager').eq('actif', true),
    supabase.from('profiles').select('id, nom, prenom').eq('role', 'agent').eq('actif', true),
    supabase.from('contrats_residences').select('residence_id').eq('actif', true),
  ])

  const residences = r1.data as Residence[] | null
  const managers = r2.data as { id: string; nom: string; prenom: string }[] | null
  const agents   = r3.data as { id: string; nom: string; prenom: string }[] | null
  const contrats = r4.data as { residence_id: string }[] | null

  const agentMap   = new Map((agents ?? []).map(a => [a.id, `${a.prenom} ${a.nom}`]))
  const managerMap = new Map((managers ?? []).map(m => [m.id, `${m.prenom} ${m.nom}`]))
  const contratsSet = new Set((contrats ?? []).map(c => c.residence_id))

  const residencesWithMeta: ResidenceMapItem[] = (residences ?? []).map(r => ({
    ...r,
    agentNom:   r.agent_prefere_id ? (agentMap.get(r.agent_prefere_id)  ?? null) : null,
    managerNom: r.manager_id        ? (managerMap.get(r.manager_id)       ?? null) : null,
    managerId:  r.manager_id,
    hasContrat: contratsSet.has(r.id),
  }))

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-8 py-8">
        <h1 className="text-3xl font-bold">Toutes les résidences</h1>
        <p className="text-blue-300 text-sm mt-1">{residencesWithMeta.length} résidences au total</p>
      </div>
      <DirecteurResidencesClient
        residences={residencesWithMeta}
        managers={managers ?? []}
      />
    </div>
  )
}
