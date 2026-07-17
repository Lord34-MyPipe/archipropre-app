'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Calendar, Building2, TriangleAlert, Download, Link2, ImageOff } from 'lucide-react'

// Rapport syndic (P3-2, étape S2) — affichage seulement. Le payload S1 ne
// contient déjà aucune donnée temps/coût (garde-fou côté route) : on n'affiche
// ici que ce que le payload fournit, on n'ajoute jamais de champ heure/durée/
// coût glané ailleurs.

interface PhotoItem { zone_nom: string; photo_url: string; signed_url: string | null }
interface TacheNonRealisee { zone_nom: string; libelle: string; commentaire: string; date: string }
interface BatimentPayload {
  libelle: string | null
  dates_passage: string[]
  zones_traitees: string[]
  photos: PhotoItem[]
  taches_non_realisees: TacheNonRealisee[]
}
interface RapportSyndicPayload {
  residence: { nom: string; adresse: string | null }
  periode: { debut: string; fin: string; libelle: string }
  nb_passages: number
  batiments: BatimentPayload[]
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS_COURT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function moisLabel(m: number) { return `${MOIS_FR[m - 1].charAt(0).toUpperCase()}${MOIS_FR[m - 1].slice(1)}` }

// 13 mois glissants (mois courant + 12 précédents) — même pattern que RapportRHModal
function buildMonthOptions(): { label: string; year: number; month: number }[] {
  const options: { label: string; year: number; month: number }[] = []
  const now = new Date()
  for (let i = 0; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push({ label: `${moisLabel(d.getMonth() + 1)} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return options
}

function moisVersPlage(year: number, month: number): { debut: string; fin: string } {
  const debut = `${year}-${String(month).padStart(2, '0')}-01`
  const dernierJour = new Date(year, month, 0).getDate()
  const fin = `${year}-${String(month).padStart(2, '0')}-${String(dernierJour).padStart(2, '0')}`
  return { debut, fin }
}

// Liste des mois calendaires touchés par [debut,fin], pour afficher un
// calendrier par mois si la période s'étend sur plusieurs mois.
function moisTouches(debut: string, fin: string): { year: number; month: number }[] {
  const [ay, am] = debut.split('-').map(Number)
  const [by, bm] = fin.split('-').map(Number)
  const result: { year: number; month: number }[] = []
  let y = ay, m = am
  while (y < by || (y === by && m <= bm)) {
    result.push({ year: y, month: m })
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return result
}

// "2, 6, 9 juin 2026 · 3, 10 juillet 2026" — groupe les jours par mois
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

function MonthCalendar({ year, month, datesMarquees, debut, fin }: {
  year: number; month: number; datesMarquees: Set<string>; debut: string; fin: string
}) {
  const startWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7 // 0 = lundi
  const nbJours = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = Array(startWeekday).fill(null)
  for (let d = 1; d <= nbJours; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const iso = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5">
      <h3 className="text-sm font-bold text-slate-700 mb-3 capitalize">{moisLabel(month)} {year}</h3>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 mb-1.5">
        {JOURS_COURT.map(j => <div key={j}>{j}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />
          const dateIso = iso(d)
          const marque = datesMarquees.has(dateIso)
          const horsPlage = dateIso < debut || dateIso > fin
          return (
            <div key={i}
              className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                marque ? 'text-white font-bold shadow-sm' : horsPlage ? 'text-slate-300' : 'text-slate-600'
              }`}
              style={marque ? { background: '#0BBFBF' } : undefined}
            >
              {d}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface Props {
  residenceId: string
  residenceNom: string
}

export default function RapportSyndicClient({ residenceId, residenceNom }: Props) {
  const monthOptions = useMemo(buildMonthOptions, [])
  const [mode, setMode]           = useState<'mois' | 'plage'>('mois')
  const [moisIdx, setMoisIdx]     = useState(0)
  const [debutManuel, setDebutManuel] = useState('')
  const [finManuel, setFinManuel]     = useState('')
  const [payload, setPayload]     = useState<RapportSyndicPayload | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  // Toggle avec/sans photos — état d'affichage pur côté client (aucun impact
  // sur la donnée récupérée), pilote aussi le contenu du PDF (S4) : actif →
  // photos incluses (redimensionnées), inactif → PDF texte seul, plus léger.
  const [avecPhotos, setAvecPhotos] = useState(true)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  const { debut, fin } = mode === 'mois'
    ? moisVersPlage(monthOptions[moisIdx].year, monthOptions[moisIdx].month)
    : { debut: debutManuel, fin: finManuel }

  useEffect(() => {
    if (!debut || !fin) return
    setLoading(true)
    setError(null)
    fetch(`/api/residences/${residenceId}/rapport-syndic?debut=${debut}&fin=${fin}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Erreur de chargement')
        return r.json() as Promise<RapportSyndicPayload>
      })
      .then(setPayload)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur de chargement'))
      .finally(() => setLoading(false))
  }, [residenceId, debut, fin])

  const datesMarquees = useMemo(() => {
    const s = new Set<string>()
    for (const b of payload?.batiments ?? []) for (const d of b.dates_passage) s.add(d)
    return s
  }, [payload])

  const mois = debut && fin ? moisTouches(debut, fin) : []

  async function handleTelechargerPdf() {
    if (!payload || generatingPdf) return
    setGeneratingPdf(true)
    try {
      const { genererRapportSyndicPDF } = await import('@/lib/rapportSyndic')
      await genererRapportSyndicPDF({
        residence:   payload.residence,
        periode:     payload.periode,
        nb_passages: payload.nb_passages,
        batiments:   payload.batiments,
        avecPhotos,
      })
    } finally {
      setGeneratingPdf(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">

        <Link href={`/manager/residences/${residenceId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Retour à la résidence
        </Link>

        {/* ── En-tête rapport ── */}
        <div className="rounded-2xl p-6 mb-6 text-white" style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300 mb-2">Archipropre Services</p>
          <h1 className="text-xl font-bold mb-3">RAPPORT D'INTERVENTION</h1>
          <p className="text-lg font-semibold">{payload?.residence.nom ?? residenceNom}</p>
          {payload?.residence.adresse && <p className="text-sm text-blue-200 mt-0.5">{payload.residence.adresse}</p>}
          <p className="text-sm text-blue-200 mt-2 capitalize">{payload?.periode.libelle ?? '…'}</p>
        </div>

        {/* ── Sélecteur de période ── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-6 flex flex-wrap items-end gap-4">
          <div className="flex gap-1.5 bg-slate-100 rounded-xl p-1">
            {(['mois', 'plage'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  mode === m ? 'bg-white text-[#0A2E5A] shadow-sm' : 'text-slate-500'
                }`}>
                {m === 'mois' ? 'Mois' : 'Entre 2 dates'}
              </button>
            ))}
          </div>

          {mode === 'mois' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Mois</label>
              <select
                value={moisIdx}
                onChange={e => setMoisIdx(Number(e.target.value))}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]">
                {monthOptions.map((opt, i) => (
                  <option key={i} value={i}>{opt.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Début</label>
                <input type="date" value={debutManuel} onChange={e => setDebutManuel(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Fin</label>
                <input type="date" value={finManuel} onChange={e => setFinManuel(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]" />
              </div>
            </>
          )}

          {/* Toggle avec/sans photos — purement d'affichage, aucun refetch */}
          <label className="ml-auto flex items-center gap-2.5 cursor-pointer select-none">
            <span className="text-sm font-medium text-slate-600">Avec photos</span>
            <span className="relative inline-block w-10 h-6">
              <input
                type="checkbox"
                checked={avecPhotos}
                onChange={e => setAvecPhotos(e.target.checked)}
                className="sr-only peer"
              />
              <span className="absolute inset-0 rounded-full bg-slate-200 peer-checked:bg-[#0BBFBF] transition-colors" />
              <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </span>
          </label>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">
            Chargement…
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && payload && (
          <>
            {/* ── Chiffres factuels ── */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <p className="text-3xl font-bold text-[#0A2E5A]">{payload.nb_passages}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  passage{payload.nb_passages > 1 ? 's' : ''} réalisé{payload.nb_passages > 1 ? 's' : ''}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-5">
                <p className="text-3xl font-bold text-[#0A2E5A]">{payload.batiments.length}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  bâtiment{payload.batiments.length > 1 ? 's' : ''} couvert{payload.batiments.length > 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* ── Calendrier(s) ── */}
            {mois.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Calendrier des passages
                </h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(mois.length, 3)}, minmax(0,1fr))` }}>
                  {mois.map(({ year, month }) => (
                    <MonthCalendar key={`${year}-${month}`} year={year} month={month}
                      datesMarquees={datesMarquees} debut={debut} fin={fin} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Détail par bâtiment ── */}
            <div className="space-y-4 mb-6">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Détail des interventions</h2>

              {payload.batiments.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-400">
                  Aucun passage réalisé sur cette période.
                </div>
              ) : (
                payload.batiments.map(b => (
                  <div key={b.libelle ?? 'mono'} className="bg-white rounded-2xl border border-slate-100 p-5">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      {b.libelle ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold bg-[#EAF2FF] text-[#1A5FA8]">
                          <Building2 className="w-3.5 h-3.5" /> {b.libelle}
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-slate-500">Zones traitées</span>
                      )}
                      <span className="text-xs text-slate-400">
                        {b.dates_passage.length} passage{b.dates_passage.length > 1 ? 's' : ''}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Dates de passage</p>
                    <p className="text-sm text-slate-700 mb-4 capitalize">{formatDatesPassage(b.dates_passage) || '—'}</p>

                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Zones traitées</p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {b.zones_traitees.length > 0 ? b.zones_traitees.map(z => (
                        <span key={z} className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{z}</span>
                      )) : <span className="text-sm text-slate-400">—</span>}
                    </div>

                    {avecPhotos && (
                      <>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Photos</p>
                        {b.photos.length > 0 ? (
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-4">
                            {b.photos.map((p, i) => (
                              p.signed_url ? (
                                <a key={i} href={p.signed_url} target="_blank" rel="noopener noreferrer"
                                  className="group block">
                                  <div className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={p.signed_url} alt={p.zone_nom}
                                      className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                                  </div>
                                  <span className="block text-[9px] text-slate-400 text-center leading-tight truncate mt-1">{p.zone_nom}</span>
                                </a>
                              ) : (
                                <div key={i}>
                                  <div className="aspect-square rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                                    <ImageOff className="w-5 h-5 text-slate-300" />
                                  </div>
                                  <span className="block text-[9px] text-slate-400 text-center leading-tight truncate mt-1">{p.zone_nom}</span>
                                </div>
                              )
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400 mb-4">Aucune photo</p>
                        )}
                      </>
                    )}

                    {b.taches_non_realisees.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {b.taches_non_realisees.map((t, i) => (
                          <div key={i} className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5">
                            <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-amber-800">
                                {t.zone_nom} — {t.libelle} <span className="font-normal text-amber-600">({t.date.split('-').reverse().join('/')})</span>
                              </p>
                              <p className="text-xs text-amber-700 mt-0.5 italic">{t.commentaire}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* ── Actions export — PDF actif (S4), lien web toujours inactif (S5) ── */}
            <div className="flex gap-3">
              <button
                onClick={handleTelechargerPdf}
                disabled={generatingPdf}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  generatingPdf ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-white'
                }`}
                style={generatingPdf ? undefined : { background: '#0A2E5A' }}
              >
                {generatingPdf ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : <Download className="w-4 h-4" />}
                {generatingPdf ? 'Génération…' : 'Télécharger PDF'}
              </button>
              <button disabled title="Bientôt disponible"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 text-slate-400 text-sm font-semibold cursor-not-allowed">
                <Link2 className="w-4 h-4" /> Copier le lien web
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
