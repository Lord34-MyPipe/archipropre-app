'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  commandeId: string
  statutActuel: string
}

export default function CommandeStatutButtons({ commandeId, statutActuel }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (statutActuel === 'livre') return null

  async function updateStatut(statut: string) {
    setLoading(true)
    await fetch(`/api/commandes/${commandeId}/statut`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="flex gap-2">
      {statutActuel === 'en_attente' && (
        <button
          disabled={loading}
          onClick={() => updateStatut('commande')}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          Marquer commandé
        </button>
      )}
      <button
        disabled={loading}
        onClick={() => updateStatut('livre')}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
      >
        Marquer livré
      </button>
    </div>
  )
}
