import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface Crumb {
  label: string
  href?: string   // pas de href = segment courant (non cliquable)
}

// Fil d'Ariane manager — pensé pour les en-têtes bleu foncé (#0A2E5A).
// Le dernier segment (ou tout segment sans href) est affiché en blanc, non cliquable.
export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Fil d'Ariane" className="flex items-center gap-1.5 text-sm text-blue-300 flex-wrap">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-blue-400/60 shrink-0" />}
          {it.href ? (
            <Link href={it.href} className="hover:text-white transition-colors truncate max-w-[38vw]">
              {it.label}
            </Link>
          ) : (
            <span className="text-white font-medium truncate max-w-[38vw]">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
