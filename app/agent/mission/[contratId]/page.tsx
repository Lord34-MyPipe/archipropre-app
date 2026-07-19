export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, Clock, ChevronRight, Send } from 'lucide-react'

// Écran niveau 1 (étape 9b, §7.3) — liste des bâtiments à faire aujourd'hui sur
// cette résidence. N'existe QUE pour les résidences multi-bâtiments : le scan
// route ici uniquement quand il y a plusieurs interventions le même jour.
// Le clic sur une carte va vers l'écran niveau 2 (zones, existant, inchangé).

interface Props {
  params: Promise<{ contratId: string }>
}

interface MissionIntervention {
  id: string
  batiment: string | null
  statut: string
  heure_debut_prevue: string | null
  heure_fin_prevue: string | null
  heure_scan: string | null
  residences: { nom: string } | null
}

// État par carte bâtiment (étape 9g) — dérivé des zones réellement validées
// (règle zoneComplete de l'écran niveau 2), pas du seul statut brut de
// l'intervention : tant que 9h n'existe pas, un bâtiment fini ses zones sans
// jamais passer par statut='terminee' (le bouton de clôture a déménagé ici).
type CardState = 'termine' | 'pret' | 'en_cours' | 'a_faire'

const CARD_STATE_CONFIG: Record<CardState, { label: string; bg: string; text: string; dot: string }> = {
  termine:  { label: 'Terminé',  bg: 'bg-green-50',  text: 'text-green-700', dot: 'bg-green-400' },
  pret:     { label: 'Prêt',     bg: 'bg-green-50',  text: 'text-green-700', dot: 'bg-green-400' },
  en_cours: { label: 'En cours', bg: 'bg-amber-50',  text: 'text-amber-700', dot: 'bg-amber-400' },
  a_faire:  { label: 'À faire',  bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
}

function cardState(statut: string, zonesTotal: number, zonesCompletes: number): CardState {
  if (statut === 'terminee' || statut === 'validee') return 'termine'
  if (zonesTotal > 0 && zonesCompletes === zonesTotal) return 'pret'
  // Intervention sans AUCUNE zone rattachable (ex. "Containers — sortie/
  // rentrée" du dispatch : pas de zones_residence dédiée, cf correctif halls
  // bi-hebdo) — zonesTotal restera structurellement à 0 pour toujours,
  // bloquant sinon "Envoyer le rapport" en permanence pour ce bâtiment. Une
  // fois l'intervention démarrée (statut !== 'planifiee', donc scannée), on
  // la considère prête d'office plutôt que de bloquer le reste de la mission.
  if (zonesTotal === 0 && statut !== 'planifiee') return 'pret'
  if (zonesCompletes > 0) return 'en_cours'
  return 'a_faire'
}

export default async function MissionPage({ params }: Props) {
  const { contratId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Date du jour en Europe/Paris (même pattern que agent/scan/page.tsx)
  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })

  const { data: intersRaw } = await supabase
    .from('interventions')
    .select('id, batiment, statut, heure_debut_prevue, heure_fin_prevue, heure_scan, residences(nom)')
    .eq('agent_id', user.id)
    .eq('contrat_id', contratId)
    .eq('date_prevue', today)
    .neq('statut', 'annulee')
    .order('heure_debut_prevue') as { data: MissionIntervention[] | null }

  const interventions = intersRaw ?? []

  // Garde-fou : cet écran n'a de sens qu'à 2+ bâtiments. Si la situation a changé
  // depuis le scan (ex. un bâtiment annulé entre-temps), on retombe sur le
  // comportement direct plutôt que d'afficher un écran de choix inutile.
  if (interventions.length === 0) redirect('/agent/dashboard')
  if (interventions.length === 1) redirect(`/agent/intervention/${interventions[0].id}`)

  // Zones réellement validées par bâtiment (étape 9g) — décompte EXACT à partir
  // des tâches et photos de chaque intervention (chacune n'a que ses vraies
  // zones depuis 9c), suivant la même règle zoneComplete que l'écran niveau 2 :
  // zone complète = toutes ses tâches traitées + au moins une photo.
  const ids = interventions.map(i => i.id)
  const [{ data: tachesRaw }, { data: photosRaw }] = await Promise.all([
    supabase.from('taches_intervention').select('intervention_id, zone_nom, statut_tache').in('intervention_id', ids),
    supabase.from('photos_zone').select('intervention_id, zone_nom').in('intervention_id', ids),
  ])

  type ZoneAgg = { total: number; traitees: number; photo: boolean }
  const zonesParIntervention = new Map<string, Map<string, ZoneAgg>>()
  for (const t of tachesRaw ?? []) {
    const interId = t.intervention_id as string
    const zone = (t.zone_nom as string | null) ?? 'Général'
    const map = zonesParIntervention.get(interId) ?? new Map<string, ZoneAgg>()
    const agg = map.get(zone) ?? { total: 0, traitees: 0, photo: false }
    agg.total += 1
    if (t.statut_tache === 'realisee' || t.statut_tache === 'non_realisee') agg.traitees += 1
    map.set(zone, agg)
    zonesParIntervention.set(interId, map)
  }
  for (const p of photosRaw ?? []) {
    const interId = p.intervention_id as string
    const zone = (p.zone_nom as string | null) ?? 'Général'
    const map = zonesParIntervention.get(interId)
    const agg = map?.get(zone)
    if (agg) agg.photo = true
  }

  function zonesStats(interId: string): { total: number; completes: number } {
    const map = zonesParIntervention.get(interId)
    if (!map) return { total: 0, completes: 0 }
    let completes = 0
    for (const agg of map.values()) {
      if (agg.total > 0 && agg.traitees === agg.total && agg.photo) completes += 1
    }
    return { total: map.size, completes }
  }

  const residenceNom = interventions[0].residences?.nom ?? '—'
  const heureScanIso = interventions.find(i => i.heure_scan)?.heure_scan ?? null
  const heureScanLabel = heureScanIso
    ? new Date(heureScanIso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
    : null

  // État de chaque bâtiment + condition d'activation du CTA final (étape 9g) :
  // actif seulement quand TOUS les bâtiments sont prêts (zones validées) ou déjà
  // terminés.
  const etats = interventions.map(inter => {
    const { total, completes } = zonesStats(inter.id)
    return { inter, total, completes, state: cardState(inter.statut, total, completes) }
  })
  const nbPrets    = etats.filter(e => e.state === 'pret' || e.state === 'termine').length
  const tousPrets  = nbPrets === interventions.length
  const tousTermines = etats.every(e => e.state === 'termine')

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Header */}
      <div className="px-5 pt-10 pb-6" style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
        <h1 className="text-xl font-bold text-white truncate">{residenceNom}</h1>
        {heureScanLabel && (
          <p className="text-blue-200 text-sm font-medium mt-1.5 flex items-center gap-1.5">
            <Clock className="w-4 h-4 shrink-0" />
            Démarré à {heureScanLabel} · {tousTermines ? 'terminé' : 'en cours'}
          </p>
        )}
        <p className="text-blue-300 text-sm mt-1">
          {interventions.length} bâtiments à faire aujourd&apos;hui
        </p>
      </div>

      {/* Cartes bâtiments */}
      <div className="px-5 py-5 space-y-3">
        {etats.map(({ inter, total, completes, state }) => {
          const cfg = CARD_STATE_CONFIG[state]
          return (
            <Link key={inter.id} href={`/agent/intervention/${inter.id}`}>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4 active:bg-slate-50 transition-colors">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#EFF6FF' }}>
                  <Building2 className="w-6 h-6 text-[#1A5FA8]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 truncate">{inter.batiment ?? 'Bâtiment'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {completes}/{total} zone{total > 1 ? 's' : ''}
                    {inter.heure_debut_prevue ? ` · ${inter.heure_debut_prevue.slice(0, 5)}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Bouton envoyer rapport (étape 9g) — actif seulement quand tous les
          bâtiments sont prêts. Route vers controle-final du 1er bâtiment pour
          l'instant : la clôture groupée de TOUTES les interventions est 9h. */}
      <div className="fixed bottom-20 left-0 right-0 max-w-lg mx-auto px-5 z-20">
        {tousPrets ? (
          <Link href={`/agent/intervention/${interventions[0].id}/controle-final`}>
            <button
              className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
            >
              <Send className="w-5 h-5" />
              Envoyer le rapport
            </button>
          </Link>
        ) : (
          <button
            disabled
            title="Terminez tous les bâtiments"
            className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-xl flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
            style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
          >
            <Send className="w-5 h-5" />
            {interventions.length - nbPrets} bâtiment{interventions.length - nbPrets > 1 ? 's' : ''} restant{interventions.length - nbPrets > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  )
}
