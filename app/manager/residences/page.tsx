import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence } from '@/lib/types'
import ResidenceCard from '@/components/manager/ResidenceCard'

export default async function ManagerResidences() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: residences } = await supabase
    .from('residences')
    .select('*')
    .eq('manager_id', user.id)
    .eq('actif', true)
    .order('nom') as { data: Residence[] | null }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <h1 className="text-2xl font-bold">Mes résidences</h1>
        <p className="text-blue-300 text-sm mt-0.5">{residences?.length ?? 0} résidence(s)</p>
      </div>

      <div className="p-4 md:p-8 pb-24 md:pb-8">
        {!residences?.length ? (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-100">
            <p className="text-4xl mb-3">🏢</p>
            <p>Aucune résidence assignée à votre secteur.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {residences.map(r => (
              <ResidenceCard key={r.id} residence={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
