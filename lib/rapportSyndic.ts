import jsPDF from 'jspdf'

// Export PDF rapport syndic (P3-2, étape S4). Même pattern que lib/rapportRH.ts
// (jsPDF côté client, en-tête Archipropre, mise en page manuelle A4).
//
// INTERDIT ABSOLU : aucune durée, heure, coût, marge — le payload n'en contient
// pas, ce fichier ne va rien chercher ailleurs.
//
// Leçon jsPDF : les polices standard (helvetica) gèrent très bien les accents
// français (é, è, à, â, ê, ù, ç…) via WinAnsiEncoding — déjà utilisé sans
// problème dans lib/rapportRH.ts ("Rapport RH mensuel", "Août", tiret cadratin
// "—"). Ce qui CASSE en revanche, ce sont les symboles hors de ce jeu de
// caractères (▲ ⚠ ✓ → • □ …) : on les évite ici et on utilise des marqueurs
// ASCII simples ("!", "-") à la place, comme le fait déjà rapportRH.ts
// (">>", "++").

interface PhotoPdf { zone_nom: string; photo_url: string; signed_url: string | null }
interface TacheNonRealiseePdf { zone_nom: string; libelle: string; commentaire: string; date: string }
interface BatimentPdf {
  libelle: string | null
  dates_passage: string[]
  zones_traitees: string[]
  photos: PhotoPdf[]
  taches_non_realisees: TacheNonRealiseePdf[]
}

interface RapportSyndicPdfParams {
  residence: { nom: string; adresse: string | null }
  periode: { debut: string; fin: string; libelle: string }
  nb_passages: number
  batiments: BatimentPdf[]
  avecPhotos: boolean
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre']

const PAGE_WIDTH  = 210
const PAGE_HEIGHT = 297
const MARGIN = 15
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const FOOTER_Y = 280

function formatDateCourt(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MOIS_FR[m - 1]}`
}

// "17 juillet 2026" ou "2, 6, 9 juin 2026" — regroupe les jours par mois
function formatDatesPassage(dates: string[]): string {
  const groupes = new Map<string, number[]>()
  for (const d of dates) {
    const [y, m, day] = d.split('-').map(Number)
    const key = `${y}-${m}`
    const arr = groupes.get(key)
    if (arr) arr.push(day)
    else groupes.set(key, [day])
  }
  const parts: string[] = []
  for (const [key, days] of groupes) {
    const [y, m] = key.split('-').map(Number)
    parts.push(`${days.sort((a, b) => a - b).join(', ')} ${MOIS_FR[m - 1]} ${y}`)
  }
  return parts.join(' · ')
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Charge une photo (URL signée) et produit une vignette carrée (recadrage
// centré) en JPEG compressé — poids maîtrisé pour le PDF. Échec silencieux
// (CORS, image supprimée, etc.) : la photo est simplement omise, jamais de
// case cassée dans le PDF.
async function chargerVignetteCarree(url: string, taillePx = 360, qualite = 0.6): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.crossOrigin = 'anonymous'
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image indisponible'))
      el.src = url
    })
    const cote = Math.min(img.width, img.height)
    const sx = (img.width - cote) / 2
    const sy = (img.height - cote) / 2
    const canvas = document.createElement('canvas')
    canvas.width = taillePx
    canvas.height = taillePx
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, sx, sy, cote, cote, 0, 0, taillePx, taillePx)
    return canvas.toDataURL('image/jpeg', qualite)
  } catch {
    return null
  }
}

export async function genererRapportSyndicPDF(params: RapportSyndicPdfParams): Promise<void> {
  const { residence, periode, nb_passages, batiments, avecPhotos } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = 0

  function ensureSpace(needed: number) {
    if (y + needed > FOOTER_Y - 5) {
      doc.addPage()
      y = 15
    }
  }

  // ── EN-TÊTE ───────────────────────────────────────────────────────────────
  doc.setFillColor(10, 46, 90)
  doc.rect(0, 0, PAGE_WIDTH, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('ARCHIPROPRE SERVICES', MARGIN, 12)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text("Rapport d'intervention", MARGIN, 20)
  doc.setFontSize(9)
  doc.text(periode.libelle, PAGE_WIDTH - MARGIN, 20, { align: 'right' })

  y = 42
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(residence.nom, MARGIN, y)
  y += 6
  if (residence.adresse) {
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(90, 90, 90)
    doc.text(residence.adresse, MARGIN, y)
    y += 9
  } else {
    y += 4
  }

  // ── RÉCAP (chiffres factuels, aucun pourcentage) ───────────────────────────
  doc.setFillColor(234, 242, 255)
  doc.rect(MARGIN, y, CONTENT_WIDTH, 12, 'F')
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(10, 46, 90)
  const libellePassages = `${nb_passages} passage${nb_passages > 1 ? 's' : ''} réalisé${nb_passages > 1 ? 's' : ''}`
  const libelleBatiments = `${batiments.length} bâtiment${batiments.length > 1 ? 's' : ''} couvert${batiments.length > 1 ? 's' : ''}`
  doc.text(`${libellePassages}  -  ${libelleBatiments}`, MARGIN + 3, y + 8)
  y += 20

  // ── CALENDRIER (liste lisible, pas de grille visuelle) ─────────────────────
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(10, 46, 90)
  doc.text('Calendrier des passages', MARGIN, y)
  y += 6

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)
  const toutesDates = [...new Set(batiments.flatMap(b => b.dates_passage))].sort()
  if (toutesDates.length === 0) {
    doc.text('Aucun passage sur cette période.', MARGIN, y)
    y += 8
  } else {
    const groupes = new Map<string, number[]>()
    for (const d of toutesDates) {
      const [yy, mm, dd] = d.split('-').map(Number)
      const key = `${yy}-${mm}`
      const arr = groupes.get(key)
      if (arr) arr.push(dd)
      else groupes.set(key, [dd])
    }
    for (const [key, jours] of groupes) {
      ensureSpace(6)
      const [yy, mm] = key.split('-').map(Number)
      const moisTxt = MOIS_FR[mm - 1]
      doc.text(`${moisTxt.charAt(0).toUpperCase()}${moisTxt.slice(1)} ${yy} : ${jours.sort((a, b) => a - b).join(', ')}`, MARGIN, y)
      y += 5.5
    }
    y += 4
  }

  // ── PAR BÂTIMENT (condensé) ─────────────────────────────────────────────────
  ensureSpace(12)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(10, 46, 90)
  doc.text('Détail par bâtiment', MARGIN, y)
  y += 8

  for (const b of batiments) {
    ensureSpace(20)

    if (b.libelle) {
      doc.setFillColor(234, 242, 255)
      doc.rect(MARGIN, y, CONTENT_WIDTH, 8, 'F')
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(26, 95, 168)
      doc.text(b.libelle, MARGIN + 3, y + 5.5)
      y += 12
    }

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(120, 120, 120)
    doc.text('Dates de passage', MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    const datesTxt = doc.splitTextToSize(formatDatesPassage(b.dates_passage) || '-', CONTENT_WIDTH)
    doc.text(datesTxt, MARGIN, y + 4.5)
    y += 4.5 + datesTxt.length * 4.2 + 3

    ensureSpace(14)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(120, 120, 120)
    doc.text('Zones traitées', MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    const zonesTxt = doc.splitTextToSize(b.zones_traitees.join(', ') || '-', CONTENT_WIDTH)
    doc.text(zonesTxt, MARGIN, y + 4.5)
    y += 4.5 + zonesTxt.length * 4.2 + 4

    // Photos (uniquement si le toggle "avec photos" est actif)
    if (avecPhotos && b.photos.length > 0) {
      const vignettes = await Promise.all(
        b.photos.map(p => p.signed_url ? chargerVignetteCarree(p.signed_url) : Promise.resolve(null))
      )
      const valides = b.photos
        .map((p, i) => ({ zone: p.zone_nom, dataUrl: vignettes[i] }))
        .filter((v): v is { zone: string; dataUrl: string } => v.dataUrl !== null)

      if (valides.length > 0) {
        const cellSize = 38, gap = 4, parLigne = 4
        for (let i = 0; i < valides.length; i += parLigne) {
          const ligne = valides.slice(i, i + parLigne)
          ensureSpace(cellSize + 10)
          ligne.forEach((item, idx) => {
            const x = MARGIN + idx * (cellSize + gap)
            doc.addImage(item.dataUrl, 'JPEG', x, y, cellSize, cellSize)
            doc.setFontSize(6.5)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(110, 110, 110)
            const label = item.zone.length > 20 ? `${item.zone.slice(0, 18)}..` : item.zone
            doc.text(label, x + cellSize / 2, y + cellSize + 4, { align: 'center' })
          })
          y += cellSize + 10
        }
      }
    }

    // Tâches non réalisées commentées — uniquement si présentes
    if (b.taches_non_realisees.length > 0) {
      ensureSpace(8)
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(163, 45, 45)
      doc.text('Tâches non réalisées signalées', MARGIN, y)
      y += 5

      for (const t of b.taches_non_realisees) {
        const ligne = `! ${t.zone_nom} - ${t.libelle} (${formatDateCourt(t.date)}) : ${t.commentaire}`
        doc.setFontSize(8.5)
        doc.setFont('helvetica', 'normal')
        const wrapped = doc.splitTextToSize(ligne, CONTENT_WIDTH - 4)
        ensureSpace(wrapped.length * 4.2 + 2)
        doc.setTextColor(140, 70, 30)
        doc.text(wrapped, MARGIN + 2, y)
        y += wrapped.length * 4.2 + 2
      }
      y += 2
    }

    y += 6
  }

  // ── PIED DE PAGE (toutes les pages) ─────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, FOOTER_Y, PAGE_WIDTH - MARGIN, FOOTER_Y)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(120, 120, 120)
    doc.text('Archipropre Services - 123 Rue de la Bandido, 34160 Castries', MARGIN, FOOTER_Y + 5)
    doc.text('Tél. 06 74 92 85 51 - contact@archipropre-services.com', MARGIN, FOOTER_Y + 9.5)
    doc.text(`Page ${i}/${totalPages}`, PAGE_WIDTH - MARGIN, FOOTER_Y + 9.5, { align: 'right' })
  }

  const nomFichier = `rapport-syndic_${slugify(residence.nom)}_${slugify(periode.libelle)}.pdf`
  doc.save(nomFichier)
}
