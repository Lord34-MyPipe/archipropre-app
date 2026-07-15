'use client'

import { QrCode } from 'lucide-react'

interface Props {
  residenceNom: string
  libelle: string | null
  token: string
}

// Bouton QR de l'en-tête contrat — télécharge le PDF du QR code du contrat.
export default function ContratHeaderQR({ residenceNom, libelle, token }: Props) {
  async function handleQR() {
    const { downloadQRContratPDF } = await import('@/lib/qr-pdf')
    downloadQRContratPDF(residenceNom, { libelle, token }, window.location.origin)
  }
  return (
    <button
      onClick={handleQR}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-white hover:bg-white/20 transition-colors"
    >
      <QrCode className="w-4 h-4" /> QR Code
    </button>
  )
}
