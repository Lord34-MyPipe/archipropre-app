import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

export async function generateQRDataURL(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: '#0A2E5A', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  })
}

// ── Helper interne : rendu d'une page QR dans un doc jsPDF ──────────────────
// Apostrophes et caractères Latin-1 OK ; pas de symboles Unicode speciaux.
function renderQRPage(
  doc: jsPDF,
  residenceNom: string,
  contratLibelle: string,
  qrDataUrl: string,
  token: string,
): void {
  const W = 148, H = 210

  doc.setFillColor(10, 46, 90)
  doc.rect(0, 0, W, 42, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('ARCHIPROPRE', W / 2, 16, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 210, 240)
  doc.text('Services de nettoyage - Montpellier', W / 2, 23, { align: 'center' })
  doc.setFillColor(11, 191, 191)
  doc.rect(0, 32, W, 4, 'F')
  doc.setFillColor(26, 95, 168)
  doc.rect(0, 36, W, 6, 'F')

  doc.setTextColor(10, 46, 90)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  const nomLines = doc.splitTextToSize(residenceNom, W - 20) as string[]
  doc.text(nomLines, W / 2, 56, { align: 'center' })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(11, 140, 140)
  const libLines = doc.splitTextToSize(contratLibelle, W - 24) as string[]
  doc.text(libLines, W / 2, 56 + nomLines.length * 7 + 5, { align: 'center' })

  const qrSize = 80
  const qrX = (W - qrSize) / 2
  const qrY = 86
  doc.setFillColor(240, 244, 248)
  doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 4, 4, 'F')
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 3, 3, 'F')
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(10, 46, 90)
  doc.text('SCANNEZ CE CODE AVANT DE COMMENCER', W / 2, qrY + qrSize + 14, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 120, 150)
  doc.setFontSize(8)
  doc.text("Ouvrez l'application Archipropre sur votre telephone", W / 2, qrY + qrSize + 21, { align: 'center' })
  doc.text('et scannez ce QR code pour demarrer votre intervention.', W / 2, qrY + qrSize + 27, { align: 'center' })

  doc.setFillColor(10, 46, 90)
  doc.rect(0, H - 18, W, 18, 'F')
  doc.setTextColor(120, 160, 200)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('Ne pas retirer - Document a usage exclusif des agents Archipropre', W / 2, H - 10, { align: 'center' })
  doc.setTextColor(60, 100, 150)
  doc.text(token, W / 2, H - 5, { align: 'center' })
}

// ── PDF par contrat (bouton sur la carte contrat) ────────────────────────────
export async function downloadQRContratPDF(
  residenceNom: string,
  contrat: { libelle: string | null; token: string },
  appUrl: string,
): Promise<void> {
  const scanUrl = `${appUrl}/agent/scan?token=${contrat.token}`
  const qrDataUrl = await generateQRDataURL(scanUrl)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  renderQRPage(doc, residenceNom, contrat.libelle ?? 'Contrat', qrDataUrl, contrat.token)
  const slug = (contrat.libelle ?? 'contrat').replace(/\s+/g, '_')
  doc.save(`QR_${residenceNom.replace(/\s+/g, '_')}_${slug}.pdf`)
}

// ── PDF multi-contrats (bouton grille du haut — tous les actifs) ─────────────
export interface ContratForPDF {
  libelle: string | null
  qr_code_token: string | null
}

export async function downloadQRAllContratsPDF(
  residenceNom: string,
  contrats: ContratForPDF[],
  appUrl: string,
): Promise<void> {
  const actifs = contrats.filter(c => c.qr_code_token)
  if (actifs.length === 0) return

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })

  for (let i = 0; i < actifs.length; i++) {
    const c = actifs[i]
    if (i > 0) doc.addPage()
    const scanUrl = `${appUrl}/agent/scan?token=${c.qr_code_token!}`
    const qrDataUrl = await generateQRDataURL(scanUrl)
    renderQRPage(doc, residenceNom, c.libelle ?? 'Contrat', qrDataUrl, c.qr_code_token!)
  }

  doc.save(`QR_${residenceNom.replace(/\s+/g, '_')}_tous_contrats.pdf`)
}

// ── Conservé pour compatibilité (ancienne API résidence-niveau) ──────────────
interface ResidenceInfo { nom: string; adresse: string; token: string }

export async function downloadQRCodePDF(residence: ResidenceInfo, appUrl: string): Promise<void> {
  await downloadQRContratPDF(
    residence.nom,
    { libelle: residence.adresse || null, token: residence.token },
    appUrl,
  )
}
