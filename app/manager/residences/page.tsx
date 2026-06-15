import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence } from '@/lib/types'

const TYPE_LABEL: Record<string,string> = {
  syndic:'Syndic', profession_liberale:'Profession libérale',
  societe:'Société', magasin:'Magasin', particulier:'Particulier'
}

export default async function ManagerResidences() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: residences } = await supabase
    .from('residences').select('*').eq('manager_id', user.id).eq('actif', true)
    .order('nom') as { data: Residence[] | null }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mes résidences</h1>
          <p className="text-blue-300 text-sm mt-0.5">{residences?.length ?? 0} résidence(s)</p>
        </div>
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
              <div key={r.id} className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="font-semibold text-slate-800">{r.nom}</h3>
                  <div className="flex flex-wrap gap-1 shrink-0">
                    {r.client_exigeant && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">⚠️ Exigeant</span>
                    )}
                    {r.vehicule_requis && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">🚗 Véhicule</span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-500 mb-3">{r.adresse}</p>
                {r.type_client && (
                  <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                    {TYPE_LABEL[r.type_client] ?? r.type_client}
                  </span>
                )}
                <div className="mt-3 pt-3 border-t border-slate-50">
                  <p className="text-xs text-slate-400 font-mono break-all">QR: {r.qr_code_token}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
