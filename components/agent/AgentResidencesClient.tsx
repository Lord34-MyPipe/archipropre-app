'use client'

import dynamic from 'next/dynamic'
import type { ResidenceMapItem } from '@/components/shared/ResidencesMap'

const ResidencesMap = dynamic(
  () => import('@/components/shared/ResidencesMap'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center bg-slate-100 text-slate-400 text-sm" style={{ height: 'calc(100vh - 180px)' }}>
        Chargement de la carte…
      </div>
    ),
  }
)

interface Props {
  residences: ResidenceMapItem[]
}

export default function AgentResidencesClient({ residences }: Props) {
  if (residences.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100 mt-4 mx-3">
        <p className="text-4xl mb-3">🗺️</p>
        <p>Aucune résidence assignée pour le moment.</p>
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-100">
        <ResidencesMap
          residences={residences}
          mode="agent"
          showFilters={false}
          height="calc(100vh - 180px)"
        />
      </div>
    </div>
  )
}
