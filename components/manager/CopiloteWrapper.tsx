'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import CopilotePanel from './CopilotePanel'

export default function CopiloteWrapper() {
  const [open, setOpen]   = useState(false)
  const searchParams       = useSearchParams()
  const dateParam          = searchParams.get('date')

  return (
    <>
      {/* Bouton flottant copilote */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le copilote planning"
        className="fixed bottom-6 right-6 z-40 w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{ background: '#0BBFBF', bottom: '5.5rem' }}
        title="Copilote planning IA"
      >
        <span className="text-white text-2xl leading-none">🤖</span>
      </button>

      <CopilotePanel open={open} onClose={() => setOpen(false)} semaine={dateParam} />
    </>
  )
}
