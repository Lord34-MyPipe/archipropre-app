'use client'

import { useState } from 'react'
import type { Residence } from '@/lib/types'
import QRCodeButton from './QRCodeButton'
import RegenerateQRButton from './RegenerateQRButton'
import { createClient } from '@/lib/supabase'

const TYPE_LABEL: Record<string, string> = {
  syndic: 'Syndic', profession_liberale: 'Profession libérale',
  societe: 'Société', magasin: 'Magasin', particulier: 'Particulier',
}

export default function ResidenceCard({ residence: initial }: { residence: Residence }) {
  const [token, setToken] = useState(initial.qr_code_token)
  const [actif, setActif] = useState(initial.actif)
  const [toggling, setToggling] = useState(false)

  async function handleToggleActif() {
    setToggling(true)
    const supabase = createClient()
    const newActif = !actif
    const { error } = await supabase
      .from('residences')
      .update({ actif: newActif })
      .eq('id', initial.id)
    if (!error) setActif(newActif)
    setToggling(false)
  }

  return (
    <div className={`bg-white rounded-2xl border p-5 hover:shadow-md transition-shadow flex flex-col gap-3 ${
      !actif ? 'border-slate-100 opacity-70' : 'border-slate-100'
    }`}>
      {/* En-tête */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <h3 className="font-semibold text-slate-800 leading-snug">{initial.nom}</h3>
          {!actif && (
            <span className="shrink-0 px-2 py-0.5 bg-slate-100 text-slate-400 text-xs rounded-full font-medium mt-0.5">
              En sommeil
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 shrink-0">
          {initial.client_exigeant && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">⚠️ Exigeant</span>
          )}
          {initial.vehicule_requis && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">🚗 Véhicule</span>
          )}
        </div>
      </div>

      {/* Adresse */}
      <p className="text-sm text-slate-500">{initial.adresse}</p>

      {/* Type client */}
      {initial.type_client && (
        <span className="self-start px-2.5 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
          {TYPE_LABEL[initial.type_client] ?? initial.type_client}
        </span>
      )}

      {/* Token */}
      <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-medium">Token QR</p>
        <p className="text-xs text-slate-500 font-mono break-all select-all">{token}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
        <QRCodeButton nom={initial.nom} adresse={initial.adresse} token={token} />
        <RegenerateQRButton
          residenceId={initial.id}
          residenceNom={initial.nom}
          onRegenerated={setToken}
        />

        {/* Toggle actif / en sommeil */}
        <button
          onClick={handleToggleActif}
          disabled={toggling}
          title={actif ? 'Mettre en sommeil' : 'Réactiver'}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${
            actif
              ? 'bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-700'
              : 'bg-green-100 text-green-700 hover:bg-green-200'
          }`}
        >
          {toggling ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : actif ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.563C9 9.252 9.252 9 9.563 9h4.874c.311 0 .563.252.563.563v4.874c0 .311-.252.563-.563.563H9.564A.562.562 0 019 14.437V9.564z"/>
              </svg>
              Mettre en sommeil
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/>
              </svg>
              Réactiver
            </>
          )}
        </button>
      </div>
    </div>
  )
}
