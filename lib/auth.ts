import { createClient } from './supabase-server'
import { redirect } from 'next/navigation'

export type Role = 'agent' | 'manager' | 'directeur'

export async function getSessionUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return profile
}

export async function requireRole(role: Role | Role[]) {
  const profile = await getSessionUser()
  if (!profile) redirect('/login')
  const allowed = Array.isArray(role) ? role : [role]
  if (!allowed.includes(profile.role)) {
    const dest = profile.role === 'directeur'
      ? '/directeur/dashboard'
      : profile.role === 'manager'
      ? '/manager/dashboard'
      : '/agent/dashboard'
    redirect(dest)
  }
  return profile
}
