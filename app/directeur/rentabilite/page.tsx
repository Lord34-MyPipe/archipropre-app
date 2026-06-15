import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

interface SocieteParams {
  taux_horaire_agent: number
  cout_km: number
  frais_generaux_mois: number
}

function margeBadge(pct: number): string {
  if (pct >= 40) return 'bg-green-100 text-green-700 border-green-200'
  if (pct >= 30) return 'bg-blue-100 text-blue-700 border-blue-200'
  if (pct >= 20) return 'bg-orange-100 text-orange-700 border-orange-200'
  return 'bg-red-100 text-red-700 border-red-200'
}
function margeTxt(pct: number): string {
  if (pct >= 40) return 'text-green-600'
  if (pct >= 30) return 'text-blue-600'
  if (pct >= 20) return 'text-orange-500'
  return 'text-red-500'
}
function formatH(minF: number): string {
  if (minF <= 0) return '—'
  const h = Math.floor(minF / 60)
  const m = Math.round(minF % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

function heuresMoisFromTaches(
  taches: { frequence_type: string; jours_semaine: string[] | null; duree_minutes: number | null; frequence_valeur: number | null }[]
): number | null {
  let annuelMin = 0; let hasDuree = false
  for (const t of taches) {
    const d = t.duree_minutes ?? 0
    if (!d) continue
    hasDuree = true
    const nJours = Math.max((t.jours_semaine ?? []).length, 1)
    switch (t.frequence_type) {
      case 'hebdo': case 'contrainte_horaire': annuelMin += d * 52 * nJours; break
      case 'mensuel': annuelMin += d * 12 * Math.max(t.frequence_valeur ?? 1, 1); break
      case 'trimestriel': annuelMin += d * 4; break
      case 'semestriel': annuelMin += d * 2; break
      case 'annuel': annuelMin += d; break
    }
  }
  if (!hasDuree) return null
  return annuelMin / 12 / 60
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

  const params: SocieteParams = paramsRaw ?? { taux_horaire_agent: 22, cout_km: 0.45, frais_generaux_mois: 0 }

  // Grouper tâches par résidence
  const tachesMap = new Map<string, typeof tachesRaw>()
  for (const t of (tachesRaw ?? [])) {
    const list = tachesMap.get(t.residence_id) ?? []; list.push(t)
    tachesMap.set(t.residence_id, list)
  }

  // Grouper interventions réelles par résidence
  const reelMap = new Map<string, { totalMin: number; count: number }>()
  for (const i of (intersReelRaw ?? [])) {
    if (!i.heure_scan || !i.heure_fin) continue
    const diff = (new Date(i.heure_fin as string).getTime() - new Date(i.heure_scan as string).getTime()) / 60000
    if (diff <= 0 || diff > 600) continue
    const cur = reelMap.get(i.residence_id) ?? { totalMin: 0, count: 0 }
    cur.totalMin += diff; cur.count++
    reelMap.set(i.residence_id, cur)
  }

  const contratMap = new Map((contratsRaw ?? []).map(c => [c.residence_id, c]))
  const managerMap = new Map((managers ?? []).map(m => [m.id, `${m.prenom} ${m.nom}`]))
  const residences = residencesRaw ?? []

  const rows = residences.map(r => {
    const contrat     = contratMap.get(r.id) ?? null
    const taches      = tachesMap.get(r.id) ?? []
    const heuresMois  = heuresMoisFromTaches(taches)
    const reelData    = reelMap.get(r.id) ?? null

    // Estimé
    const coutEstime  = (heuresMois !== null && contrat?.montant_mensuel)
      ? params.taux_horaire_agent * heuresMois + params.frais_generaux_mois : null
    const margeEstime = (coutEstime !== null && contrat?.montant_mensuel)
      ? contrat.montant_mensuel - coutEstime : null
    const pctEstime   = (margeEstime !== null && contrat?.montant_mensuel)
      ? (margeEstime / contrat.montant_mensuel) * 100 : null
    const tauxVendu   = (heuresMois && contrat?.montant_mensuel)
      ? contrat.montant_mensuel / heuresMois : null

    // Réel 30j
    const heuresReel  = reelData ? reelData.totalMin / 60 : null
    const coutReel    = (heuresReel !== null && contrat?.montant_mensuel)
      ? params.taux_horaire_agent * heuresReel + params.frais_generaux_mois : null
    const margeReel   = (coutReel !== null && contrat?.montant_mensuel)
      ? contrat.montant_mensuel - coutReel : null
    const pctReel     = (margeReel !== null && contrat?.montant_mensuel)
      ? (margeReel / contrat.montant_mensuel) * 100 : null

    // Écart réel vs estimé
    const ecartPct    = (heuresReel !== null && heuresMois !== null && heuresMois > 0)
      ? ((heuresReel - heuresMois) / heuresMois) * 100 : null

    return { r, contrat, heuresMois, coutEstime, margeEstime, pctEstime, tauxVendu, reelData, heuresReel, coutReel, margeReel, pctReel, ecartPct }
  })

  const withEstime = rows.filter(x => x.pctEstime !== null)
  const totalCA    = withEstime.reduce((s, x) => s + (x.contrat?.montant_mensuel ?? 0), 0)
  const totalCoutE = withEstime.reduce((s, x) => s + (x.coutEstime ?? 0), 0)
  const avgPctE    = withEstime.length ? withEstime.reduce((s, x) => s + (x.pctEstime ?? 0), 0) / withEstime.length : null
  const withReel   = rows.filter(x => x.pctReel !== null)
  const avgPctR    = withReel.length ? withReel.reduce((s, x) => s + (x.pctReel ?? 0), 0) / withReel.length : null

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <h1 className="text-2xl font-bold">Rentabilité</h1>
        <p className="text-blue-300 text-sm mt-0.5">
          {params.taux_horaire_agent} €/h · {residences.length} résidences · données réelles sur 30j
        </p>
      </div>

      {/* Synthèse globale */}
      {withEstime.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex flex-wrap gap-6 md:gap-10">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">CA mensuel</p>
              <p className="text-2xl font-bold text-slate-800">{totalCA.toLocaleString('fr-FR')} €</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Coût estimé</p>
              <p className="text-2xl font-bold text-slate-800">{totalCoutE.toFixed(0)} €</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Marge estimée moy.</p>
              <p className={`text-2xl font-bold ${avgPctE !== null ? margeTxt(avgPctE) : 'text-slate-400'}`}>
                {avgPctE !== null ? `${avgPctE.toFixed(1)} %` : '—'}
              </p>
            </div>
            {avgPctR !== null && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Marge réelle moy. (30j)</p>
                <p className={`text-2xl font-bold ${margeTxt(avgPctR)}`}>{avgPctR.toFixed(1)} %</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!paramsRaw && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm">
          ⚠️ Taux horaire non configuré —{' '}
          <a href="/directeur/parametres" className="underline">configurer les paramètres</a>
        </div>
      )}

      <div className="p-4 md:p-6 space-y-3">
        {rows.map(({ r, contrat, heuresMois, coutEstime, margeEstime, pctEstime, tauxVendu, reelData, heuresReel, coutReel, margeReel, pctReel, ecartPct }) => (
          <div key={r.id} className="bg-white rounded-2xl border border-slate-100 p-4 md:p-5">
            {/* Titre + badge marge estimée */}
            <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-800 truncate">{r.nom}</h2>
                {r.manager_id && <p className="text-xs text-slate-400 mt-0.5">{managerMap.get(r.manager_id) ?? '—'}</p>}
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                {pctEstime !== null && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${margeBadge(pctEstime)}`}>
                    ≈ {pctEstime.toFixed(1)} %
                  </span>
                )}
                {pctReel !== null && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${margeBadge(pctReel)}`}>
                    📊 {pctReel.toFixed(1)} %
                  </span>
                )}
              </div>
            </div>

            {/* 3 colonnes */}
            {contrat?.montant_mensuel ? (
              <div className="grid grid-cols-3 gap-3 text-xs">
                {/* VENDU */}
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Vendu</p>
                  <p className="font-bold text-slate-800 text-base">{contrat.montant_mensuel.toLocaleString('fr-FR')} €</p>
                  <p className="text-slate-500 text-[11px]">/ mois</p>
                  {tauxVendu !== null && (
                    <p className="text-slate-500 mt-1">{tauxVendu.toFixed(2)} €/h</p>
                  )}
                </div>

                {/* ESTIMÉ */}
                <div className={`rounded-xl p-3 ${pctEstime !== null ? (pctEstime >= 30 ? 'bg-green-50' : pctEstime >= 20 ? 'bg-orange-50' : 'bg-red-50') : 'bg-slate-50'}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Estimé</p>
                  {heuresMois !== null && coutEstime !== null && margeEstime !== null && pctEstime !== null ? (
                    <>
                      <p className="font-bold text-slate-800">{coutEstime.toFixed(0)} €<span className="text-[11px] font-normal text-slate-500">/mois</span></p>
                      <p className={`font-bold mt-0.5 ${margeTxt(pctEstime)}`}>Marge {pctEstime.toFixed(1)} %</p>
                      <p className="text-slate-500 mt-1">⏱ {formatH(heuresMois * 60)}/mois</p>
                    </>
                  ) : (
                    <p className="text-slate-400 text-[11px] mt-1">Durées non renseignées</p>
                  )}
                </div>

                {/* RÉEL 30j */}
                <div className={`rounded-xl p-3 ${pctReel !== null ? (pctReel >= 30 ? 'bg-green-50' : pctReel >= 20 ? 'bg-orange-50' : 'bg-red-50') : 'bg-slate-50'}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Réel (30j)</p>
                  {reelData && coutReel !== null && margeReel !== null && pctReel !== null ? (
                    <>
                      <p className="font-bold text-slate-800">{coutReel.toFixed(0)} €<span className="text-[11px] font-normal text-slate-500">/mois</span></p>
                      <p className={`font-bold mt-0.5 ${margeTxt(pctReel)}`}>Marge {pctReel.toFixed(1)} %</p>
                      <p className="text-slate-500 mt-1">⏱ {formatH(reelData.totalMin / reelData.count)}/interv. · {reelData.count} interv.</p>
                    </>
                  ) : (
                    <p className="text-slate-400 text-[11px] mt-1">Aucune donnée</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Aucun contrat actif</p>
            )}

            {/* Alerte écart */}
            {ecartPct !== null && Math.abs(ecartPct) > 10 && (
              <div className={`mt-3 px-3 py-2 rounded-xl text-xs font-medium ${ecartPct > 10 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {ecartPct > 10
                  ? `⚠️ Sous-chiffré ou agent lent — temps réel ${ecartPct.toFixed(1)} % supérieur à l'estimation`
                  : `✅ Agent efficace — temps réel ${Math.abs(ecartPct).toFixed(1)} % inférieur à l'estimation`}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
