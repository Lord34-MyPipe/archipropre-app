import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

/** Génère un Data URL PNG du QR code pour une URL donnée */
export async function generateQRDataURL(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: '#0A2E5A', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  })
}

interface ResidenceInfo {
  nom: string
  adresse: string
  token: string
}

/**
 * Génère et télécharge un PDF imprimable A5 avec :
 * - Logo / nom société
 * - Nom et adresse de la résidence
 * - QR code bien visible
 * - Instructions pour l'agent
 */
export async function downloadQRCodePDF(
  residence: ResidenceInfo,
  appUrl: string
): Promise<void> {
  const scanUrl = `${appUrl}/agent/scan?token=${residence.token}`
  const qrDataUrl = await generateQRDataURL(scanUrl)

  // Format A5 paysage (148 × 210 mm)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  const W = 148, H = 210

  // ── Fond header ──────────────────────────────────────────────
  doc.setFillColor(10, 46, 90)        // #0A2E5A
  doc.rect(0, 0, W, 42, 'F')

  // Nom société
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('ARCHIPROPRE', W / 2, 16, { align: 'center' })

  // Sous-titre
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 210, 240)
  doc.text('Services de nettoyage · Montpellier', W / 2, 23, { align: 'center' })

  // Bande turquoise
  doc.setFillColor(11, 191, 191)      // #0BBFBF
  doc.rect(0, 32, W, 4, 'F')

  // Trait décoratif bas header
  doc.setFillColor(26, 95, 168)       // #1A5FA8
  doc.rect(0, 36, W, 6, 'F')

  // ── Nom résidence ────────────────────────────────────────────
  doc.setTextColor(10, 46, 90)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  const nomLines = doc.splitTextToSize(residence.nom, W - 20) as string[]
  doc.text(nomLines, W / 2, 56, { align: 'center' })

  // Adresse
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 100, 130)
  const addrLines = doc.splitTextToSize(residence.adresse, W - 24) as string[]
  doc.text(addrLines, W / 2, 56 + nomLines.length * 8 + 4, { align: 'center' })

  // ── QR Code ───────────────────────────────────────────────────
  const qrSize = 80
  const qrX = (W - qrSize) / 2
  const qrY = 82

  // Cadre blanc avec ombre simulée
  doc.setFillColor(240, 244, 248)
  doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 4, 4, 'F')
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 3, 3, 'F')

  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

  // ── Instructions ─────────────────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(10, 46, 90)
  doc.text('SCANNEZ CE CODE AVANT DE COMMENCER', W / 2, qrY + qrSize + 14, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 120, 150)
  doc.setFontSize(8)
  doc.text('Ouvrez l\'application Archipropre sur votre téléphone', W / 2, qrY + qrSize + 21, { align: 'center' })
  doc.text('et scannez ce QR code pour démarrer votre intervention.', W / 2, qrY + qrSize + 27, { align: 'center' })

  // ── Pied de page ─────────────────────────────────────────────
  doc.setFillColor(10, 46, 90)
  doc.rect(0, H - 18, W, 18, 'F')

  doc.setTextColor(120, 160, 200)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('Ne pas retirer — Document à usage exclusif des agents Archipropre', W / 2, H - 10, { align: 'center' })
  doc.setTextColor(60, 100, 150)
  doc.text(residence.token, W / 2, H - 5, { align: 'center' })

  doc.save(`QR_${residence.nom.replace(/\s+/g, '_')}.pdf`)
}
