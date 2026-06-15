'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import ResidenceCard from './ResidenceCard'
import type { ResidenceMapItem } from '@/components/shared/ResidencesMap'

const ResidencesMap = dynamic(
  () => import('@/components/shared/ResidencesMap'),
  { ssr: false, loading: () => <div className="h-[580px] bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-sm">Chargement de la carte…</div> }
)

interface Props {
  residences: ResidenceMapItem[]
  agents: { id: string; nom: string; prenom: string }[]
  total: number
}

export default function ManagerResidencesClient({ residences, agents, total }: Props) {
  const [view, setView] = useState<'list' | 'map'>('list')

  return (
    <div className="p-4 md:p-8 pb-24 md:pb-8 space-y-4">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
          <button
            onClick={() => setView('list')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'list' ? 'bg-[#0A2E5A] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"/>
              </svg>
              Liste
            </span>
          </button>
          <button
            onClick={() => setView('map')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'map' ? 'bg-[#0A2E5A] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/>
              </svg>
              Carte
            </span>
          </button>
        </div>
        <span className="text-sm text-slate-500">{total} résidence(s)</span>
      </div>

      {view === 'list' ? (
        residences.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">
            <p className="text-4xl mb-3">🏢</p>
            <p>Aucune résidence assignée à votre secteur.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {residences.map(r => (
              <ResidenceCard key={r.id} residence={r} />
            ))}
          </div>
        )
      ) : (
        <div className="shadow-sm border border-slate-100 rounded-2xl overflow-hidden">
          <ResidencesMap
            residences={residences}
            mode="manager"
            showFilters
            agents={agents}
            height="580px"
          />
        </div>
      )}
    </div>
  )
}
