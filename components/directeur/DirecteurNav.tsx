'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const items = [
  { href: '/directeur/dashboard',  label: 'Vue d\'ensemble', emoji: '📊' },
  { href: '/directeur/analytics',  label: 'Analytique',      emoji: '📈' },
  { href: '/directeur/residences', label: 'Résidences',      emoji: '🏢' },
  { href: '/directeur/equipes',    label: 'Équipes',         emoji: '👥' },
  { href: '/directeur/rapports',   label: 'Rapports',        emoji: '📄' },
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
        {items.map(item => {
          const active = path.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-[#1A5FA8] text-white'
                  : 'text-blue-200 hover:bg-white/10 hover:text-white'
              }`}>
              <span>{item.emoji}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 pb-6">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-all">
          <span>🚪</span> Déconnexion
        </button>
      </div>
    </aside>
  )
}
