'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { ResidenceMapItem } from '@/components/shared/ResidencesMap'

const ResidencesMap = dynamic(
  () => import('@/components/shared/ResidencesMap'),
  { ssr: false, loading: () => <div className="h-[640px] bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-sm">Chargement de la carte…</div> }
)

const TYPE_LABEL: Record<string, string> = {
  syndic: 'Syndic', profession_liberale: 'Profession libérale',
  societe: 'Société', magasin: 'Magasin', particulier: 'Particulier',
}

interface Props {
  residences: ResidenceMapItem[]
  managers: { id: string; nom: string; prenom: string }[]
}

export default function DirecteurResidencesClient({ residences, managers }: Props) {
  const [view, setView] = useState<'table' | 'map'>('table')

  return (
    <div className="px-8 py-6 space-y-4">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
          <button
            onClick={() => setView('table')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'table' ? 'bg-[#0A2E5A] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125"/>
              </svg>
              Tableau
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
        <span className="text-sm text-slate-500">{residences.length} résidence(s)</span>
      </div>

      {view === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Nom', 'Adresse', 'Type', 'Manager', 'Agent attitré', 'Statut', 'Exigeant', 'Véhicule'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {residences.map(r => (
                <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${!r.actif ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-800 text-sm">{r.nom}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{r.adresse}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{TYPE_LABEL[r.type_client ?? ''] ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{r.managerNom ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{r.agentNom ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.actif
                      ? <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>
                      : <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-xs rounded-full font-medium">En sommeil</span>
                    }
                  </td>
                  <td className="px-4 py-3">{r.client_exigeant ? <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Oui</span> : <span className="text-slate-300 text-sm">—</span>}</td>
                  <td className="px-4 py-3">{r.vehicule_requis ? <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">Requis</span> : <span className="text-slate-300 text-sm">—</span>}</td>
                </tr>
              ))}
              {residences.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">Aucune résidence.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="shadow-sm border border-slate-100 rounded-2xl overflow-hidden">
          <ResidencesMap
            residences={residences}
            mode="directeur"
            showFilters
            managers={managers}
            height="640px"
          />
        </div>
      )}
    </div>
  )
}
