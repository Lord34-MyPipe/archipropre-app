'use client'

import { useState } from 'react'
import type { Residence } from '@/lib/types'
import QRCodeButton from './QRCodeButton'
import RegenerateQRButton from './RegenerateQRButton'

const TYPE_LABEL: Record<string, string> = {
  syndic: 'Syndic', profession_liberale: 'Profession libérale',
  societe: 'Société', magasin: 'Magasin', particulier: 'Particulier',
}

export default function ResidenceCard({ residence: initial }: { residence: Residence }) {
  // Le token peut changer après régénération — on le garde en state local
  const [token, setToken] = useState(initial.qr_code_token)

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-800 leading-snug">{initial.nom}</h3>
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

      {/* Token (lecture seule) */}
      <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-medium">Token QR (immuable)</p>
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
      </div>
    </div>
  )
}
