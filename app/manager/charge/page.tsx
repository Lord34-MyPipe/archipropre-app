import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ChargeClient from './ChargeClient'

export interface ChargeAgent {
  agent_id: string
  nom_complet: string
  capacite_theorique: number
  seuil_cible_pct: number
  mode_deplacement: string | null
  secteur_libelle: string | null
  heures_conges: number
  heures_absences: number
  heures_nettoyage: number
  heures_trajets_est: number
  capacite_disponible: number
  taux_remplissage_pct: number
  binome_nom: string | null
  binome_heures_hebdo: number | null
  heures_realisees: number | null
}

const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre']

// ── Helpers date (toujours en Europe/Paris, jamais new Date() brut pour dériver) ──

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
}

function mondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short',
  }).formatToParts(d)
  const weekdayPart = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const ISO_DAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const isoDay = ISO_DAY[weekdayPart] ?? 1
  const daysToMonday = isoDay === 0 ? -6 : 1 - isoDay
  return addDays(dateStr, daysToMonday)
}

// Libellé compact "13–19 juillet 2026" — chevauche mois/année si besoin.
// Purement string-based (Y-M-D déjà résolus en Europe/Paris) : aucun nouveau
// risque de fuseau horaire.
function formatLabelSemaine(debutStr: string, finStr: string): string {
  const [anD, moD, joD] = debutStr.split('-').map(Number)
  const [anF, moF, joF] = finStr.split('-').map(Number)
  const md = MOIS_FR[moD - 1]
  const mf = MOIS_FR[moF - 1]
  if (anD !== anF) return `${joD} ${md} ${anD} – ${joF} ${mf} ${anF}`
  if (moD !== moF) return `${joD} ${md} – ${joF} ${mf} ${anF}`
  return `${joD}–${joF} ${mf} ${anF}`
}

function heuresDiff(debut: string | null, fin: string | null): number {
  if (!debut || !fin) return 0
  const [h1, m1] = debut.split(':').map(Number)
  const [h2, m2] = fin.split(':').map(Number)
  return ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60
}

function dateToUTCDays(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

// Nb de jours de chevauchement entre [debut1,fin1] et [debut2,fin2], bornes incluses.
function overlapJours(debut1: string, fin1: string, debut2: string, fin2: string): number {
  const maxDebut = Math.max(dateToUTCDays(debut1), dateToUTCDays(debut2))
  const minFin   = Math.min(dateToUTCDays(fin1), dateToUTCDays(fin2))
  return Math.max(0, minFin - maxDebut + 1)
}

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function ChargePage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') redirect('/login')

  const admin = await createAdminClient()

  // Récupère les IDs des agents de ce manager
  const { data: myAgents } = await supabase
    .from('profiles')
    .select('id')
    .eq('manager_id', user.id)
    .eq('role', 'agent')
    .eq('actif', true)

  const agentIds = (myAgents ?? []).map(a => a.id)

  // Semaine sélectionnée (Europe/Paris) — navigable via ?date=
  const todayStr = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })
  const sp = await searchParams
  const selectedDate = sp.date ?? todayStr
  const weekStart = mondayOfWeek(selectedDate)
  const weekEnd = addDays(weekStart, 6)
  const isCurrentWeek = weekStart === mondayOfWeek(todayStr)
  const prevWeekHref = `/manager/charge?date=${addDays(weekStart, -7)}`
  const nextWeekHref = `/manager/charge?date=${addDays(weekStart, 7)}`
  const weekLabel = formatLabelSemaine(weekStart, weekEnd)

  let agents: ChargeAgent[] = []
  if (agentIds.length > 0) {
    // v_charge_agent est figée sur CURRENT_DATE (date_trunc('week', CURRENT_DATE)
    // codé en dur dans la vue, aucun paramètre de semaine exposé) — impossible à
    // filtrer sur une autre semaine depuis le client. On recalcule donc ici,
    // directement depuis les tables sources, EXACTEMENT la même formule que la
    // vue (heures_nettoyage, heures_conges, heures_absences, heures_trajets_est
    // = 20% du nettoyage, capacite_disponible, taux_remplissage_pct), mais
    // paramétrée par [weekStart, weekEnd]. Un seul chemin de calcul, valable
    // aussi bien pour la semaine courante que pour les autres.
    const [
      { data: profilesData },
      { data: interventionsData },
      { data: congesData },
      { data: absencesData },
      { data: journeesData },
    ] = await Promise.all([
      admin.from('profiles')
        .select('id, prenom, nom, contrat_heures_hebdo, seuil_cible_pct, mode_deplacement, secteur_libelle, binome_agent_id')
        .in('id', agentIds),
      admin.from('interventions')
        .select('agent_id, heure_debut_prevue, heure_fin_prevue')
        .in('agent_id', agentIds)
        .gte('date_prevue', weekStart)
        .lte('date_prevue', weekEnd)
        .neq('statut', 'annulee'),
      admin.from('conges')
        .select('agent_id, date_debut, date_fin')
        .in('agent_id', agentIds)
        .eq('valide', true)
        .lte('date_debut', weekEnd)
        .gte('date_fin', weekStart),
      admin.from('absences')
        .select('agent_id, date_debut, date_fin')
        .in('agent_id', agentIds)
        .lte('date_debut', weekEnd)
        .gte('date_fin', weekStart),
      admin.from('journees_agent')
        .select('agent_id, total_minutes_terrain, total_minutes_trajets')
        .in('agent_id', agentIds)
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .not('validee_par', 'is', null),
    ])

    const heuresNettoyage = new Map<string, number>()
    for (const i of interventionsData ?? []) {
      const cur = heuresNettoyage.get(i.agent_id) ?? 0
      heuresNettoyage.set(i.agent_id, cur + heuresDiff(i.heure_debut_prevue, i.heure_fin_prevue))
    }

    const heuresConges = new Map<string, number>()
    for (const c of congesData ?? []) {
      const cur = heuresConges.get(c.agent_id) ?? 0
      heuresConges.set(c.agent_id, cur + overlapJours(c.date_debut, c.date_fin, weekStart, weekEnd) * 7)
    }

    const heuresAbsences = new Map<string, number>()
    for (const a of absencesData ?? []) {
      const cur = heuresAbsences.get(a.agent_id) ?? 0
      heuresAbsences.set(a.agent_id, cur + overlapJours(a.date_debut, a.date_fin, weekStart, weekEnd) * 7)
    }

    const heuresRealisees = new Map<string, number>()
    for (const j of journeesData ?? []) {
      const current = heuresRealisees.get(j.agent_id) ?? 0
      heuresRealisees.set(j.agent_id,
        current + ((j.total_minutes_terrain ?? 0) + (j.total_minutes_trajets ?? 0)) / 60
      )
    }

    // Enrichir avec le nom du binôme
    const binomeIds = (profilesData ?? []).map(p => p.binome_agent_id).filter(Boolean) as string[]
    let binomeProfiles: { id: string; nom: string; prenom: string; contrat_heures_hebdo: number }[] = []
    if (binomeIds.length > 0) {
      const { data: bp } = await admin.from('profiles').select('id, nom, prenom, contrat_heures_hebdo').in('id', binomeIds)
      binomeProfiles = (bp ?? []) as typeof binomeProfiles
    }

    agents = (profilesData ?? []).map(p => {
      const nettoyage = heuresNettoyage.get(p.id) ?? 0
      const conges    = heuresConges.get(p.id) ?? 0
      const absences  = heuresAbsences.get(p.id) ?? 0
      const trajets   = Math.round(nettoyage * 0.2 * 10) / 10
      const capaciteDispo = Math.max(
        (p.contrat_heures_hebdo - conges - absences) - nettoyage - trajets, 0
      )
      const taux = p.contrat_heures_hebdo > 0
        ? Math.round((nettoyage + trajets + conges + absences) / p.contrat_heures_hebdo * 100)
        : 0
      const b = p.binome_agent_id ? binomeProfiles.find(x => x.id === p.binome_agent_id) : null

      return {
        agent_id:             p.id,
        nom_complet:          `${p.prenom} ${p.nom}`,
        capacite_theorique:   p.contrat_heures_hebdo,
        seuil_cible_pct:      p.seuil_cible_pct,
        mode_deplacement:     p.mode_deplacement,
        secteur_libelle:      p.secteur_libelle,
        heures_conges:        conges,
        heures_absences:      absences,
        heures_nettoyage:     nettoyage,
        heures_trajets_est:   trajets,
        capacite_disponible:  capaciteDispo,
        taux_remplissage_pct: taux,
        binome_nom:           b ? `${b.prenom} ${b.nom}` : null,
        binome_heures_hebdo:  b ? b.contrat_heures_hebdo : null,
        heures_realisees:     heuresRealisees.has(p.id) ? (heuresRealisees.get(p.id) ?? null) : null,
      }
    })
  }

  return (
    <ChargeClient
      agents={agents}
      managerId={user.id}
      weekLabel={weekLabel}
      isCurrentWeek={isCurrentWeek}
      prevWeekHref={prevWeekHref}
      nextWeekHref={nextWeekHref}
      currentWeekHref="/manager/charge"
    />
  )
}
