import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

interface SocieteParams {
  taux_horaire_agent: number
  cout_km: number
  frais_generaux_mois: number
}

function margeBadge(pct: number) {
  if (pct >= 40) return { bg: 'bg-green-100 text-green-800 border-green-200', label: 'Excellent', dot: 'bg-green-500' }
  if (pct >= 30) return { bg: 'bg-blue-100 text-blue-800 border-blue-200',   label: 'Bon',       dot: 'bg-blue-500' }
  if (pct >= 20) return { bg: 'bg-orange-100 text-orange-800 border-orange-200', label: 'Correct', dot: 'bg-orange-500' }
  return           { bg: 'bg-red-100 text-red-800 border-red-200',           label: 'Attention', dot: 'bg-red-500' }
}
function margeTxt(pct: number) {
  if (pct >= 40) return 'text-green-600'
  if (pct >= 30) return 'text-blue-600'
  if (pct >= 20) return 'text-orange-500'
  return 'text-red-500'
}
function fmtE(n: number) { return Math.round(n).toLocaleString('fr-FR') + ' €' }
function fmtH(minF: number) {
  if (minF <= 0) return '—'
  const h = Math.floor(minF / 60); const m = Math.round(minF % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}
function sgn(n: number) { return (n >= 0 ? '+' : '') + fmtE(n) }

function heuresMoisFromTaches(
  taches: { frequence_type: string; jours_semaine: string[] | null; duree_minutes: number | null; frequence_valeur: number | null }[]
): number | null {
  let annuelMin = 0; let hasDuree = false
  for (const t of taches) {
    const d = t.duree_minutes ?? 0
    if (!d) continue
    hasDuree = true
    const nJ = Math.max((t.jours_semaine ?? []).length, 1)
    switch (t.frequence_type) {
      case 'hebdo': case 'contrainte_horaire': annuelMin += d * 52 * nJ; break
      case 'mensuel': annuelMin += d * 12 * Math.max(t.frequence_valeur ?? 1, 1); break
      case 'trimestriel': annuelMin += d * 4; break
      case 'semestriel': annuelMin += d * 2; break
      case 'annuel': annuelMin += d; break
    }
  }
  if (!hasDuree) return null
  return annuelMin / 12 / 60 // heures/mois
}

export default async function DirecteurRentabilite() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()
  const dateLimit = new Date()
  dateLimit.setDate(dateLimit.getDate() - 30)
  const dateLimitStr = dateLimit.toISOString().split('T')[0]

  const [
    { data: residencesRaw },
    { data: contratsRaw },
    { data: paramsRaw },
    { data: managers },
    { data: tachesRaw },
    { data: intersReelRaw },
  ] = await Promise.all([
    admin.from('residences').select('id,nom,manager_id').eq('actif', true).order('nom'),
    admin.from('contrats_residences').select('residence_id,montant_mensuel,nb_interventions_mois').eq('actif', true),
    admin.from('parametres_societe').select('*').limit(1).maybeSingle(),
    supabase.from('profiles').select('id,nom,prenom').eq('role', 'manager').eq('actif', true),
    admin.from('taches_template').select('residence_id,frequence_type,jours_semaine,duree_minutes,frequence_valeur'),
    admin.from('interventions')
      .select('residence_id,heure_scan,heure_fin')
      .eq('statut', 'terminee')
      .not('heure_scan', 'is', null)
      .not('heure_fin', 'is', null)
      .gte('date_prevue', dateLimitStr),
  ])

  const params: SocieteParams = paramsRaw ?? { taux_horaire_agent: 23, cout_km: 0.45, frais_generaux_mois: 0 }
  const taux = params.taux_horaire_agent

  const tachesMap = new Map<string, typeof tachesRaw>()
  for (const t of (tachesRaw ?? [])) {
    const l = tachesMap.get(t.residence_id) ?? []; l.push(t); tachesMap.set(t.residence_id, l)
  }

  const reelMap = new Map<string, { totalMin: number; count: number }>()
  for (const i of (intersReelRaw ?? [])) {
    if (!i.heure_scan || !i.heure_fin) continue
    const diff = (new Date(i.heure_fin as string).getTime() - new Date(i.heure_scan as string).getTime()) / 60000
    if (diff <= 0 || diff > 600) continue
    const cur = reelMap.get(i.residence_id) ?? { totalMin: 0, count: 0 }
    cur.totalMin += diff; cur.count++; reelMap.set(i.residence_id, cur)
  }

  const contratMap = new Map((contratsRaw ?? []).map(c => [c.residence_id, c]))
  const managerMap = new Map((managers ?? []).map(m => [m.id, `${m.prenom} ${m.nom}`]))
  const residences = residencesRaw ?? []

  // Calculs par résidence
  const rows = residences.map(r => {
    const contrat    = contratMap.get(r.id) ?? null
    const taches     = tachesMap.get(r.id)  ?? []
    const reelData   = reelMap.get(r.id)    ?? null
    const heuresMois = heuresMoisFromTaches(taches)  // h/mois estimé
    const ca         = contrat?.montant_mensuel ?? 0

    // CA
    const caHebdo = ca * 12 / 52
    const caAnn   = ca * 12

    // Estimé
    const hmois = heuresMois ?? 0
    const hsem  = hmois * 12 / 52
    const hann  = hmois * 12
    const coutEstimeMois = hmois * taux
    const coutEstimeSem  = hsem  * taux
    const coutEstimeAnn  = hann  * taux
    const margeEstimeMois = ca      - coutEstimeMois
    const margeEstimeSem  = caHebdo - coutEstimeSem
    const margeEstimeAnn  = caAnn   - coutEstimeAnn
    const pctEstime = ca > 0 && heuresMois !== null ? (margeEstimeMois / ca) * 100 : null

    // Réel 30j → projeté mensuel
    const hrMois = reelData ? reelData.totalMin / 60 : null
    const hrSem  = hrMois !== null ? hrMois * 12 / 52 : null
    const hrAnn  = hrMois !== null ? hrMois * 12 : null
    const coutReelMois = hrMois !== null ? hrMois * taux : null
    const coutReelSem  = hrSem  !== null ? hrSem  * taux : null
    const coutReelAnn  = hrAnn  !== null ? hrAnn  * taux : null
    const margeReelMois = coutReelMois !== null ? ca      - coutReelMois : null
    const margeReelSem  = coutReelSem  !== null ? caHebdo - coutReelSem  : null
    const margeReelAnn  = coutReelAnn  !== null ? caAnn   - coutReelAnn  : null
    const pctReel = margeReelMois !== null && ca > 0 ? (margeReelMois / ca) * 100 : null
    const ecartPct = hrMois !== null && hmois > 0 ? ((hrMois - hmois) / hmois) * 100 : null

    return {
      r, contrat, ca, caHebdo, caAnn,
      heuresMois, coutEstimeMois, coutEstimeSem, coutEstimeAnn,
      margeEstimeMois, margeEstimeSem, margeEstimeAnn, pctEstime,
      reelData, hrMois, coutReelMois, coutReelSem, coutReelAnn,
      margeReelMois, margeReelSem, margeReelAnn, pctReel, ecartPct,
    }
  })

  // Totaux société (uniquement résidences avec estimé complet)
  const withEstime = rows.filter(x => x.pctEstime !== null && x.ca > 0)
  const totCAMens  = withEstime.reduce((s, x) => s + x.ca, 0)
  const totCEMens  = withEstime.reduce((s, x) => s + x.coutEstimeMois, 0)
  const totMEMens  = totCAMens - totCEMens
  const totCAAnn   = totCAMens * 12;  const totCEAnn  = totCEMens * 12;  const totMEAnn  = totMEMens * 12
  const totCAHebdo = totCAMens * 12 / 52; const totCEHebdo = totCEMens * 12 / 52; const totMEHebdo = totMEMens * 12 / 52
  const pctGlobal  = totCAMens > 0 ? (totMEMens / totCAMens) * 100 : null

  return (
    <div className="min-h-screen bg-slate-100 pb-8">
      {/* Header */}
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <h1 className="text-2xl font-bold">Rentabilité</h1>
        <p className="text-blue-300 text-sm mt-0.5">
          {taux} €/h · {residences.length} résidences · données réelles sur 30j
        </p>
      </div>

      {/* ── Bandeau société ── */}
      {withEstime.length > 0 && (
        <div className="bg-[#0F3D6E] text-white px-6 py-5 border-b border-white/10">
          <p className="text-xs font-bold text-blue-300 uppercase tracking-wider mb-4">💼 Société — Vue consolidée</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
            <div>
              <p className="text-blue-300 text-xs mb-1">CA annuel estimé</p>
              <p className="text-xl font-bold">{fmtE(totCAAnn)}</p>
              <p className="text-blue-400 text-xs">{withEstime.length} résidences actives</p>
            </div>
            <div>
              <p className="text-blue-300 text-xs mb-1">Coût annuel estimé</p>
              <p className="text-xl font-bold">{fmtE(totCEAnn)}</p>
            </div>
            <div>
              <p className="text-blue-300 text-xs mb-1">Marge annuelle estimée</p>
              <p className={`text-xl font-bold ${pctGlobal !== null ? margeTxt(pctGlobal) : ''}`}>
                {sgn(totMEAnn)}
              </p>
              {pctGlobal !== null && <p className={`text-xs font-semibold ${margeTxt(pctGlobal)}`}>{pctGlobal.toFixed(1)} %</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-blue-300">CA mensuel</span><span className="font-semibold">{fmtE(totCAMens)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-blue-300">Marge mensuelle</span><span className={`font-semibold ${pctGlobal !== null ? margeTxt(pctGlobal) : ''}`}>{sgn(totMEMens)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-blue-300">CA hebdo</span><span className="font-semibold">{fmtE(totCAHebdo)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-blue-300">Marge hebdo</span><span className={`font-semibold ${pctGlobal !== null ? margeTxt(pctGlobal) : ''}`}>{sgn(totMEHebdo)}</span>
              </div>
            </div>
          </div>
          {/* Résumé coûts hebdo */}
          <div className="flex flex-wrap gap-4 text-xs text-blue-200 border-t border-white/10 pt-3">
            <span>Coût estimé hebdo : <strong className="text-white">{fmtE(totCEHebdo)}</strong></span>
            <span>Coût estimé mensuel : <strong className="text-white">{fmtE(totCEMens)}</strong></span>
            <span>Coût estimé annuel : <strong className="text-white">{fmtE(totCEAnn)}</strong></span>
          </div>
        </div>
      )}

      {!paramsRaw && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm">
          ⚠️ Taux horaire non configuré —{' '}
          <a href="/directeur/parametres" className="underline">configurer les paramètres</a>
        </div>
      )}

      {/* ── Liste résidences ── */}
      <div className="p-4 md:p-6 space-y-4">
        {rows.map(({ r, contrat, ca, caHebdo, caAnn,
          heuresMois, coutEstimeMois, coutEstimeSem, coutEstimeAnn,
          margeEstimeMois, margeEstimeSem, margeEstimeAnn, pctEstime,
          reelData, hrMois, coutReelMois, coutReelSem, coutReelAnn,
          margeReelMois, margeReelSem, margeReelAnn, pctReel, ecartPct }) => {
          const badge = pctEstime !== null ? margeBadge(pctEstime) : null
          return (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              {/* En-tête résidence */}
              <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-slate-100">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-800 truncate">{r.nom}</h2>
                  {r.manager_id && <p className="text-xs text-slate-400">{managerMap.get(r.manager_id) ?? '—'}</p>}
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  {badge && pctEstime !== null && (
                    <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}/>
                      {badge.label} · ≈{pctEstime.toFixed(1)} %
                    </span>
                  )}
                  {pctReel !== null && (
                    <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${margeBadge(pctReel).bg}`}>
                      📊 réel {pctReel.toFixed(1)} %
                    </span>
                  )}
                  {!contrat && (
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-400 border border-slate-200">Pas de contrat</span>
                  )}
                </div>
              </div>

              {ca > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[400px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 w-40"></th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-500">HEBDO</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-500">MENSUEL</th>
                        <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-800">ANNUEL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* CA vendu */}
                      <tr className="border-b border-slate-50">
                        <td className="px-4 py-2.5 text-slate-500 font-medium">CA (vendu)</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{fmtE(caHebdo)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{fmtE(ca)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fmtE(caAnn)}</td>
                      </tr>
                      {/* Coût estimé */}
                      <tr className="border-b border-slate-50">
                        <td className="px-4 py-2.5 text-slate-500">
                          Coût estimé
                          {heuresMois !== null && <span className="block text-[10px] text-slate-400">⏱ {fmtH(heuresMois * 60)}/mois</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{heuresMois !== null ? fmtE(coutEstimeSem) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{heuresMois !== null ? fmtE(coutEstimeMois) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{heuresMois !== null ? fmtE(coutEstimeAnn) : <span className="text-slate-300">—</span>}</td>
                      </tr>
                      {/* Marge estimée */}
                      <tr className="border-b-2 border-slate-100">
                        <td className="px-4 py-2.5 text-slate-500 font-medium">Marge estimée</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${heuresMois !== null && pctEstime !== null ? margeTxt(pctEstime) : 'text-slate-300'}`}>
                          {heuresMois !== null ? sgn(margeEstimeSem) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${heuresMois !== null && pctEstime !== null ? margeTxt(pctEstime) : 'text-slate-300'}`}>
                          {heuresMois !== null ? sgn(margeEstimeMois) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-bold ${heuresMois !== null && pctEstime !== null ? margeTxt(pctEstime) : 'text-slate-300'}`}>
                          {heuresMois !== null ? sgn(margeEstimeAnn) : '—'}
                          {pctEstime !== null && <span className="block text-[10px]">({pctEstime.toFixed(1)} %)</span>}
                        </td>
                      </tr>
                      {/* Coût réel */}
                      <tr className="border-b border-slate-50 bg-slate-50/40">
                        <td className="px-4 py-2.5 text-slate-500">
                          Coût réel
                          {reelData && <span className="block text-[10px] text-slate-400">{reelData.count} interv. 30j</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{coutReelSem !== null ? fmtE(coutReelSem) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{coutReelMois !== null ? fmtE(coutReelMois) : <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{coutReelAnn !== null ? fmtE(coutReelAnn) : <span className="text-slate-300">—</span>}</td>
                      </tr>
                      {/* Marge réelle */}
                      <tr className="border-b-2 border-slate-200 bg-slate-50/40">
                        <td className="px-4 py-2.5 text-slate-500 font-medium">Marge réelle</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${pctReel !== null ? margeTxt(pctReel) : 'text-slate-300'}`}>
                          {margeReelSem !== null ? sgn(margeReelSem) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${pctReel !== null ? margeTxt(pctReel) : 'text-slate-300'}`}>
                          {margeReelMois !== null ? sgn(margeReelMois) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-bold ${pctReel !== null ? margeTxt(pctReel) : 'text-slate-300'}`}>
                          {margeReelAnn !== null ? sgn(margeReelAnn) : '—'}
                          {pctReel !== null && <span className="block text-[10px]">({pctReel.toFixed(1)} %)</span>}
                        </td>
                      </tr>
                      {/* Écart */}
                      {ecartPct !== null && (
                        <tr>
                          <td colSpan={4} className="px-4 py-2.5">
                            <span className={`text-[11px] font-semibold ${Math.abs(ecartPct) > 10 ? (ecartPct > 0 ? 'text-red-600' : 'text-green-600') : 'text-slate-500'}`}>
                              Écart estimé/réel : {ecartPct > 0 ? '+' : ''}{ecartPct.toFixed(1)} %
                              {ecartPct > 10 ? ' — ⚠️ Sous-chiffré ou agent lent' : ecartPct < -10 ? ' — ✅ Agent efficace' : ''}
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-5 py-4 text-xs text-slate-400">
                  {!contrat ? 'Aucun contrat actif' : 'Durées de tâches non renseignées'}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
