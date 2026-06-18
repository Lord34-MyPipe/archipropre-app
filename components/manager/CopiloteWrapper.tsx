'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import CopilotePanel from './CopilotePanel'

export default function CopiloteWrapper() {
  const [open, setOpen]   = useState(false)
  const searchParams       = useSearchParams()
  const dateParam          = searchParams.get('date')

  return (
    <>
      {/* Bouton flottant ANA */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask ANA the Boss"
        title="Ask ANA the Boss"
        className="fixed z-40 w-[56px] h-[56px] rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95 overflow-hidden ring-[3px] ring-[#0BBFBF]"
        style={{ bottom: '5.5rem', right: '1.5rem' }}
      >
        <Image
          src="/ana-avatar.png"
          alt="ANA"
          width={56}
          height={56}
          className="w-full h-full object-cover object-top"
          priority
        />
      </button>

      <CopilotePanel open={open} onClose={() => setOpen(false)} semaine={dateParam} />
    </>
  )
}
