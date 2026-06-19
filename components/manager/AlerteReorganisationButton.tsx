'use client'

import { useState } from 'react'

interface Props {
  alerteId: string
  message: string
}

export default function AlerteReorganisationButton({ message }: Props) {
  const [toast, setToast] = useState('')

  function handleClick() {
    setToast('Moteur IA en cours de développement')
    setTimeout(() => setToast(''), 3000)
    console.log('[IA Réorganisation] déclenchement demandé :', message)
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
        </svg>
        Réorganiser avec l'IA
      </button>

      {toast && (
        <div className="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#0A2E5A] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none">
          {toast}
        </div>
      )}
    </>
  )
}
