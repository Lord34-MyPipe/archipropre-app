import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence } from '@/lib/types'

export default async function DirecteurResidences() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: residences } = await supabase
    .from('residences').select('*').eq('actif', true).order('nom') as { data: Residence[] | null }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-8 py-8">
        <h1 className="text-3xl font-bold">Toutes les résidences</h1>
        <p className="text-blue-300 text-sm mt-1">{residences?.length ?? 0} résidences actives</p>
      </div>
      <div className="px-8 py-8">
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Nom','Adresse','Type','Exigeant','Véhicule'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(residences ?? []).map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800 text-sm">{r.nom}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{r.adresse}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 capitalize">{r.type_client?.replace('_',' ') ?? '—'}</td>
                  <td className="px-4 py-3">{r.client_exigeant ? <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Oui</span> : <span className="text-slate-300 text-sm">—</span>}</td>
                  <td className="px-4 py-3">{r.vehicule_requis ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">Requis</span> : <span className="text-slate-300 text-sm">—</span>}</td>
                </tr>
              ))}
              {!residences?.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">Aucune résidence.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
