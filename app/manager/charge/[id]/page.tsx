export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AgentDetailClient from './AgentDetailClient'

// ── Types exportés pour le client ─────────────────────────────────────────────

export interface AgentDetailData {
  id: string
  nom_complet: string
  mode_deplacement: string | null
  secteur_libelle: string | null
  contrat_heures_hebdo: number
  seuil_cible_pct: number
  binome_agent_id: string | null
  binome_nom: string | null
  heures_prog: number
  heures_sup: number
  taux: number
  dispo: number
}

export interface AgentIntervention {
  id: string
  residence_nom: string
  date_prevue: string
  jour_semaine: string
  heure_debut: string
  heure_fin: string
  duree_minutes: number
  taches: string[]
  est_binome: boolean
  statut: string
}

export interface CongeItem {
  id: string
  date_debut: string
  date_fin: string
  valide: boolean
}

export interface AbsenceItem {
  id: string
  date_debut: string
  date_fin: string
  motif: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonday(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const r = new Date(d)
  r.setDate(d.getDate() + diff)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(d.getDate() + n)
  return r
}

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? fallback : d
}

function overlapDays(dateDebut: string, dateFin: string, weekStart: string, weekEnd: string): number {
  const s = Math.max(
    new Date(dateDebut + 'T00:00:00').getTime(),
    new Date(weekStart + 'T00:00:00').getTime()
  )
  const e = Math.min(
    new Date(dateFin + 'T00:00:00').getTime(),
    new Date(weekEnd + 'T00:00:00').getTime()
  )
  if (e < s) return 0
  return Math.round((e - s) / 86400000) + 1
}

const DAY_NAMES_FR: Record<number, string> = {
  0: 'Dimanche', 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi',
  4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: managerProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (managerProfile?.role !== 'manager') redirect('/login')

  const { id: agentId } = await params
  const { date: dateParam } = await searchParams

  const admin = await createAdminClient()

  // ── Profil de l'agent (vérification d'appartenance au manager) ──────────────
  const { data: agentProfile } = await admin
    .from('profiles')
    .select('id, nom, prenom, binome_agent_id, facteur_binome, mode_deplacement, secteur_libelle, contrat_heures_hebdo, seuil_cible_pct, manager_id')
    .eq('id', agentId)
    .single()

  if (!agentProfile || agentProfile.manager_id !== user.id) redirect('/manager/charge')

  // ── Dates de la semaine affichée ─────────────────────────────────────────────
  const monday = getMonday(parseDate(dateParam, new Date()))
  const sunday = addDays(monday, 6)
  const mondayStr = toStr(monday)
  const sundayStr = toStr(sunday)
  const todayStr  = toStr(new Date())

  const contrat = agentProfile.contrat_heures_hebdo ?? 35

  // ── Récupérations parallèles ─────────────────────────────────────────────────
  const [binomeRes, interventionsRes, binomeInterventionsRes, congesRes, absencesRes] = await Promise.all([
    agentProfile.binome_agent_id
      ? admin.from('profiles').select('id, nom, prenom').eq('id', agentProfile.binome_agent_id).single()
      : Promise.resolve({ data: null }),

    admin.from('interventions')
      .select('id, residence_id, date_prevue, heure_debut_prevue, heure_fin_prevue, statut, residences(nom), taches_intervention(libelle)')
      .eq('agent_id', agentId)
      .gte('date_prevue', mondayStr)
      .lte('date_prevue', sundayStr)
      .neq('statut', 'annulee')
      .order('date_prevue')
      .order('heure_debut_prevue'),

    // Interventions du binôme pour la même semaine (détection des interventions miroir)
    agentProfile.binome_agent_id
      ? admin.from('interventions')
          .select('residence_id, date_prevue, heure_debut_prevue')
          .eq('agent_id', agentProfile.binome_agent_id)
          .gte('date_prevue', mondayStr)
          .lte('date_prevue', sundayStr)
          .neq('statut', 'annulee')
      : Promise.resolve({ data: [] }),

    admin.from('conges')
      .select('id, date_debut, date_fin, valide')
      .eq('agent_id', agentId)
      .gte('date_fin', todayStr)
      .order('date_debut'),

    admin.from('absences')
      .select('id, date_debut, date_fin, motif')
      .eq('agent_id', agentId)
      .gte('date_fin', todayStr)
      .order('date_debut'),
  ])

  const binomeProfile = binomeRes.data as { id: string; nom: string; prenom: string } | null
  const binomNom = binomeProfile ? `${binomeProfile.prenom} ${binomeProfile.nom}` : null

  // Index des interventions miroir du binôme : "residence_id|date|heure_debut"
  const binomeMirrorSet = new Set(
    (binomeInterventionsRes.data ?? []).map(
      (b: { residence_id: string; date_prevue: string; heure_debut_prevue: string }) =>
        `${b.residence_id}|${b.date_prevue}|${b.heure_debut_prevue}`
    )
  )

  // ── Construction des interventions ───────────────────────────────────────────
  const interventions: AgentIntervention[] = (interventionsRes.data ?? []).map(i => {
    const res = (i.residences as unknown as { nom: string } | null)
    const taches = (i.taches_intervention as unknown as { libelle: string }[] | null) ?? []

    const heureDebut = (i.heure_debut_prevue ?? '').substring(0, 5)
    const heureFin   = (i.heure_fin_prevue   ?? '').substring(0, 5)
    const [dh, dm] = heureDebut.split(':').map(Number)
    const [fh, fm] = heureFin.split(':').map(Number)
    const dureeMin = (fh * 60 + fm) - (dh * 60 + dm)

    const d = new Date(i.date_prevue + 'T00:00:00')
    const mirrorKey = `${i.residence_id}|${i.date_prevue}|${i.heure_debut_prevue}`

    return {
      id:           i.id,
      residence_nom: res?.nom ?? 'Résidence inconnue',
      date_prevue:   i.date_prevue,
      jour_semaine:  DAY_NAMES_FR[d.getDay()] ?? '',
      heure_debut:   heureDebut,
      heure_fin:     heureFin,
      duree_minutes: Math.max(0, dureeMin),
      taches:        taches.map(t => t.libelle),
      est_binome:    binomeMirrorSet.has(mirrorKey),
      statut:        i.statut ?? 'planifiee',
    }
  })

  // ── Calcul de la charge pour la semaine affichée ──────────────────────────────
  // heures interventions (en heures)
  const heuresInterventions = interventions.reduce((s, i) => s + i.duree_minutes / 60, 0)

  // Heures indispo (congés + absences) qui chevauchent la semaine
  const dailyRate = contrat / 5
  const heuresCongesSemaine = (congesRes.data ?? []).reduce((s, c) => {
    return s + overlapDays(c.date_debut, c.date_fin, mondayStr, sundayStr) * dailyRate
  }, 0)
  const heuresAbsencesSemaine = (absencesRes.data ?? []).reduce((s, a) => {
    return s + overlapDays(a.date_debut, a.date_fin, mondayStr, sundayStr) * dailyRate
  }, 0)

  const heuresProg = Math.round(heuresInterventions + heuresCongesSemaine + heuresAbsencesSemaine)
  const heuresSup  = Math.max(0, heuresProg - contrat)
  const taux       = contrat > 0 ? Math.round((heuresProg / contrat) * 100) : 0
  const dispo      = Math.max(0, contrat - heuresProg)

  const agent: AgentDetailData = {
    id:                agentId,
    nom_complet:       `${agentProfile.prenom} ${agentProfile.nom}`,
    mode_deplacement:  agentProfile.mode_deplacement,
    secteur_libelle:   agentProfile.secteur_libelle,
    contrat_heures_hebdo: contrat,
    seuil_cible_pct:   agentProfile.seuil_cible_pct ?? 80,
    binome_agent_id:   agentProfile.binome_agent_id,
    binome_nom:        binomNom,
    heures_prog:       heuresProg,
    heures_sup:        heuresSup,
    taux,
    dispo,
  }

  return (
    <AgentDetailClient
      agent={agent}
      interventions={interventions}
      conges={(congesRes.data ?? []) as CongeItem[]}
      absences={(absencesRes.data ?? []) as AbsenceItem[]}
      mondayStr={mondayStr}
      sundayStr={sundayStr}
      agentId={agentId}
    />
  )
}
