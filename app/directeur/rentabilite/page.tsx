import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

interface Params {
  taux_horaire_agent: number
  cout_km: number
  frais_generaux_mois: number
}

function margeColor(pct: number): string {
  if (pct >= 40) return 'text-green-600 bg-green-50 border-green-200'
  if (pct >= 30) return 'text-blue-600 bg-blue-50 border-blue-200'
  if (pct >= 20) return 'text-orange-600 bg-orange-50 border-orange-200'
  return 'text-red-600 bg-red-50 border-red-200'
}
function margeBadge(pct: number): string {
  if (pct >= 40) return 'bg-green-100 text-green-700'
  if (pct >= 30) return 'bg-blue-100 text-blue-700'
  if (pct >= 20) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}
function formatH(minF: number): string {
  if (minF <= 0) return '—'
  const h = Math.floor(minF / 60)
  const m = Math.round(minF % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

// Même formule que TachesClient — base annuelle / 12
function heuresMoisFromTaches(
  taches: { frequence_type: string; jours_semaine: string[] | null; duree_minutes: number | null; frequence_valeur: number | null }[]
): number | null {
  let annuelMin = 0
  let hasDuree = false

  for (const t of taches) {
    const d = t.duree_minutes ?? 0
    if (!d) continue
    hasDuree = true
    const nJours = Math.max((t.jours_semaine ?? []).length, 1)

    switch (t.frequence_type) {
      case 'hebdo':
      case 'contrainte_horaire':
        annuelMin += d * 52 * nJours; break
      case 'mensuel':
        annuelMin += d * 12 * Math.max(t.frequence_valeur ?? 1, 1); break
      case 'trimestriel':
        annuelMin += d * 4; break
      case 'semestriel':
        annuelMin += d * 2; break
      case 'annuel':
        annuelMin += d; break
    }
  }

  if (!hasDuree) return null
  return annuelMin / 12 / 60 // → heures/mois
}

export default async function DirecteurRentabilite() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()

  const [
    { data: residencesRaw },
    { data: contratsRaw },
    { data: paramsRaw },
    { data: managers },
    { data: tachesRaw },
  ] = await Promise.all([
    admin.from('residences').select('id,nom,manager_id').eq('actif', true).order('nom'),
    admin.from('contrats_residences').select('residence_id,montant_mensuel,nb_interventions_mois').eq('actif', true),
    admin.from('parametres_societe').select('*').limit(1).maybeSingle(),
    supabase.from('profiles').select('id,nom,prenom').eq('role', 'manager').eq('actif', true),
    admin.from('taches_template').select('residence_id,frequence_type,jours_semaine,duree_minutes,frequence_valeur'),
  ])

  const params: Params = paramsRaw ?? { taux_horaire_agent: 22, cout_km: 0.45, frais_generaux_mois: 0 }

  // Grouper les tâches par résidence
  const tachesParResidence = new Map<string, typeof tachesRaw>()
  for (const t of (tachesRaw ?? [])) {
    const list = tachesParResidence.get(t.residence_id) ?? []
    list.push(t)
    tachesParResidence.set(t.residence_id, list)
  }

  const contratMap = new Map((contratsRaw ?? []).map(c => [c.residence_id, c]))
  const managerMap = new Map((managers ?? []).map(m => [m.id, `${m.prenom} ${m.nom}`]))
  const residences = residencesRaw ?? []

  const rows = residences.map(r => {
    const contrat   = contratMap.get(r.id) ?? null
    const taches    = tachesParResidence.get(r.id) ?? []
    const heuresMois = heuresMoisFromTaches(taches)

    if (!contrat?.montant_mensuel || heuresMois === null) {
      return { r, contrat, heuresMois, coutReel: null, marge: null, pct: null }
    }

    const coutReel = params.taux_horaire_agent * heuresMois + params.frais_generaux_mois
    const marge    = contrat.montant_mensuel - coutReel
    const pct      = (marge / contrat.montant_mensuel) * 100
    return { r, contrat, heuresMois, coutReel, marge, pct }
  })

  const withData    = rows.filter(x => x.pct !== null)
  const avgPct      = withData.length ? withData.reduce((s, x) => s + (x.pct ?? 0), 0) / withData.length : null
  const totalCA     = withData.reduce((s, x) => s + (x.contrat?.montant_mensuel ?? 0), 0)
  const totalCout   = withData.reduce((s, x) => s + (x.coutReel ?? 0), 0)
  const totalMarge  = totalCA - totalCout

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <h1 className="text-2xl font-bold">Rentabilité</h1>
        <p className="text-blue-300 text-sm mt-0.5">Coût horaire : {params.taux_horaire_agent} €/h · {residences.length} résidences</p>
      </div>

      {/* Bandeau global */}
      {withData.length > 0 && (
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex flex-wrap gap-6 md:gap-12">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">CA mensuel total</p>
              <p className="text-2xl font-bold text-slate-800">{totalCA.toLocaleString('fr-FR')} €</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Coût total</p>
              <p className="text-2xl font-bold text-slate-800">{totalCout.toFixed(0)} €</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Marge brute</p>
              <p className={`text-2xl font-bold ${totalMarge >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalMarge >= 0 ? '+' : ''}{totalMarge.toFixed(0)} €
              </p>
            </div>
            {avgPct !== null && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Marge moyenne</p>
                <p className={`text-2xl font-bold ${avgPct >= 30 ? 'text-green-600' : avgPct >= 20 ? 'text-orange-500' : 'text-red-600'}`}>
                  {avgPct.toFixed(1)} %
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Warning si pas de params */}
      {!paramsRaw && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-sm flex items-center gap-2">
          ⚠️ Taux horaire non configuré —{' '}
          <a href="/directeur/parametres" className="underline">configurer les paramètres</a>
        </div>
      )}

      {/* Liste résidences */}
      <div className="p-4 md:p-6 space-y-3">
        {rows.map(({ r, contrat, heuresMois, coutReel, marge, pct }) => (
          <div key={r.id} className={`bg-white rounded-2xl border p-4 md:p-5 ${pct !== null ? margeColor(pct) : 'border-slate-100'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-800 text-sm truncate">{r.nom}</h2>
                {r.manager_id && (
                  <p className="text-xs text-slate-400 mt-0.5">{managerMap.get(r.manager_id) ?? '—'}</p>
                )}
              </div>
              {pct !== null ? (
                <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ${margeBadge(pct)}`}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)} %
                </span>
              ) : (
                <span className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-400">
                  {!contrat ? 'Pas de contrat' : 'Durées non renseignées'}
                </span>
              )}
            </div>

            {pct !== null && contrat && heuresMois !== null && coutReel !== null && marge !== null ? (
              <div className="mt-3 flex flex-wrap gap-4 text-xs">
                <div>
                  <p className="text-slate-400">Contrat mensuel</p>
                  <p className="font-bold text-slate-700">{contrat.montant_mensuel?.toLocaleString('fr-FR')} €</p>
                </div>
                <div>
                  <p className="text-slate-400">Heures/mois (tâches réelles)</p>
                  <p className="font-bold text-slate-700">{formatH(heuresMois * 60)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Taux vendu</p>
                  <p className="font-bold text-slate-700">{((contrat.montant_mensuel ?? 0) / heuresMois).toFixed(2)} €/h</p>
                </div>
                <div>
                  <p className="text-slate-400">Coût réel</p>
                  <p className="font-bold text-slate-700">{coutReel.toFixed(0)} €</p>
                </div>
                <div>
                  <p className="text-slate-400">Marge brute</p>
                  <p className={`font-bold ${marge >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {marge >= 0 ? '+' : ''}{marge.toFixed(0)} €
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-400">
                {!contrat
                  ? 'Aucun contrat actif pour cette résidence'
                  : 'Durées de tâches non renseignées — rendez-vous dans les tâches template'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
