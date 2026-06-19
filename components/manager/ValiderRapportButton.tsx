'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ValiderRapportButton({ interventionId }: { interventionId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [toast, setToast]   = useState(false)

  async function handleValider() {
    setLoading(true)
    const res = await fetch(`/api/interventions/${interventionId}/valider`, { method: 'PATCH' })
    setLoading(false)
    if (res.ok) {
      setToast(true)
      setTimeout(() => {
        setToast(false)
        router.refresh()
      }, 1200)
    }
  }

  return (
    <>
      <button
        onClick={handleValider}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60"
        style={{ background: '#3B6D11' }}
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
          </svg>
        )}
        Valider le rapport
      </button>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg"
          style={{ background: '#3B6D11' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
          </svg>
          Rapport validé ✓
        </div>
      )}
    </>
  )
}
