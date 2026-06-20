'use client'

import { useState } from 'react'
import JourneeAgentPanel from './JourneeAgentPanel'

interface Props {
  agentId: string
  agentNom: string
  date: string
  prenomAgent: string
}

export default function RapportsActions({ agentId, agentNom, date, prenomAgent }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors"
        style={{ background: '#E6F1FB', color: '#185FA5' }}
      >
        Journée de {prenomAgent}
      </button>

      <JourneeAgentPanel
        open={open}
        onClose={() => setOpen(false)}
        agentId={agentId}
        agentNom={agentNom}
        date={date}
      />
    </>
  )
}
