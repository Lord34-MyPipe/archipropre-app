'use client'

import { useState } from 'react'
import { downloadQRCodePDF } from '@/lib/qr-pdf'

interface Props {
  nom: string
  adresse: string
  token: string
}

export default function QRCodeButton({ nom, adresse, token }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      // NEXT_PUBLIC_APP_URL en prod, window.location.origin en dev
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
      await downloadQRCodePDF({ nom, adresse, token }, appUrl)
    } catch (e) {
      console.error(e)
      alert('Erreur lors de la génération du PDF.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#0A2E5A] text-white text-xs font-semibold rounded-lg hover:bg-[#1A5FA8] active:scale-95 transition-all disabled:opacity-60"
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/>
        </svg>
      )}
      {loading ? 'Génération…' : 'QR Code PDF'}
    </button>
  )
}
