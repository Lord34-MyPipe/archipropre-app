import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import DirecteurNav from '@/components/directeur/DirecteurNav'

export default async function DirecteurLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'directeur') {
    redirect(profile?.role === 'manager' ? '/manager/dashboard' : '/agent/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <DirecteurNav />
      <main className="flex-1 ml-64 min-h-screen">{children}</main>
    </div>
  )
}
