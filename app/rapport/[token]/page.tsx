import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase-server'
import { signerPhotos, type RapportSyndicPayload } from '@/lib/rapportSyndicData'
import { Building2, Calendar, TriangleAlert, ImageOff } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Rapport syndic (P3-2, étape S5) — page PUBLIQUE, sans session. Exclue du
// middleware d'auth global (voir middleware.ts). Sécurité assurée par le
// token (uuid imprévisible) + vérif actif=true faite ICI, jamais par RLS
// (rapports_syndic_liens n'a aucune policy anon — deny total, cf. migration
// 029). Toute lecture passe par createAdminClient() (service_role).
//
// noindex : un lien collé quelque part publiquement ne doit pas être indexé.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS_COURT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function moisLabel(m: number) { return `${MOIS_FR[m - 1].charAt(0).toUpperCase()}${MOIS_FR[m - 1].slice(1)}` }

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
  const startWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7
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
              className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium ${
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

function LienIndisponible() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-slate-100 p-8 max-w-sm text-center">
        <p className="text-4xl mb-3">🔒</p>
        <p className="font-semibold text-slate-700">Ce lien n'est plus disponible.</p>
        <p className="text-sm text-slate-400 mt-1">
          Contactez votre prestataire Archipropre pour obtenir un lien à jour.
        </p>
      </div>
    </div>
  )
}

interface Props { params: Promise<{ token: string }> }

export default async function RapportPublicPage({ params }: Props) {
  const { token } = await params
  const admin = await createAdminClient()

  // Résolution du token AVANT toute autre chose — même message générique
  // que le lien soit inexistant, révoqué, ou malformé.
  const { data: lien } = await admin
    .from('rapports_syndic_liens')
    .select('snapshot, avec_photos')
    .eq('token', token)
    .eq('actif', true)
    .maybeSingle()

  if (!lien) return <LienIndisponible />

  const snapshot = lien.snapshot as RapportSyndicPayload
  const batiments = lien.avec_photos ? await signerPhotos(admin, snapshot.batiments) : snapshot.batiments

  const datesMarquees = new Set<string>()
  for (const b of batiments) for (const d of b.dates_passage) datesMarquees.add(d)
  const mois = moisTouches(snapshot.periode.debut, snapshot.periode.fin)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── En-tête rapport ── */}
        <div className="rounded-2xl p-6 mb-6 text-white" style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300 mb-2">Archipropre Services</p>
          <h1 className="text-xl font-bold mb-3">RAPPORT D&apos;INTERVENTION</h1>
          <p className="text-lg font-semibold">{snapshot.residence.nom}</p>
          {snapshot.residence.adresse && <p className="text-sm text-blue-200 mt-0.5">{snapshot.residence.adresse}</p>}
          <p className="text-sm text-blue-200 mt-2 capitalize">{snapshot.periode.libelle}</p>
        </div>

        {/* ── Chiffres factuels ── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <p className="text-3xl font-bold text-[#0A2E5A]">{snapshot.nb_passages}</p>
            <p className="text-sm text-slate-500 mt-0.5">
              passage{snapshot.nb_passages > 1 ? 's' : ''} réalisé{snapshot.nb_passages > 1 ? 's' : ''}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <p className="text-3xl font-bold text-[#0A2E5A]">{batiments.length}</p>
            <p className="text-sm text-slate-500 mt-0.5">
              bâtiment{batiments.length > 1 ? 's' : ''} couvert{batiments.length > 1 ? 's' : ''}
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
                  datesMarquees={datesMarquees} debut={snapshot.periode.debut} fin={snapshot.periode.fin} />
              ))}
            </div>
          </div>
        )}

        {/* ── Détail par bâtiment ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Détail des interventions</h2>

          {batiments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-400">
              Aucun passage réalisé sur cette période.
            </div>
          ) : (
            batiments.map(b => (
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

                {lien.avec_photos && (
                  <>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Photos</p>
                    {b.photos.length > 0 ? (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-4">
                        {b.photos.map((p, i) => (
                          p.signed_url ? (
                            <a key={i} href={p.signed_url} target="_blank" rel="noopener noreferrer" className="block">
                              <div className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.signed_url} alt={p.zone_nom} className="w-full h-full object-cover" />
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

        <p className="text-center text-xs text-slate-300 mt-8">Archipropre Services</p>
      </div>
    </div>
  )
}
