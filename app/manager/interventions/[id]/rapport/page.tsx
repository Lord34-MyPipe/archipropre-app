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

function fmt(ts: string | null, opts: Intl.DateTimeFormatOptions) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', ...opts })
}

function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

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
  ])

  if (!inter) redirect('/manager/planning')

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

  const dureeMin = minutesBetween(inter.heure_scan, inter.heure_fin)

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
              {dureeMin !== null && ` (${dureeMin} min)`}
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
            { label: 'Durée totale',  value: dureeMin !== null ? `${dureeMin} min` : '—', color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-100' },
          ].map(k => (
            <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-4 text-center`}>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Temps par zone */}
        {zonesList.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Temps par zone</h2>
            <div className="space-y-2">
              {zonesList.map(z => {
                const duree = minutesBetween(inter.heure_scan, z.heure_cloture)
                return (
                  <div key={z.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <span className="font-medium text-slate-700">{z.zone_nom}</span>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      {z.heure_cloture && (
                        <span>Clôturée à {fmt(z.heure_cloture, { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                      {duree !== null && (
                        <span className="font-semibold text-slate-700 tabular-nums">{duree} min</span>
                      )}
                    </div>
                  </div>
                )
              })}
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
