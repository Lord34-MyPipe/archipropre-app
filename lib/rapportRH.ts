import jsPDF from 'jspdf'

interface JourneeRH {
  date: string
  total_minutes_terrain: number | null
  total_minutes_trajets: number | null
  validee_at: string | null
}

interface RapportRHParams {
  agent: { prenom: string; nom: string; contratHeuresHebdo: number }
  manager: { nom: string }
  mois: number
  annee: number
  journees: JourneeRH[]
}

function formatMinutes(min: number): string {
  if (min === 0) return '0 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export function genererRapportRHPDF(params: RapportRHParams) {
  const { agent, manager, mois, annee, journees } = params
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const nomMois = new Date(annee, mois - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const nomMoisCapitalized = nomMois.charAt(0).toUpperCase() + nomMois.slice(1)

  // ── EN-TÊTE ───────────────────────────────────────────────────────────────
  doc.setFillColor(10, 46, 90)
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('ARCHIPROPRE', 15, 12)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Rapport RH mensuel', 15, 20)
  doc.text(nomMoisCapitalized, 195, 20, { align: 'right' })

  // ── INFOS AGENT ───────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(`${agent.prenom} ${agent.nom}`, 15, 42)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Contrat : ${agent.contratHeuresHebdo}h / semaine`, 15, 50)
  const contratMensuelH = Math.round(agent.contratHeuresHebdo * 4.33 * 10) / 10
  const contratMensuelMin = Math.round(agent.contratHeuresHebdo * 4.33 * 60)
  doc.text(
    `Contrat mensuel estimé : ${contratMensuelH}h  (${agent.contratHeuresHebdo}h × 4,33 semaines)`,
    15, 57
  )

  // ── TABLEAU EN-TÊTE ───────────────────────────────────────────────────────
  const COL = { date: 17, terrain: 90, trajets: 130, total: 168 }
  let y = 70

  doc.setFillColor(228, 232, 240)
  doc.rect(15, y, 180, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(30, 40, 70)
  doc.text('Date', COL.date, y + 5.5)
  doc.text('Terrain', COL.terrain, y + 5.5)
  doc.text('Trajets', COL.trajets, y + 5.5)
  doc.text('Total journée', COL.total, y + 5.5)
  y += 8

  // ── LIGNES ────────────────────────────────────────────────────────────────
  let totalTerrainMin = 0
  let totalTrajetsMin = 0

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0)

  journees.forEach((j, idx) => {
    const terrain = j.total_minutes_terrain ?? 0
    const trajets = j.total_minutes_trajets ?? 0
    const total = terrain + trajets
    totalTerrainMin += terrain
    totalTrajetsMin += trajets

    if (idx % 2 === 0) {
      doc.setFillColor(249, 250, 252)
      doc.rect(15, y, 180, 7, 'F')
    }

    const dateFormatee = new Date(j.date + 'T12:00:00Z')
      .toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    doc.setFontSize(9)
    doc.text(dateFormatee, COL.date, y + 5)
    doc.text(formatMinutes(terrain), COL.terrain, y + 5)
    doc.text(formatMinutes(trajets), COL.trajets, y + 5)
    doc.setFont('helvetica', 'bold')
    doc.text(formatMinutes(total), COL.total, y + 5)
    doc.setFont('helvetica', 'normal')
    y += 7
  })

  if (journees.length === 0) {
    doc.setTextColor(150, 150, 150)
    doc.setFontSize(9)
    doc.text('Aucune journée validée sur ce mois.', COL.date, y + 5)
    doc.setTextColor(0, 0, 0)
    y += 7
  }

  // ── LIGNE TOTAL ───────────────────────────────────────────────────────────
  y += 3
  doc.setDrawColor(10, 46, 90)
  doc.setLineWidth(0.5)
  doc.line(15, y, 195, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  const totalMin = totalTerrainMin + totalTrajetsMin
  doc.text('Total réalisé (validé)', COL.date, y)
  doc.text(formatMinutes(totalTerrainMin), COL.terrain, y)
  doc.text(formatMinutes(totalTrajetsMin), COL.trajets, y)
  doc.text(formatMinutes(totalMin), COL.total, y)

  // ── BILAN ─────────────────────────────────────────────────────────────────
  y += 12
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.3)
  doc.line(15, y - 4, 195, y - 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.text(`Contrat mensuel : ${formatMinutes(contratMensuelMin)}`, COL.date, y)
  y += 7

  const deltaMin = contratMensuelMin - totalMin

  if (deltaMin > 0) {
    doc.setTextColor(163, 45, 45)
    doc.setFont('helvetica', 'bold')
    doc.text(`△ Heures non productives : ${formatMinutes(deltaMin)}`, COL.date, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    y += 6
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.setFont('helvetica', 'italic')
    doc.text("Ces heures sont à la charge de l'employeur (charge insuffisante).", COL.date, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
  } else if (deltaMin < 0) {
    doc.setTextColor(59, 109, 17)
    doc.setFont('helvetica', 'bold')
    doc.text(`+ Heures supplémentaires : ${formatMinutes(Math.abs(deltaMin))}`, COL.date, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
  } else {
    doc.setTextColor(59, 109, 17)
    doc.text('Contrat respecté à l\'heure près.', COL.date, y)
    doc.setTextColor(0, 0, 0)
  }

  // ── SIGNATURE ─────────────────────────────────────────────────────────────
  const sigY = 252
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(15, sigY - 4, 195, sigY - 4)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`Rapport généré le ${new Date().toLocaleDateString('fr-FR')}`, 15, sigY)
  doc.text(`Validé par : ${manager.nom}`, 15, sigY + 6)
  doc.text('Signature : ___________________________', 120, sigY + 6)

  // ── PIED DE PAGE ──────────────────────────────────────────────────────────
  doc.setFillColor(10, 46, 90)
  doc.rect(0, 282, 210, 15, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.text('Archipropre Services — Document confidentiel', 105, 291, { align: 'center' })

  // ── TÉLÉCHARGEMENT ────────────────────────────────────────────────────────
  const nomFichier = `rapport-rh_${agent.nom.toLowerCase()}_${annee}-${String(mois).padStart(2, '0')}.pdf`
  doc.save(nomFichier)
}
