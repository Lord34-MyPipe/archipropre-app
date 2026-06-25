'use client'

import { useState, useEffect } from 'react'

interface TacheTemplate {
  duree_minutes: number | null
  frequence_type: string
  jours_semaine: string[] | null
  frequence_valeur?: number | null
}

interface Contrat {
  libelle: string | null
  montant_mensuel: number | null
  nb_interventions_mois: number | null
}

interface Parametres {
  taux_horaire_agent: number
}

interface StatsReel {
  totalMin: number
  count: number
}

interface Data {
  taches: TacheTemplate[]
  contrat: Contrat | null
  parametres: Parametres | null
  statsReel: StatsReel | null
}

function formatDuree(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

function calcDureTotaux(taches: TacheTemplate[]) {
  let annuel = 0
  let incompleteCount = 0

  taches.forEach(t => {
    const d = t.duree_minutes ?? 0
    if (!d) { incompleteCount++; return }
    const ft = t.frequence_type
    const nJours = Math.max((t.jours_semaine ?? []).length, 1)
    switch (ft) {
      case 'hebdo':
      case 'contrainte_horaire':
        annuel += d * 52 * nJours; break
      case 'mensuel':
        annuel += d * 12 * Math.max(t.frequence_valeur || 1, 1); break
      case 'trimestriel':
        annuel += d * 4; break
      case 'semestriel':
        annuel += d * 2; break
      case 'annuel':
        annuel += d; break
    }
  })

  return { annuel, mois: annuel / 12, semaine: annuel / 52, incompleteCount }
}

function margeColor(pct: number): string {
  if (pct >= 40) return 'text-green-600'
  if (pct >= 30) return 'text-blue-600'
  if (pct >= 20) return 'text-orange-500'
  return 'text-red-500'
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="grid grid-cols-4 items-center py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-500 col-span-1">{label}</span>
      {values.map((v, i) => (
        <span key={i} className="text-sm font-semibold text-slate-800 text-right">{v}</span>
      ))}
    </div>
  )
}

export default function RentabiliteModal({
  residenceId,
  contratId,
  onClose,
}: {
  residenceId: string
  contratId: string
  onClose: () => void
}) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/residences/${residenceId}/rentabilite?contratId=${contratId}`)
      .then(r => r.json())
      .then(json => { setData(json); setLoading(false) })
      .catch(() => { setError('Erreur de chargement'); setLoading(false) })
  }, [residenceId, contratId])

  const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`
  const sgn = (n: number) => (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('fr-FR') + ' €'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-700">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-800 leading-tight">Rentabilité</h2>
              {data?.contrat?.libelle && (
                <p className="text-xs text-slate-400 leading-tight">{data.contrat.libelle}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Corps */}
        <div className="px-6 py-4">
          {loading && (
            <div className="py-12 text-center text-slate-400 text-sm">Chargement…</div>
          )}
          {error && (
            <div className="py-6 text-center text-red-500 text-sm">{error}</div>
          )}
          {data && (() => {
            const { taches, contrat, parametres, statsReel } = data
            const duree  = calcDureTotaux(taches)
            const taux   = parametres?.taux_horaire_agent ?? 23
            const ca     = contrat?.montant_mensuel ?? 0
            const caAnn  = ca * 12
            const caHebdo = ca * 12 / 52
            const perteCachee = ca === 0

            const hmois  = duree.mois / 60
            const hsem   = duree.semaine / 60
            const hann   = duree.annuel / 60
            // hasEstime ne dépend plus du CA — contrat offert (0€) doit aussi s'afficher
            const hasEstime = taux > 0 && duree.annuel > 0

            const coutMois = hmois * taux
            const coutSem  = hsem  * taux
            const coutAnn  = hann  * taux
            const margMois = ca      - coutMois
            const margSem  = caHebdo - coutSem
            const margAnn  = caAnn   - coutAnn
            const pctEstime = ca > 0 ? (margMois / ca) * 100 : null

            let reel: { hrMois: number; hrSem: number; coutMois: number; margMois: number; pct: number | null } | null = null
            if (statsReel && taux > 0) {
              const hrMois = statsReel.totalMin / 60
              const hrSem  = hrMois * 12 / 52
              const crMois = hrMois * taux
              const mrMois = ca - crMois
              const pct    = ca > 0 ? (mrMois / ca) * 100 : null
              reel = { hrMois, hrSem, coutMois: crMois, margMois: mrMois, pct }
            }

            const inc = duree.incompleteCount > 0

            return (
              <>
                {/* Perte cachée */}
                {perteCachee && hasEstime && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 shrink-0">
                      ⚠ Perte cachée
                    </span>
                    <span className="text-xs text-red-700">Ce contrat est offert à 0 € — le coût est entièrement à perte.</span>
                  </div>
                )}

                {/* Temps estimé */}
                <section className="mb-5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
                    Temps estimé {inc && <span className="text-amber-500">· {duree.incompleteCount} tâche{duree.incompleteCount > 1 ? 's' : ''} sans durée</span>}
                  </p>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="grid grid-cols-4 pb-1.5 mb-0.5">
                      {['', 'Semaine', 'Mois', 'Année'].map((h, i) => (
                        <span key={i} className="text-[10px] font-semibold text-slate-400 text-right first:text-left">{h}</span>
                      ))}
                    </div>
                    <Row label="⏱ Temps" values={[
                      `${inc ? '~' : ''}${formatDuree(duree.semaine)}`,
                      `${inc ? '~' : ''}${formatDuree(duree.mois)}`,
                      `${inc ? '~' : ''}${formatDuree(duree.annuel)}`,
                    ]} />
                  </div>
                </section>

                {/* Estimé */}
                {hasEstime && (
                  <section className="mb-5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Estimé</p>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="grid grid-cols-4 pb-1.5 mb-0.5">
                        {['', 'Semaine', 'Mois', 'Année'].map((h, i) => (
                          <span key={i} className="text-[10px] font-semibold text-slate-400 text-right first:text-left">{h}</span>
                        ))}
                      </div>
                      {!perteCachee && (
                        <Row label="CA" values={[fmt(caHebdo), fmt(ca), fmt(caAnn)]} />
                      )}
                      <Row label="Coût" values={[fmt(coutSem), fmt(coutMois), fmt(coutAnn)]} />
                      <div className="grid grid-cols-4 items-center pt-2.5">
                        <span className="text-xs font-bold text-slate-600">Marge</span>
                        {[{v: margSem}, {v: margMois}, {v: margAnn}].map(({ v }, i) => (
                          <span key={i} className={`text-sm font-bold text-right ${v >= 0 ? 'text-green-600' : 'text-red-500'}`}>{sgn(v)}</span>
                        ))}
                      </div>
                      {pctEstime !== null && (
                        <p className={`text-right text-xs font-semibold mt-1 ${margeColor(pctEstime)}`}>
                          Taux de marge : {pctEstime.toFixed(1)} %
                        </p>
                      )}
                      {perteCachee && (
                        <p className="text-right text-xs font-semibold mt-1 text-red-600">CA = 0 € — perte = coût intégral</p>
                      )}
                    </div>
                  </section>
                )}

                {!hasEstime && (
                  <div className="bg-amber-50 rounded-xl px-4 py-3 text-amber-700 text-xs mb-5">
                    {!taux ? 'Taux horaire non configuré (paramètres société).' : 'Renseignez les durées de tâches pour calculer la rentabilité.'}
                  </div>
                )}

                {/* Réel 30j */}
                {reel && (
                  <section className="mb-2">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
                      Réel — {statsReel!.count} intervention{statsReel!.count > 1 ? 's' : ''} (30 derniers jours)
                    </p>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <div className="grid grid-cols-3 items-center py-2.5 border-b border-slate-100">
                        <span className="text-xs font-semibold text-slate-500">⏱ Temps</span>
                        <span className="text-sm font-semibold text-slate-800 text-right">{formatDuree(reel.hrSem * 60)}/sem</span>
                        <span className="text-sm font-semibold text-slate-800 text-right">{formatDuree(reel.hrMois * 60)}/mois</span>
                      </div>
                      <div className="grid grid-cols-3 items-center py-2.5 border-b border-slate-100">
                        <span className="text-xs font-semibold text-slate-500">Coût</span>
                        <span className="text-sm font-semibold text-slate-800 text-right col-span-2 text-right">{fmt(reel.coutMois)}/mois</span>
                      </div>
                      <div className="grid grid-cols-3 items-center pt-2.5">
                        <span className="text-xs font-bold text-slate-600">Marge réelle</span>
                        <span className={`text-sm font-bold col-span-2 text-right ${reel.margMois >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {sgn(reel.margMois)}/mois
                          {reel.pct !== null ? ` (${reel.pct.toFixed(1)} %)` : ' — perte cachée'}
                        </span>
                      </div>
                    </div>
                  </section>
                )}

                {!statsReel && (
                  <p className="text-xs text-slate-400 text-center mt-2">Pas encore de données réelles pour ce contrat.</p>
                )}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
