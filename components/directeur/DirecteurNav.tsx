'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { LayoutDashboard, Calendar, Building2, Users, TrendingUp, Package, Settings, LogOut } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const items: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/directeur/dashboard',   label: 'Tableau de bord',  Icon: LayoutDashboard },
  { href: '/directeur/planning',    label: 'Planning',          Icon: Calendar },
  { href: '/directeur/residences',  label: 'Résidences',        Icon: Building2 },
  { href: '/directeur/agents',      label: 'Agents',            Icon: Users },
  { href: '/directeur/rentabilite', label: 'Rentabilité',       Icon: TrendingUp },
  { href: '/directeur/catalogue',   label: 'Catalogue produits',Icon: Package },
  { href: '/directeur/parametres',  label: 'Paramètres',        Icon: Settings },
]

export default function DirecteurNav() {
  const path   = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-[#0A2E5A] text-white z-40">
      <div className="px-6 py-6 border-b border-white/10">
        <p className="text-xs text-blue-300 uppercase tracking-widest mb-0.5">Archipropre</p>
        <h1 className="text-lg font-bold">Direction</h1>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {items.map(({ href, label, Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-[#1A5FA8] text-white'
                  : 'text-blue-200 hover:bg-white/10 hover:text-white'
              }`}>
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 pb-6">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-all">
          <LogOut className="w-5 h-5 shrink-0" /> Déconnexion
        </button>
      </div>
    </aside>
  )
}
