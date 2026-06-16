'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const items = [
  { href: '/manager/dashboard', label: 'Tableau de bord', icon: '⊞' },
  { href: '/manager/planning',  label: 'Planning',        icon: '📅' },
  { href: '/manager/residences',label: 'Résidences',      icon: '🏢' },
  { href: '/manager/agents',    label: 'Agents',          icon: '👥' },
  { href: '/manager/charge',    label: 'Charge',          icon: '📊' },
]

export default function ManagerNav() {
  const path   = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-64 bg-[#0A2E5A] text-white z-40">
        <div className="px-6 py-6 border-b border-white/10">
          <p className="text-xs text-blue-300 uppercase tracking-widest mb-0.5">Archipropre</p>
          <h1 className="text-lg font-bold">Manager</h1>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map(item => {
            const active = path.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-[#1A5FA8] text-white'
                    : 'text-blue-200 hover:bg-white/10 hover:text-white'
                }`}>
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="px-3 pb-6">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-all">
            <span className="text-lg">🚪</span>
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Nav mobile bas de page */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0A2E5A] text-white border-t border-white/10 z-40">
        <div className="flex items-stretch">
          {items.map(item => {
            const active = path.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-[10px] font-medium transition-colors ${
                  active ? 'text-[#0BBFBF]' : 'text-blue-300'
                }`}>
                <span className="text-xl">{item.icon}</span>
                {item.label.split(' ')[0]}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
