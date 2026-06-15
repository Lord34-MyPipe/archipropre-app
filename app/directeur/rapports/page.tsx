import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function DirecteurRapports() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: terminees } = await supabase
    .from('interventions')
    .select('*, residences(nom,adresse), profiles!interventions_agent_id_fkey(nom,prenom)')
    .eq('statut', 'terminee')
    .order('heure_fin', { ascending: false })
    .limit(50)

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-8 py-8">
        <h1 className="text-3xl font-bold">Rapports</h1>
        <p className="text-blue-300 text-sm mt-1">Interventions terminées · 50 dernières</p>
      </div>
      <div className="px-8 py-8">
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Date','Résidence','Agent','Heure scan','Heure fin','Durée'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(terminees ?? []).map(i => {
                const scan = i.heure_scan ? new Date(i.heure_scan) : null
                const fin  = i.heure_fin  ? new Date(i.heure_fin)  : null
                const dureeMin = scan && fin ? Math.round((fin.getTime() - scan.getTime()) / 60000) : null
                const r = i as { residences?: { nom?: string }; profiles?: { prenom?: string; nom?: string } }
                return (
                  <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {new Date(i.date_prevue).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{r.residences?.nom ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.profiles?.prenom} {r.profiles?.nom}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {scan ? scan.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {fin ? fin.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-[#1A5FA8]">
                      {dureeMin !== null ? `${dureeMin} min` : '—'}
                    </td>
                  </tr>
                )
              })}
              {!terminees?.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Aucun rapport disponible.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
