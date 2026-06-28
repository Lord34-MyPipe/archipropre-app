export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ValiderRapportButton from '@/components/manager/ValiderRapportButton'
import CommandeStatutButtons from '@/components/manager/CommandeStatutButtons'

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

interface TacheZoneRaw {
  tache_template_id: string | null
  taches_template: {
    duree_minutes: number
    zone_id: string | null
    zones_residence: { nom: string }[] | { nom: string } | null
  }[] | {
    duree_minutes: number
    zone_id: string | null
    zones_residence: { nom: string }[] | { nom: string } | null
  } | null
}

interface ComparatifZone {
  nom: string
  estimee: number | null
  reelle: number | null
  ecartZone: number | null
}

interface PhotoChariot {
  id: string
  storage_path: string
}

interface LigneCommande {
  id: string
  type_ligne: 'produit' | 'ampoule'
  quantite: number
  localisation: string | null
  photo_avant_path: string | null
  photo_apres_path: string | null
  produits: { nom: string }[] | { nom: string } | null
}

interface CommandeProduits {
  id: string
  statut: string
  created_at: string
  lignes_commande: LigneCommande[]
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

// PostgREST peut retourner tableau ou objet sur FK many-to-one
function unwrap<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
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
    { data: tachesZoneRaw },
    { data: photosChariotRaw },
    { data: commandesRaw },
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
    // Durée estimée totale : join FK many-to-one → taches_template retourne un objet
    supabase
      .from('taches_intervention')
      .select('tache_template_id, taches_template(duree_minutes)')
      .eq('intervention_id', id),
    // Durée estimée par zone : remonte tache → template → zones_residence
    supabase
      .from('taches_intervention')
      .select('tache_template_id, taches_template(duree_minutes, zone_id, zones_residence(nom))')
      .eq('intervention_id', id),
    supabase
      .from('photos_chariot')
      .select('id, storage_path')
      .eq('intervention_id', id)
      .order('created_at'),
    supabase
      .from('commandes_produits')
      .select('id, statut, created_at, lignes_commande(id, type_ligne, quantite, localisation, photo_avant_path, photo_apres_path, produits(nom))')
      .eq('intervention_id', id)
      .order('created_at'),
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

  // Signed URLs photos chariot
  const photosChariot = await Promise.all(
    (photosChariotRaw ?? []).map(async (p: PhotoChariot) => {
      const { data } = await supabase.storage
        .from('photos-chariot')
        .createSignedUrl(p.storage_path, 3600)
      return { ...p, signedUrl: data?.signedUrl ?? null }
    })
  )

  // Signed URLs photos ampoules (avant/après dans lignes_commande)
  const commandes = (commandesRaw ?? []) as unknown as CommandeProduits[]
  const commandesAvecUrls = await Promise.all(
    commandes.map(async cmd => {
      const lignesAvecUrls = await Promise.all(
        (cmd.lignes_commande ?? []).map(async (l: LigneCommande) => {
          const [signedAvant, signedApres] = await Promise.all([
            l.photo_avant_path
              ? supabase.storage.from('photos-ampoules').createSignedUrl(l.photo_avant_path, 3600)
              : Promise.resolve({ data: null }),
            l.photo_apres_path
              ? supabase.storage.from('photos-ampoules').createSignedUrl(l.photo_apres_path, 3600)
              : Promise.resolve({ data: null }),
          ])
          return {
            ...l,
            signedUrlAvant: signedAvant.data?.signedUrl ?? null,
            signedUrlApres: signedApres.data?.signedUrl ?? null,
          }
        })
      )
      return { ...cmd, lignes_commande: lignesAvecUrls }
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

  // ── Comparatif par zone ───────────────────────────────────────────────────

  // Map estimée : zone_nom → somme duree_minutes (via template → zones_residence)
  // Tâches sans zone_id → regroupées sous "Général" pour matcher le fallback réel
  const mapEstime = new Map<string, number>()
  for (const t of (tachesZoneRaw ?? []) as TacheZoneRaw[]) {
    const tmpl = unwrap(t.taches_template)
    if (!tmpl) continue
    const zr = unwrap(tmpl.zones_residence)
    const nomZone = zr?.nom ?? 'Général'
    mapEstime.set(nomZone, (mapEstime.get(nomZone) ?? 0) + tmpl.duree_minutes)
  }

  // Map réelle : zone_nom → durée (déjà calculée clôture N − clôture N-1)
  const mapReel = new Map<string, number>()
  for (const z of zonesAvecDuree) {
    if (z.dureeMin !== null) mapReel.set(z.zone_nom, z.dureeMin)
  }

  // UNION des zones — ordre : réelles (heure_cloture), puis estimées-only (alpha), Général en dernier
  const zonesOrdreReel = zonesAvecDuree.map(z => z.zone_nom)
  const zonesEstimeeOnly = [...mapEstime.keys()]
    .filter(n => !mapReel.has(n) && n !== 'Général')
    .sort((a, b) => a.localeCompare(b, 'fr'))
  const hasGeneralEstim = mapEstime.has('Général')
  const hasGeneralReel  = mapReel.has('Général')
  const showGeneral = (hasGeneralEstim || hasGeneralReel) && !zonesOrdreReel.includes('Général')

  const ordreZones = [
    ...zonesOrdreReel,
    ...zonesEstimeeOnly,
    ...(showGeneral ? ['Général'] : []),
  ]

  const comparatifZones: ComparatifZone[] = ordreZones.map(nom => {
    const estimee  = mapEstime.get(nom) ?? null
    const reelle   = mapReel.get(nom) ?? null
    const ecartZone = estimee !== null && reelle !== null ? reelle - estimee : null
    return { nom, estimee, reelle, ecartZone }
  })

  // ── Écart Réelle vs Estimée ───────────────────────────────────────────────
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
            inter.statut === 'validee'
              ? 'bg-emerald-500/20 text-emerald-200'
              : inter.statut === 'terminee'
                ? 'bg-green-500/20 text-green-300'
                : 'bg-amber-400/20 text-amber-300'
          }`}>
            {inter.statut === 'validee' ? 'Validé' : inter.statut === 'terminee' ? 'Terminée' : inter.statut}
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

        {/* ── Comparaison par zone : estimée vs réelle ── */}
        {comparatifZones.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Comparaison par zone</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 pr-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Zone</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-amber-400 uppercase tracking-wider">Estimée</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Réelle</th>
                    <th className="text-right py-2 pl-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {comparatifZones.map(z => {
                    const nonTraitee = z.reelle === null && z.estimee !== null
                    const horsPlanning = z.reelle !== null && z.estimee === null
                    const depasse = z.ecartZone !== null && z.ecartZone > 0
                    const sousTemps = z.ecartZone !== null && z.ecartZone <= 0

                    return (
                      <tr key={z.nom} className={nonTraitee ? 'bg-orange-50/50' : ''}>
                        {/* Nom zone */}
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            {nonTraitee && (
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"/>
                            )}
                            <span className={`font-medium ${nonTraitee ? 'text-orange-700' : 'text-slate-700'}`}>
                              {z.nom}
                            </span>
                            {horsPlanning && (
                              <span className="text-[10px] text-slate-400 italic">hors tâches planifiées</span>
                            )}
                          </div>
                          {nonTraitee && (
                            <p className="text-[10px] text-orange-500 mt-0.5 ml-3.5">non traitée</p>
                          )}
                        </td>

                        {/* Estimée */}
                        <td className="py-3 px-3 text-right tabular-nums">
                          <span className={z.estimee !== null ? 'text-amber-600 font-medium' : 'text-slate-300'}>
                            {z.estimee !== null ? fmtDuree(z.estimee) : '—'}
                          </span>
                        </td>

                        {/* Réelle */}
                        <td className="py-3 px-3 text-right tabular-nums">
                          {z.reelle !== null ? (
                            <span className={`font-semibold ${depasse ? 'text-red-600' : sousTemps ? 'text-green-600' : 'text-slate-700'}`}>
                              {fmtDuree(z.reelle)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Écart */}
                        <td className="py-3 pl-3 text-right tabular-nums">
                          {z.ecartZone !== null ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              depasse
                                ? 'bg-red-50 text-red-500'
                                : 'bg-green-50 text-green-600'
                            }`}>
                              {depasse ? `+${fmtDuree(z.ecartZone)}` : `−${fmtDuree(-z.ecartZone)}`}
                            </span>
                          ) : (
                            <span className="text-slate-200">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
        {/* Section Chariot */}
        {photosChariot.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">🛒 Photo du chariot</h2>
            <div className="grid grid-cols-4 gap-3">
              {photosChariot.map(p => (
                p.signedUrl ? (
                  <a key={p.id} href={p.signedUrl} target="_blank" rel="noopener noreferrer"
                    className="block aspect-square rounded-xl overflow-hidden border border-slate-100 hover:opacity-90 transition-opacity">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.signedUrl} alt="Chariot" className="w-full h-full object-cover"/>
                  </a>
                ) : (
                  <div key={p.id} className="aspect-square rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                    Indisponible
                  </div>
                )
              ))}
            </div>
          </div>
        )}

        {/* Section Commandes produits */}
        {commandesAvecUrls.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">📦 Commande produits</h2>
            {commandesAvecUrls.map(cmd => (
              <div key={cmd.id}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400">
                    Soumise le {new Date(cmd.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    cmd.statut === 'livre'    ? 'bg-green-100 text-green-700' :
                    cmd.statut === 'commande' ? 'bg-blue-100 text-blue-700'  :
                                               'bg-amber-100 text-amber-700'
                  }`}>
                    {cmd.statut === 'livre' ? 'Livré' : cmd.statut === 'commande' ? 'Commandé' : 'En attente'}
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  {(cmd.lignes_commande as (LigneCommande & { signedUrlAvant: string | null; signedUrlApres: string | null })[])
                    .map(l => {
                      const produitNomRaw = (l as unknown as Record<string, unknown>).produits
                      const produitNom = produitNomRaw && typeof produitNomRaw === 'object'
                        ? (Array.isArray(produitNomRaw) ? (produitNomRaw[0] as { nom: string } | undefined)?.nom : (produitNomRaw as { nom: string }).nom) ?? null
                        : null
                      return (
                        <div key={l.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-700">
                              {l.type_ligne === 'ampoule' ? '💡 Ampoule' : produitNom ?? '—'}
                            </p>
                            {l.localisation && (
                              <p className="text-xs text-slate-400 mt-0.5">{l.localisation}</p>
                            )}
                            {l.type_ligne === 'produit' && l.quantite > 1 && (
                              <p className="text-xs text-slate-400">×{l.quantite}</p>
                            )}
                          </div>
                          {/* Photos ampoule */}
                          {(l.signedUrlAvant || l.signedUrlApres) && (
                            <div className="flex gap-2">
                              {l.signedUrlAvant && (
                                <a href={l.signedUrlAvant} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={l.signedUrlAvant} alt="avant" className="w-16 h-16 object-cover rounded-lg border border-slate-100"/>
                                </a>
                              )}
                              {l.signedUrlApres && (
                                <a href={l.signedUrlApres} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={l.signedUrlApres} alt="après" className="w-16 h-16 object-cover rounded-lg border border-slate-100"/>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>

                {/* Boutons statut */}
                <CommandeStatutButtons commandeId={cmd.id} statutActuel={cmd.statut} />
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Footer action */}
      {inter.statut === 'terminee' && (
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end bg-white">
          <ValiderRapportButton interventionId={inter.id} />
        </div>
      )}
      {inter.statut === 'validee' && (
        <div className="border-t border-slate-100 px-6 py-4 flex items-center gap-2 bg-white">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span className="text-sm font-semibold" style={{ color: '#3B6D11' }}>Rapport validé</span>
          {inter.validee_at && (
            <span className="text-xs text-slate-400">
              · {new Date(inter.validee_at).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                  timeZone: 'Europe/Paris',
                })}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
