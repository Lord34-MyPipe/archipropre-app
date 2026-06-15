import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Profile } from '@/lib/types'

export default async function DirecteurEquipes() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: managers } = await supabase
    .from('profiles').select('*').eq('role', 'manager').order('nom') as { data: Profile[] | null }
  const { data: agents } = await supabase
    .from('profiles').select('*').eq('role', 'agent').order('nom') as { data: Profile[] | null }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-8 py-8">
        <h1 className="text-3xl font-bold">Gestion des équipes</h1>
        <p className="text-blue-300 text-sm mt-1">
          {managers?.length ?? 0} manager(s) · {agents?.length ?? 0} agent(s)
        </p>
      </div>
      <div className="px-8 py-8 grid grid-cols-2 gap-8">
        {/* Managers */}
        <div>
          <h2 className="font-semibold text-slate-700 mb-4">Managers</h2>
          <div className="space-y-3">
            {(managers ?? []).map(m => (
              <div key={m.id} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0A2E5A] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {m.prenom[0]}{m.nom[0]}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{m.prenom} {m.nom}</p>
                  <p className="text-xs text-slate-400">{m.email}</p>
                </div>
                <div className={`ml-auto w-2.5 h-2.5 rounded-full ${m.actif ? 'bg-green-400' : 'bg-slate-300'}`}/>
              </div>
            ))}
          </div>
        </div>
        {/* Agents */}
        <div>
          <h2 className="font-semibold text-slate-700 mb-4">Agents</h2>
          <div className="space-y-3">
            {(agents ?? []).map(a => (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1A5FA8] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {a.prenom[0]}{a.nom[0]}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{a.prenom} {a.nom}</p>
                  <p className="text-xs text-slate-400">{a.email}</p>
                </div>
                <div className={`ml-auto w-2.5 h-2.5 rounded-full ${a.actif ? 'bg-green-400' : 'bg-slate-300'}`}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
