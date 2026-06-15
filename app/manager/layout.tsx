import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ManagerNav from '@/components/manager/ManagerNav'

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') {
    redirect(profile?.role === 'directeur' ? '/directeur/dashboard' : '/agent/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <ManagerNav />
      <main className="flex-1 ml-0 md:ml-64 min-h-screen">{children}</main>
    </div>
  )
}
