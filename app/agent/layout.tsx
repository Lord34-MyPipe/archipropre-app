import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AgentNav from '@/components/agent/AgentNav'

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'agent') {
    redirect(profile?.role === 'directeur' ? '/directeur/dashboard' : '/manager/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-1 pb-20 max-w-lg mx-auto w-full">{children}</main>
      <AgentNav />
    </div>
  )
}
