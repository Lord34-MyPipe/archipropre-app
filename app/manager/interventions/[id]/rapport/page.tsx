export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface ZoneIntervention {
  id: string
  intervention_id: string
  zone_nom: string
  heure_cloture: string | null
}

interface PhotoZone {
  id: string
  intervention_id: string
  zone_nom: string
  photo_url: string
  created_at: string
}

interface TacheRow {
  id: string
  libelle: string
  zone_nom: string | null
  statut_tache: 'a_faire' | 'realisee' | 'non_realisee'
  commentaire: string | null
  heure_validation: string | null
}

interface TacheEstim {
  tache_template_id: string | null
  // PostgREST renvoie le côté FK comme tableau même pour une relation many-to-one
  taches_template: { duree_minutes: number }[] | { duree_minutes: number } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(ts: string | null, opts: Intl.DateTimeFormatOptions) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...opts })
}

function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

function fmtDuree(min: number | null): string {
  if (min === null || min <= 0) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ManagerRapportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['manager', 'directeur'].includes(profile?.role ?? '')) redirect('/manager/dashboard')

  // Fetch toutes les données en parallèle
  const [
    { data: inter },
    { data: taches },
    { data: zones },
    { data: photos },
    { data: tachesEstimRaw },
  ] = await Promise.all([
    supabase
      .from('interventions')
      .select('*, residences(*), profiles!interventions_agent_id_fkey(prenom, nom)')
      .eq('id', id)
      .single(),
    supabase
      .from('taches_intervention')
      .select('id, libelle, zone_nom, statut_tache, commentaire, heure_validation')
      .eq('intervention_id', id)
      .order('heure_validation'),
    supabase
      .from('zones_intervention')
      .select('*')
      .eq('intervention_id', id)
      .order('heure_cloture'),
    supabase
      .from('photos_zone')
      .select('*')
      .eq('intervention_id', id)
      .order('created_at'),
    // Durée estimée : join FK many-to-one → taches_template retourne un objet
    supabase
      .from('taches_intervention')
      .select('tache_template_id, taches_template(duree_minutes)')
      .eq('intervention_id', id),
  ])

  if (!inter) redirect('/manager/planning')

  // Contrat actif + taux Base (en séquentiel car besoin de residence_id)
  const [{ data: contrat }, { data: param }] = await Promise.all([
    supabase
      .from('contrats_residences')
      .select('montant_mensuel, nb_interventions_mois, taux_horaire_facturation')
      .eq('residence_id', inter.residence_id)
      .eq('actif', true)
      .maybeSingle(),
    supabase
      .from('parametres_societe')
      .select('taux_horaire_facturation_defaut')
      .limit(1)
      .maybeSingle(),
  ])

  // Signed URLs pour les photos (bucket privé)
  const photosWithUrls: (PhotoZone & { signedUrl: string | null })[] = await Promise.all(
    (photos ?? []).map(async (p: PhotoZone) => {
      const { data } = await supabase.storage
        .from('photos-interventions')
        .createSignedUrl(p.photo_url, 3600)
      return { ...p, signedUrl: data?.signedUrl ?? null }
    })
  )

  const residence = (inter as Record<string, unknown>).residences as Record<string, string> | null
  const agent     = (inter as Record<string, unknown>).profiles as { prenom: string; nom: string } | null

  const tachesList = (taches ?? []) as TacheRow[]
  const zonesList  = (zones  ?? []) as ZoneIntervention[]

  const realisees    = tachesList.filter(t => t.statut_tache === 'realisee')
  const nonRealisees = tachesList.filter(t => t.statut_tache === 'non_realisee')
  const traitees     = tachesList
    .filter(t => t.statut_tache !== 'a_faire')
    .sort((a, b) => (a.heure_validation ?? '').localeCompare(b.heure_validation ?? ''))

  // ── Durée RÉELLE ─────────────────────────────────────────────────────────
  const dureeMin = minutesBetween(inter.heure_scan, inter.heure_fin)

  // ── Durée ESTIMÉE : somme duree_minutes des taches_template ──────────────
  // PostgREST FK many-to-one → taches_template est un objet (pas tableau)
  const dureeEstimeeMin = ((tachesEstimRaw ?? []) as TacheEstim[])
    .reduce((sum, t) => {
      const tmpl = Array.isArray(t.taches_template) ? t.taches_template[0] : t.taches_template
      return sum + (tmpl?.duree_minutes ?? 0)
    }, 0) || null

  // ── Durée CONTRACTUELLE : montant_mensuel ÷ taux_horaire ÷ nb_inter ──────
  const tauxHoraire = contrat?.taux_horaire_facturation ?? param?.taux_horaire_facturation_defaut ?? null
  const tauxSource  = contrat?.taux_horaire_facturation != null ? 'contrat' : 'défaut société'

  let dureeContractuelleMin: number | null = null
  if (contrat?.montant_mensuel && tauxHoraire && contrat?.nb_interventions_mois) {
    const heuresParMois = contrat.montant_mensuel / tauxHoraire
    const heuresParIntervention = heuresParMois / contrat.nb_interventions_mois
    dureeContractuelleMin = Math.round(heuresParIntervention * 60)
  }

  // ── Temps par zone — fix : durée dans la zone, pas depuis le début ────────
  // zone[0] = heure_cloture[0] - heure_scan
  // zone[N] = heure_cloture[N] - heure_cloture[N-1]
  const zonesAvecDuree = zonesList.map((z, i) => {
    const debut = i === 0 ? inter.heure_scan : zonesList[i - 1].heure_cloture
    return { ...z, dureeMin: minutesBetween(debut, z.heure_cloture) }
  })

  // Écart Réelle vs Estimée
  const ecart = (dureeMin !== null && dureeEstimeeMin !== null)
    ? dureeMin - dureeEstimeeMin
    : null

  // Grouper photos par zone
  const photosByZone = photosWithUrls.reduce<Record<string, typeof photosWithUrls>>((acc, p) => {
    const z = p.zone_nom ?? 'Général'
    ;(acc[z] ??= []).push(p)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="px-8 pt-8 pb-6" style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
        <Link href="/manager/planning" className="inline-flex items-center gap-2 text-blue-200 text-sm mb-5 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          Retour au planning
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{residence?.nom ?? '—'}</h1>
            <p className="text-blue-200 mt-1">
              {agent ? `${agent.prenom} ${agent.nom}` : '—'}
              {' · '}
              {inter.date_prevue ? new Date(inter.date_prevue + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '—'}
            </p>
            <p className="text-blue-300 text-sm mt-0.5">
              {fmt(inter.heure_scan, { hour: '2-digit', minute: '2-digit' })}
              {' → '}
              {fmt(inter.heure_fin, { hour: '2-digit', minute: '2-digit' })}
              {dureeMin !== null && ` (${fmtDuree(dureeMin)})`}
            </p>
          </div>
          <span className={`mt-1 shrink-0 px-3 py-1 rounded-full text-xs font-semibold ${
            inter.statut === 'terminee'
              ? 'bg-green-500/20 text-green-300'
              : 'bg-amber-400/20 text-amber-300'
          }`}>
            {inter.statut === 'terminee' ? 'Terminée' : inter.statut}
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* KPI résumé */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Réalisées',     value: realisees.length,        color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-100' },
            { label: 'Non réalisées', value: nonRealisees.length,     color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-100'   },
            { label: 'Photos',        value: photosWithUrls.length,   color: 'text-[#1A5FA8]',  bg: 'bg-blue-50',   border: 'border-blue-100'  },
            { label: 'Durée réelle',  value: fmtDuree(dureeMin),      color: 'text-slate-700',  bg: 'bg-slate-50',  border: 'border-slate-100' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-4 text-center`}>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* ── Comparaison des 3 durées ── */}
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <h2 className="font-semibold text-slate-800 mb-4">Comparaison des durées</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">

            {/* Contractuelle */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1">Contractuelle</p>
              <p className="text-2xl font-bold text-blue-700">{fmtDuree(dureeContractuelleMin)}</p>
              {contrat?.montant_mensuel && tauxHoraire ? (
                <p className="text-[10px] text-blue-400 mt-1.5 leading-tight">
                  {contrat.montant_mensuel}€ ÷ {tauxHoraire}€/h ÷ {contrat.nb_interventions_mois}/mois
                  <br/>
                  <span className="opacity-70">taux {tauxSource}</span>
                </p>
              ) : (
                <p className="text-[10px] text-blue-300 mt-1.5">données manquantes</p>
              )}
            </div>

            {/* Estimée */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
              <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1">Estimée</p>
              <p className="text-2xl font-bold text-amber-700">{fmtDuree(dureeEstimeeMin)}</p>
              <p className="text-[10px] text-amber-400 mt-1.5">somme tâches planifiées</p>
            </div>

            {/* Réelle */}
            <div className={`border rounded-xl p-4 text-center ${
              ecart === null
                ? 'bg-slate-50 border-slate-100'
                : ecart > 0
                  ? 'bg-red-50 border-red-100'
                  : 'bg-green-50 border-green-100'
            }`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                ecart === null ? 'text-slate-500' : ecart > 0 ? 'text-red-500' : 'text-green-500'
              }`}>Réelle</p>
              <p className={`text-2xl font-bold ${
                ecart === null ? 'text-slate-700' : ecart > 0 ? 'text-red-600' : 'text-green-600'
              }`}>{fmtDuree(dureeMin)}</p>
              {ecart !== null && (
                <p className={`text-[10px] mt-1.5 font-semibold ${ecart > 0 ? 'text-red-400' : 'text-green-500'}`}>
                  {ecart > 0 ? `+${fmtDuree(ecart)} vs estimée` : `−${fmtDuree(-ecart)} vs estimée`}
                </p>
              )}
            </div>
          </div>

          {/* Barre visuelle Estimée vs Réelle */}
          {dureeEstimeeMin !== null && dureeMin !== null && dureeEstimeeMin > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>0</span>
                <span>{fmtDuree(Math.max(dureeEstimeeMin, dureeMin))}</span>
              </div>
              <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
                {/* Barre estimée (référence) */}
                <div className="absolute inset-y-0 left-0 bg-amber-200 rounded-full"
                  style={{ width: `${Math.min(100, (dureeEstimeeMin / Math.max(dureeEstimeeMin, dureeMin)) * 100)}%` }}/>
                {/* Barre réelle */}
                <div className={`absolute inset-y-0 left-0 rounded-full opacity-70 ${dureeMin > dureeEstimeeMin ? 'bg-red-400' : 'bg-green-400'}`}
                  style={{ width: `${Math.min(100, (dureeMin / Math.max(dureeEstimeeMin, dureeMin)) * 100)}%` }}/>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-200 inline-block"/>Estimée</span>
                <span className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm inline-block ${dureeMin > dureeEstimeeMin ? 'bg-red-400' : 'bg-green-400'}`}/>Réelle</span>
              </div>
            </div>
          )}
        </div>

        {/* Temps par zone — fix : temps passé dans la zone (pas depuis le début) */}
        {zonesAvecDuree.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Temps par zone</h2>
            <div className="space-y-2">
              {zonesAvecDuree.map(z => (
                <div key={z.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <span className="font-medium text-slate-700">{z.zone_nom}</span>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    {z.heure_cloture && (
                      <span>Clôturée à {fmt(z.heure_cloture, { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                    {z.dureeMin !== null && (
                      <span className="font-semibold text-slate-700 tabular-nums">{fmtDuree(z.dureeMin)}</span>
                    )}
                  </div>
                </div>
              ))}
              {/* Total zones = somme = durée réelle, vérification implicite */}
              {zonesAvecDuree.some(z => z.dureeMin !== null) && (
                <div className="flex items-center justify-between py-2 pt-3 border-t border-slate-200">
                  <span className="font-semibold text-slate-600 text-sm">Total zones</span>
                  <span className="font-bold text-slate-800 tabular-nums text-sm">
                    {fmtDuree(zonesAvecDuree.reduce((s, z) => s + (z.dureeMin ?? 0), 0))}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chronologie tâches */}
        {traitees.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Chronologie des tâches</h2>
            <div className="relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-100"/>
              <div className="space-y-4">
                {traitees.map(t => {
                  const nr = t.statut_tache === 'non_realisee'
                  return (
                    <div key={t.id} className="relative flex items-start gap-4">
                      <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white ${nr ? 'bg-red-400' : 'bg-[#0BBFBF]'}`}/>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${nr ? 'text-slate-400' : 'text-slate-800'}`}>
                          {nr && <span className="text-red-400 mr-1">✗</span>}
                          {t.libelle}
                        </p>
                        {t.zone_nom && (
                          <p className="text-xs text-slate-400 mt-0.5">{t.zone_nom}</p>
                        )}
                        {t.commentaire && (
                          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mt-1.5 italic">
                            {t.commentaire}
                          </p>
                        )}
                      </div>
                      {t.heure_validation && (
                        <span className="text-sm text-slate-400 shrink-0 tabular-nums">
                          {fmt(t.heure_validation, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Photos par zone */}
        {photosWithUrls.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-5">Photos par zone</h2>
            <div className="space-y-6">
              {Object.entries(photosByZone).map(([zone, zonephotos]) => (
                <div key={zone}>
                  <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{zone}</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {zonephotos.map(p => (
                      p.signedUrl ? (
                        <a key={p.id} href={p.signedUrl} target="_blank" rel="noopener noreferrer"
                          className="block aspect-square rounded-xl overflow-hidden border border-slate-100 hover:opacity-90 transition-opacity">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.signedUrl} alt={zone} className="w-full h-full object-cover"/>
                        </a>
                      ) : (
                        <div key={p.id} className="aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                          Indisponible
                        </div>
                      )
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
