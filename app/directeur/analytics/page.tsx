import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function DirecteurAnalytics() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-8 py-8">
        <h1 className="text-3xl font-bold">Analytique</h1>
        <p className="text-blue-300 text-sm mt-1">Statistiques détaillées</p>
      </div>
      <div className="px-8 py-8">
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400">
          <p className="text-4xl mb-4">📈</p>
          <p className="text-lg font-semibold text-slate-600">Analytique avancée</p>
          <p className="text-sm mt-2">Graphiques par agent, résidence et période — à venir.</p>
        </div>
      </div>
    </div>
  )
}
