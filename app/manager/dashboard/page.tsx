import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Alerte } from '@/lib/types'
import DashboardKPIs    from '@/components/manager/DashboardKPIs'
import DashboardAlertes from '@/components/manager/DashboardAlertes'
import DashboardEquipe  from '@/components/manager/DashboardEquipe'

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

export default async function ManagerDashboard() {
  const supabase  = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: manager } = await supabase
    .from('profiles').select('prenom, nom').eq('id', user.id).single()

  // Fuseau Europe/Paris — nowTime construit manuellement pour éviter "14 h 25" sur Edge
  const todayStr  = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
  const nowParis  = new Date(new Date().toLocaleString('en-CA', { timeZone: 'Europe/Paris' }))
  const nowTime   = `${String(nowParis.getHours()).padStart(2, '0')}:${String(nowParis.getMinutes()).padStart(2, '0')}`

  // Récupérer les IDs agents d'abord (nécessaire pour filtrer)
  const { data: agentsRaw } = await supabase
    .from('profiles')
    .select('id, prenom, nom, binome_agent_id')
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
      .select('id, agent_id, statut, heure_debut_prevue, heure_fin_prevue, residence_id, residences(nom)')
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

  const cutoffScan    = addMinutesToTime(nowTime, -30)
  const agentProfiles = new Map(agents.map(a => [a.id, a]))

  const scanManquants = interventions
    .filter(i =>
      i.statut === 'planifiee' &&
      i.heure_debut_prevue &&
      i.heure_debut_prevue.slice(0, 5) < cutoffScan
    )
    .map(i => {
      const agent = agentProfiles.get(i.agent_id)
      return {
        ...i,
        prenom:    agent?.prenom ?? '?',
        nom:       agent?.nom ?? '?',
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
    const ints = interventions
      .filter(i => i.agent_id === agent.id)
      .map(i => ({
        ...i,
        residences: Array.isArray(i.residences) ? i.residences[0] : i.residences,
      }))

    const nbTotal     = ints.length
    const nbTerminees = ints.filter(i => i.statut === 'terminee').length
    const nbEnCours   = ints.filter(i => i.statut === 'en_cours').length
    const enRetard    = ints.some(
      i => i.statut === 'planifiee' && i.heure_debut_prevue && i.heure_debut_prevue.slice(0, 5) < cutoffScan
    )
    const absent = absentsIds.has(agent.id)

    let statut: 'disponible' | 'en_cours' | 'terminee' | 'pas_scanne' | 'en_retard' | 'absent'
    if (absent)                             statut = 'absent'
    else if (nbTotal === 0)                 statut = 'disponible'
    else if (nbEnCours > 0)                 statut = 'en_cours'
    else if (nbTerminees === nbTotal)       statut = 'terminee'
    else if (enRetard)                      statut = 'en_retard'
    else                                    statut = 'pas_scanne'

    return { ...agent, statut, nbTotal, nbTerminees, nbEnCours, interventions: ints }
  })

  const alertesUrgentes = alertes.filter(a => a.type !== 'reorganisation_proposee' && a.type !== 'rapport_soumis')

  const kpis = {
    totalJour:        interventions.length,
    scansEffectues:   interventions.filter(i => i.statut !== 'planifiee').length,
    rapportsRecus:    interventions.filter(i => i.statut === 'terminee').length,
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

      <div className="px-4 py-6 md:px-8 pb-24 md:pb-6 space-y-4">
        <DashboardKPIs kpis={kpis} />
        <div className="md:grid md:grid-cols-[3fr_2fr] md:gap-6 space-y-4 md:space-y-0">
          <DashboardAlertes
            scanManquants={scanManquants}
            rapportsEnRetard={rapportsEnRetard}
            alertes={alertes}
            kpis={kpis}
          />
          <DashboardEquipe agents={statutParAgent} />
        </div>
      </div>
    </div>
  )
}
