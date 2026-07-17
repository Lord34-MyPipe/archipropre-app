import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Alerte } from '@/lib/types'
import DashboardKPIs    from '@/components/manager/DashboardKPIs'
import DashboardAlertes from '@/components/manager/DashboardAlertes'
import DashboardEquipe  from '@/components/manager/DashboardEquipe'
import CommandesBloc    from './CommandesBloc'
import DashboardRefresh from './DashboardRefresh'
import { FEATURES, SEUIL_RETARD_SCAN_MIN } from '@/lib/features'

export const dynamic = 'force-dynamic'

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor((((total % 1440) + 1440) % 1440) / 60)
  const mm = ((total % 60) + 60) % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function diffMinutes(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  return (th * 60 + tm) - (fh * 60 + fm)
}

// ── Regroupement par MISSION (résidence + contrat), pas par bâtiment ─────────
// Une résidence multi-bâtiments = N interventions mais UNE seule mission —
// même piège que 9h (clôture groupée) / 9j (dashboard agent) / le calcul du
// temps journée : ne jamais compter les bâtiments dans les totaux. Clé =
// (agent_id, contrat_id ?? id) — même critère qu'ailleurs dans le chantier
// bâtiments. Mono-bâtiment (1 intervention, pas de contrat_id partagé) :
// 1 groupe = 1 intervention, comportement inchangé par construction.

interface MissionAgg {
  key: string
  agent_id: string
  statut: string
  heure_debut_prevue: string | null
  heure_fin_prevue: string | null
  residence_nom: string | null
  nb_batiments: number
}

interface InterventionForMission {
  id: string
  agent_id: string
  contrat_id?: string | null
  statut: string
  heure_debut_prevue: string | null
  heure_fin_prevue: string | null
  residences: { nom: string } | { nom: string }[] | null
}

function statutMission(statuts: string[]): string {
  if (statuts.some(s => s === 'en_cours')) return 'en_cours'
  // 'validee' = rapport reçu ET validé RH — strictement postérieur à 'terminee'
  // (la validation RH ne porte que sur des interventions déjà 'terminee'), donc
  // une mission entièrement validée reste "Terminé" au sens du dashboard.
  if (statuts.every(s => s === 'terminee' || s === 'validee')) return 'terminee'
  if (statuts.every(s => s === 'planifiee')) return 'planifiee'
  // Mixte (ex. certains bâtiments terminés, d'autres pas) : travail commencé.
  return 'en_cours'
}

function groupMissions(ints: InterventionForMission[]): MissionAgg[] {
  const map = new Map<string, InterventionForMission[]>()
  for (const i of ints) {
    const key = `${i.agent_id}::${i.contrat_id ?? i.id}`
    const arr = map.get(key)
    if (arr) arr.push(i)
    else map.set(key, [i])
  }

  const missions: MissionAgg[] = []
  for (const [key, groupe] of map) {
    let heureDebut: string | null = null
    let heureFin: string | null = null
    for (const i of groupe) {
      if (i.heure_debut_prevue && (!heureDebut || i.heure_debut_prevue < heureDebut)) heureDebut = i.heure_debut_prevue
      if (i.heure_fin_prevue && (!heureFin || i.heure_fin_prevue > heureFin)) heureFin = i.heure_fin_prevue
    }
    const first = groupe[0]
    const res = first.residences
    const residenceNom = res
      ? (Array.isArray(res) ? res[0]?.nom : (res as { nom: string }).nom) ?? null
      : null

    missions.push({
      key,
      agent_id:            first.agent_id,
      statut:              statutMission(groupe.map(i => i.statut)),
      heure_debut_prevue:  heureDebut,
      heure_fin_prevue:    heureFin,
      residence_nom:       residenceNom,
      nb_batiments:        groupe.length,
    })
  }

  return missions.sort((a, b) => (a.heure_debut_prevue ?? '23:59').localeCompare(b.heure_debut_prevue ?? '23:59'))
}

export default async function ManagerDashboard() {
  const supabase  = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: manager } = await supabase
    .from('profiles').select('prenom, nom').eq('id', user.id).single()

  // Fuseau Europe/Paris via Intl.formatToParts — garanti stable sur tous les runtimes
  const _now = new Date()
  const _dateFmt = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
  const todayStr  = _dateFmt.format(_now)
  const _timeFmt  = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false })
  const _parts    = _timeFmt.formatToParts(_now)
  const nowTime   = `${_parts.find(p => p.type === 'hour')?.value ?? '00'}:${_parts.find(p => p.type === 'minute')?.value ?? '00'}`

  // Récupérer les IDs agents d'abord (nécessaire pour filtrer)
  const { data: agentsRaw } = await supabase
    .from('profiles')
    .select('id, prenom, nom, telephone, binome_agent_id')
    .eq('manager_id', user.id).eq('actif', true).eq('role', 'agent')

  const agents   = agentsRaw ?? []
  const agentIds = agents.length
    ? agents.map(a => a.id)
    : ['00000000-0000-0000-0000-000000000000']

  const [
    { data: interventionsRaw },
    { data: alertesRaw },
    { data: absencesRaw },
  ] = await Promise.all([
    supabase.from('interventions')
      .select('id, agent_id, statut, heure_debut_prevue, heure_fin_prevue, residence_id, contrat_id, residences(nom)')
      .in('agent_id', agentIds)
      .eq('date_prevue', todayStr)
      .neq('statut', 'annulee')
      .order('heure_debut_prevue'),

    supabase.from('alertes')
      .select('id, type, message, metadata, intervention_id, envoyee_at, lue, destinataire_id')
      .eq('destinataire_id', user.id).eq('lue', false)
      .order('envoyee_at', { ascending: false }),

    supabase.from('absences')
      .select('agent_id')
      .in('agent_id', agentIds)
      .lte('date_debut', todayStr).gte('date_fin', todayStr).eq('valide', true),
  ])

  const interventions = interventionsRaw ?? []
  const alertes       = (alertesRaw ?? []) as Alerte[]
  const absentsIds    = new Set((absencesRaw ?? []).map(a => a.agent_id))

  // ── Calculs côté serveur ──────────────────────────────────────────────────

  const agentProfiles = new Map(agents.map(a => [a.id, a]))

  // Une intervention est "scan manquant" uniquement si son heure de début
  // est DÉJÀ PASSÉE depuis plus de 30 min (diffMinutes > 0 = passé, < 0 = futur)
  const scanManquants = interventions
    .filter(i =>
      i.statut === 'planifiee' &&
      i.heure_debut_prevue &&
      diffMinutes(i.heure_debut_prevue.slice(0, 5), nowTime) >= SEUIL_RETARD_SCAN_MIN
    )
    .map(i => {
      const agent = agentProfiles.get(i.agent_id)
      return {
        ...i,
        prenom:    agent?.prenom ?? '?',
        nom:       agent?.nom ?? '?',
        telephone: (agent as { telephone?: string | null } | undefined)?.telephone ?? null,
        retardMin: diffMinutes(i.heure_debut_prevue!.slice(0, 5), nowTime),
        residences: Array.isArray(i.residences) ? i.residences[0] : i.residences,
      }
    })

  const rapportsEnRetard = interventions
    .filter(i =>
      ['planifiee', 'en_cours'].includes(i.statut) &&
      i.heure_fin_prevue &&
      i.heure_fin_prevue.slice(0, 5) < nowTime
    )
    .map(i => ({
      ...i,
      residences: Array.isArray(i.residences) ? i.residences[0] : i.residences,
    }))

  const statutParAgent = agents.map(agent => {
    const ints = interventions.filter(i => i.agent_id === agent.id)
    const missions = groupMissions(ints)

    const nbTotal     = missions.length
    const nbTerminees = missions.filter(m => m.statut === 'terminee').length
    const nbEnCours   = missions.filter(m => m.statut === 'en_cours').length
    // enRetard reste un booléen sur les interventions brutes (pas un compteur) :
    // signale correctement "au moins un créneau planifié déjà dépassé", que ce
    // soit pour une mission mono ou multi-bâtiments (le 1er créneau du chaînage
    // suffit à détecter le retard de la mission entière).
    const enRetard = ints.some(
      i => i.statut === 'planifiee' && i.heure_debut_prevue && diffMinutes(i.heure_debut_prevue.slice(0, 5), nowTime) >= SEUIL_RETARD_SCAN_MIN
    )
    const absent = absentsIds.has(agent.id)

    let statut: 'disponible' | 'en_cours' | 'terminee' | 'pas_scanne' | 'en_retard' | 'absent'
    if (absent)                             statut = 'absent'
    else if (nbTotal === 0)                 statut = 'disponible'
    else if (nbEnCours > 0)                 statut = 'en_cours'
    else if (nbTerminees === nbTotal)       statut = 'terminee'
    else if (enRetard)                      statut = 'en_retard'
    else                                    statut = 'pas_scanne'

    return { ...agent, statut, nbTotal, nbTerminees, nbEnCours, missions }
  })

  const statutParAgentFiltre = statutParAgent.filter(a => a.statut !== 'disponible')

  const alertesUrgentes = alertes.filter(a => a.type !== 'reorganisation_proposee' && a.type !== 'rapport_soumis')

  // KPI comptés par MISSION (résidence), pas par intervention brute — une
  // résidence multi-bâtiments (ex. PRIEURE, 9 bâtiments) compte pour 1, pas 9.
  const missionsJour = groupMissions(interventions)
  const kpis = {
    totalJour:        missionsJour.length,
    scansEffectues:   missionsJour.filter(m => m.statut !== 'planifiee').length,
    rapportsRecus:    missionsJour.filter(m => m.statut === 'terminee').length,
    pointsAttention:  scanManquants.length + rapportsEnRetard.length + alertesUrgentes.length,
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-8">
        <p className="text-blue-300 text-sm">Bonjour,</p>
        <h1 className="text-2xl font-bold mt-0.5">{manager?.prenom} {manager?.nom}</h1>
        <p className="text-blue-300 text-sm mt-1">
          {new Date().toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            timeZone: 'Europe/Paris',
          })}
        </p>
      </div>

      <DashboardRefresh />
      <div className="px-4 py-6 md:px-8 pb-24 md:pb-6 space-y-4">
        <DashboardKPIs kpis={kpis} />
        <div className="md:grid md:grid-cols-[3fr_2fr] md:gap-6 space-y-4 md:space-y-0">
          <div className="space-y-4">
            <DashboardAlertes
              scanManquants={scanManquants}
              rapportsEnRetard={rapportsEnRetard}
              alertes={alertes}
              kpis={kpis}
            />
            {FEATURES.commandesProduits && <CommandesBloc managerNom={`${manager?.prenom ?? ''} ${manager?.nom ?? ''}`.trim()} />}
          </div>
          <DashboardEquipe agents={statutParAgentFiltre} />
        </div>
      </div>
    </div>
  )
}
