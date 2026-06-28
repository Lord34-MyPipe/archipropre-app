'use client'

import { useState } from 'react'
import { wazeUrl } from '@/lib/navigation'

interface PassageSiege {
  id: string
  heure_prevue: string
  motif: string
  adresse_siege: string | null
}

interface Props {
  passage: PassageSiege
}

const ADRESSE_SIEGE_DEFAUT = '123 Rue de la Bandido, 34160 Castries'

export default function PassageCarte({ passage }: Props) {
  const [done, setDone]                       = useState(false)
  const [loading, setLoading]                 = useState(false)
  const [journeeCloturee, setJourneeCloturee] = useState(false)

  const adresse = passage.adresse_siege ?? ADRESSE_SIEGE_DEFAUT

  async function handleEffectuer() {
    setLoading(true)
    try {
      const res = await fetch(`/api/passages-siege/${passage.id}/effectuer`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setDone(true)
        setJourneeCloturee(data.journee_cloturee ?? false)
      }
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 rounded-2xl border border-green-200 p-5 text-center">
        <p className="text-2xl mb-1">✅</p>
        <p className="font-semibold text-green-700 text-sm">Commande récupérée</p>
        {journeeCloturee && (
          <p className="text-xs text-green-600 mt-1">Journée clôturée — bon travail !</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <span className="text-xl">📦</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800">Passage au siège</p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: '#0BBFBF' }}>
            {passage.heure_prevue.slice(0, 5)}
          </p>
          <p className="text-sm text-slate-500 truncate">{adresse}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{passage.motif}</p>
        </div>
      </div>
      <div className="px-4 pb-4 pt-0 flex flex-col gap-2">
        <a
          href={wazeUrl({ adresse })}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-11 rounded-xl font-semibold text-sm text-white active:opacity-80 transition-opacity"
          style={{ background: 'linear-gradient(135deg,#0BBFBF,#0A8F8F)' }}
        >
          🧭 Itinéraire Waze
        </a>
        <button
          onClick={handleEffectuer}
          disabled={loading}
          className="w-full h-11 rounded-xl font-semibold text-sm border-2 border-[#0BBFBF] text-[#0BBFBF] active:bg-[#0BBFBF]/10 disabled:opacity-50 transition-colors"
        >
          {loading ? '…' : 'Commande récupérée ✓'}
        </button>
      </div>
    </div>
  )
}
