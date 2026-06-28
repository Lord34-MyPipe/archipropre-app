'use client'

import { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'

export interface LigneCommande {
  id: string
  type_ligne: string
  produit_id: string | null
  quantite: number
  localisation: string | null
  photo_avant_path: string | null
  photo_apres_path: string | null
  produits: { nom: string } | null
}

export interface CommandeDrawer {
  id: string
  statut: string
  created_at: string
  residences: { nom: string } | { nom: string }[] | null
  profiles: { prenom: string; nom: string } | { prenom: string; nom: string }[] | null
  lignes_commande: LigneCommande[]
}

interface Props {
  open: boolean
  onClose: () => void
  commande: CommandeDrawer | null
  managerNom: string
  onStatusChange: (id: string, statut: string) => void
}

function getNom(c: CommandeDrawer): string {
  const r = c.residences
  const obj = Array.isArray(r) ? r[0] : r
  return obj?.nom ?? '—'
}

function getAgent(c: CommandeDrawer): { prenom: string; nom: string } | null {
  const p = c.profiles
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function dateCommande(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/Paris',
  })
}

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function genererPDF(
  commande: CommandeDrawer,
  managerNom: string,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const nomResidence = getNom(commande)
  const agent = getAgent(commande)
  const nomAgent = agent ? `${agent.prenom} ${agent.nom}` : '—'
  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
  const dateAffichee = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/Paris',
  })

  const lignesProduits = commande.lignes_commande.filter(l => l.type_ligne === 'produit')
  const lignesAmpoules = commande.lignes_commande.filter(l => l.type_ligne === 'ampoule')

  const marginL = 20
  const pageW   = 210
  let y = 20

  // ── En-tête ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(10, 46, 90) // #0A2E5A
  doc.text('ARCHIPROPRE', marginL, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 100)
  doc.text(dateAffichee, pageW - marginL, y, { align: 'right' })
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(30, 30, 30)
  doc.text(`Liste de préparation — ${nomResidence}`, marginL, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text(
    `Agent : ${nomAgent}  ·  Résidence : ${nomResidence}  ·  ${dateCommande(commande.created_at)}`,
    marginL, y,
  )
  y += 6

  // Séparateur
  doc.setDrawColor(220, 220, 220)
  doc.line(marginL, y, pageW - marginL, y)
  y += 8

  // ── Tableau produits ─────────────────────────────────────────────────────
  if (lignesProduits.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(10, 46, 90)
    doc.text('Produits à préparer', marginL, y)
    y += 6

    // Entête colonnes
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(80, 80, 80)
    doc.text('☐  Produit', marginL, y)
    doc.text('Qté', pageW - marginL, y, { align: 'right' })
    doc.setDrawColor(210, 210, 210)
    y += 2
    doc.line(marginL, y, pageW - marginL, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(30, 30, 30)

    for (const ligne of lignesProduits) {
      const nomProduit = ligne.produits?.nom ?? `Produit ${ligne.produit_id?.slice(0, 8)}`
      doc.text(`☐  ${nomProduit}`, marginL, y)
      doc.text(String(ligne.quantite), pageW - marginL, y, { align: 'right' })
      doc.setDrawColor(235, 235, 235)
      doc.line(marginL, y + 1.5, pageW - marginL, y + 1.5)
      y += 7

      if (y > 260) {
        doc.addPage()
        y = 20
      }
    }
    y += 4
  }

  // ── Signalements ampoules ─────────────────────────────────────────────────
  if (lignesAmpoules.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(10, 46, 90)
    doc.text('Signalements', marginL, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(50, 50, 50)

    for (const ligne of lignesAmpoules) {
      doc.text(`• Ampoule défectueuse — ${ligne.localisation ?? 'localisation inconnue'}`, marginL + 2, y)
      y += 5
      doc.setFontSize(8)
      doc.setTextColor(120, 120, 120)
      doc.text('  Voir photos dans l\'application', marginL + 4, y)
      doc.setFontSize(9)
      doc.setTextColor(50, 50, 50)
      y += 6
    }
    y += 2
  }

  // Séparateur pied de page
  doc.setDrawColor(220, 220, 220)
  const footerY = 275
  doc.line(marginL, footerY, pageW - marginL, footerY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(110, 110, 110)
  doc.text(`Préparé le ${dateAffichee} par ${managerNom}`, marginL, footerY + 5)
  doc.text('Signature : _______________', pageW - marginL, footerY + 5, { align: 'right' })

  const slug     = slugify(nomResidence)
  const fileName = `preparation-${slug}-${today}.pdf`
  doc.save(fileName)
}

export default function CommandeDetailDrawer({ open, onClose, commande, managerNom, onStatusChange }: Props) {
  const [photos, setPhotos]   = useState<Record<string, string>>({})
  const [markingReady, setMarkingReady] = useState(false)

  useEffect(() => {
    if (!open || !commande) return
    setPhotos({})
    fetch(`/api/commandes/${commande.id}/photos`)
      .then(r => r.ok ? r.json() : { photos: {} })
      .then(d => setPhotos(d.photos ?? {}))
      .catch(() => {})
  }, [open, commande?.id])

  async function handleCommandePretz() {
    if (!commande) return
    setMarkingReady(true)
    try {
      const res = await fetch(`/api/commandes/${commande.id}/statut`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ statut: 'commande' }),
      })
      if (res.ok) {
        onStatusChange(commande.id, 'commande')
        onClose()
      }
    } finally {
      setMarkingReady(false)
    }
  }

  if (!open || !commande) return null

  const nomResidence = getNom(commande)
  const agent        = getAgent(commande)
  const lignesProduits = commande.lignes_commande.filter(l => l.type_ligne === 'produit')
  const lignesAmpoules = commande.lignes_commande.filter(l => l.type_ligne === 'ampoule')

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panneau */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl"
        style={{ width: 420, maxWidth: '100vw' }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-start justify-between shrink-0" style={{ background: '#0A2E5A' }}>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">
              Commande — {nomResidence}
            </h2>
            <p className="text-blue-300 text-sm mt-0.5">
              {agent ? `${agent.prenom} ${agent.nom}` : '—'}
              {' · '}
              {dateCommande(commande.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white mt-0.5 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto">

          {/* Section produits */}
          {lignesProduits.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Produits à préparer
              </p>
              <div className="space-y-0 divide-y divide-slate-50">
                {lignesProduits.map(ligne => (
                  <div key={ligne.id} className="flex items-center gap-3 py-3">
                    {/* Checkbox visuelle (impression) */}
                    <div className="w-4 h-4 rounded border-2 border-slate-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {ligne.produits?.nom ?? `Produit (${ligne.produit_id?.slice(0, 8)})`}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-slate-700 tabular-nums shrink-0">
                      ×{ligne.quantite}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lignesProduits.length === 0 && (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-slate-400">Aucun produit dans cette commande.</p>
            </div>
          )}

          {/* Section ampoules */}
          {lignesAmpoules.length > 0 && (
            <div className="px-5 py-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Signalements
              </p>
              <div className="space-y-4">
                {lignesAmpoules.map(ligne => (
                  <div key={ligne.id} className="rounded-xl border border-amber-100 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">💡</span>
                      <p className="text-sm font-medium text-amber-900">
                        {ligne.localisation ?? 'Localisation non précisée'}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Photo avant */}
                      <div>
                        <p className="text-xs text-amber-700 mb-1">Avant</p>
                        {ligne.photo_avant_path && photos[ligne.photo_avant_path] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photos[ligne.photo_avant_path]}
                            alt="Photo avant"
                            className="w-full h-24 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-24 bg-amber-100 rounded-lg flex items-center justify-center">
                            <p className="text-xs text-amber-500">Aucune photo</p>
                          </div>
                        )}
                      </div>
                      {/* Photo après */}
                      <div>
                        <p className="text-xs text-amber-700 mb-1">Après</p>
                        {ligne.photo_apres_path && photos[ligne.photo_apres_path] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photos[ligne.photo_apres_path]}
                            alt="Photo après"
                            className="w-full h-24 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-24 bg-amber-100 rounded-lg flex items-center justify-center">
                            <p className="text-xs text-amber-500">Aucune photo</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer sticky */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white shrink-0 space-y-2">
          <button
            onClick={() => genererPDF(commande, managerNom)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ background: '#0A2E5A' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
            </svg>
            Télécharger la liste PDF
          </button>

          {commande.statut === 'en_attente' && (
            <button
              onClick={handleCommandePretz}
              disabled={markingReady}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#0BBFBF,#1A5FA8)' }}
            >
              {markingReady ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                </svg>
              )}
              Commande prête
            </button>
          )}
        </div>
      </div>
    </>
  )
}
