import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

const DAY_ISO: Record<string, number> = {
  lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7,
}

/** Normalise "HH:MM:SS" → "HH:MM", null si null */
const normalizeTime = (t: string | null | undefined): string | null =>
  t ? t.substring(0, 5) : null

/** Ajoute des minutes à "HH:MM" → "HH:MM" */
function addMinutes(heure: string, minutes: number): string {
  const [h, m] = heure.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

interface Creneau {
  jours: string[]
  heure_debut: string
  heure_fin: string
  label?: string
}

/** Trouve le créneau couvrant un jour donné, ou null */
function creneauPourJour(creneaux: Creneau[], jour: string): Creneau | null {
  return creneaux.find(c => c.jours.includes(jour)) ?? null
}

// POST — génère les interventions et les insère dans la table interventions
// Body: { residenceId, dateDebut?, dateFin? }
export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { residenceId, dateDebut: bodyDebut, dateFin: bodyFin } = body
  console.log('[generer] body reçu:', { residenceId, bodyDebut, bodyFin, managerId })

  if (!residenceId)
    return NextResponse.json({ error: 'residenceId manquant' }, { status: 400 })

  const admin = await createAdminClient()

  // ── 1. Vérification ownership ────────────────────────────────────────────────
  const { data: res } = await admin.from('residences')
    .select('id, nom, agent_prefere_id')
    .eq('id', residenceId).eq('manager_id', managerId).single()
  console.log('[generer] résidence:', res ? `"${res.nom}" agent=${res.agent_prefere_id ?? 'aucun'}` : 'NON TROUVÉE')
  if (!res) return NextResponse.json({ error: 'Résidence introuvable ou non autorisée' }, { status: 403 })

  if (!res.agent_prefere_id)
    return NextResponse.json({ error: 'Aucun agent attitré pour cette résidence.' }, { status: 400 })

  // ── 2. Contrat actif ─────────────────────────────────────────────────────────
  const { data: contrat } = await admin.from('contrats_residences')
    .select('date_debut, date_fin, jours_obliges, jours_interdits, creneaux_acceptes')
    .eq('residence_id', residenceId).eq('actif', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  console.log('[generer] contrat:', contrat
    ? `${contrat.date_debut} → ${contrat.date_fin} | creneaux=${JSON.stringify(contrat.creneaux_acceptes)}`
    : 'AUCUN contrat actif')
  if (!contrat)
    return NextResponse.json({ error: 'Aucun contrat actif pour cette résidence.' }, { status: 400 })

  const creneaux: Creneau[] = contrat.creneaux_acceptes ?? []
  const joursObliges: string[]   = contrat.jours_obliges  ?? []
  const joursInterdits: string[] = contrat.jours_interdits ?? []

  // Plage de dates : paramètres body en priorité, sinon durée du contrat
  const dateDebut = bodyDebut ?? contrat.date_debut
  const dateFin   = bodyFin   ?? contrat.date_fin

  // ── 3. Tâches hebdomadaires ──────────────────────────────────────────────────
  const { data: taches, error: tachesErr } = await admin.from('taches_template')
    .select('id, libelle, jours_semaine, duree_minutes')
    .eq('residence_id', residenceId)
    .eq('frequence_type', 'hebdo')

  console.log('[generer] taches hebdo:', taches?.length ?? 0,
    tachesErr ? `ERREUR: ${tachesErr.message}` : '',
    taches?.map(t => `"${t.libelle}"[${(t.jours_semaine ?? []).join(',')}]`).join(', '))

  if (!taches?.length)
    return NextResponse.json(
      { error: 'Aucune tâche hebdomadaire configurée pour cette résidence.' },
      { status: 400 }
    )

  // ── 4. Jours actifs ──────────────────────────────────────────────────────────
  const JOURS_FR: Record<string, string> = {
    lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
    jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
  }

  const joursFromTaches = [...new Set(taches.flatMap(t => t.jours_semaine ?? []))]
  const joursBase       = joursObliges.length > 0 ? joursObliges : joursFromTaches
  const joursSkipped    = joursBase.filter(j => joursInterdits.includes(j))
  const joursActifs     = joursBase.filter(j => !joursInterdits.includes(j))

  joursSkipped.forEach(j =>
    console.log(`[generer] Jour "${j}" ignoré car interdit par le contrat`)
  )
  console.log('[generer] jours actifs:', joursActifs,
    `(source: ${joursObliges.length > 0 ? 'jours_obliges du contrat' : 'taches_template'})`)

  if (!joursActifs.length) {
    const detail = joursSkipped.length > 0
      ? `Tous les jours (${joursSkipped.map(j => JOURS_FR[j] ?? j).join(', ')}) sont interdits par le contrat. Modifiez les tâches ou les jours interdits.`
      : 'Aucun jour disponible (liste vide).'
    return NextResponse.json({ error: `Impossible de générer : ${detail}` }, { status: 400 })
  }

  const warnings: string[] = joursSkipped.map(
    j => `${JOURS_FR[j] ?? j} ignoré (jour interdit par le contrat)`
  )

  // Durée totale par jour (somme des duree_minutes des tâches actives ce jour)
  const dureePourJour = new Map<string, number>()
  for (const jour of joursActifs) {
    const duree = taches
      .filter(t => (t.jours_semaine ?? []).includes(jour))
      .reduce((sum, t) => sum + (t.duree_minutes ?? 0), 0)
    dureePourJour.set(jour, duree)
  }

  // ── 5. Génération des dates ──────────────────────────────────────────────────
  const start   = new Date(dateDebut + 'T00:00:00')
  const end     = new Date(dateFin   + 'T00:00:00')
  const current = new Date(start)

  type InterventionRow = {
    agent_id: string
    residence_id: string
    date_prevue: string
    heure_debut_prevue: string
    heure_fin_prevue: string
    statut: string
  }

  const rows: InterventionRow[] = []

  while (current <= end) {
    const dayName = DAY_NAMES[current.getDay()]
    if (joursActifs.includes(dayName)) {
      const dateStr  = current.toISOString().split('T')[0]
      const duree    = dureePourJour.get(dayName) ?? 0
      const creneau  = creneauPourJour(creneaux, dayName)
      const hDebut   = creneau ? normalizeTime(creneau.heure_debut) ?? '08:00' : '08:00'
      const hFinMax  = creneau ? normalizeTime(creneau.heure_fin)   ?? null    : null
      const hFin     = duree > 0 ? addMinutes(hDebut, duree) : (hFinMax ?? addMinutes(hDebut, 60))

      if (hFinMax && hFin > hFinMax) {
        console.warn(`[generer] ⚠️ ${dateStr} (${dayName}) : heure_fin=${hFin} > fin créneau=${hFinMax} (durée=${duree}min)`)
      }

      rows.push({
        agent_id:           res.agent_prefere_id,
        residence_id:       residenceId,
        date_prevue:        dateStr,
        heure_debut_prevue: hDebut,
        heure_fin_prevue:   hFin,
        statut:             'planifiee',
      })
    }
    current.setDate(current.getDate() + 1)
  }

  // ── 6. Filtrer les dates passées (le DELETE ne couvre que >= aujourd'hui) ────
  const today = new Date().toISOString().split('T')[0]
  const rowsFuturs = rows.filter(r => r.date_prevue >= today)

  console.log(`[generer] ${rows.length} interventions générées, ${rowsFuturs.length} futures (>= ${today})`)

  if (!rowsFuturs.length)
    return NextResponse.json(
      { error: 'Aucune intervention future générée sur la période du contrat.' },
      { status: 400 }
    )

  // ── 7. DELETE + INSERT atomique via RPC PostgreSQL ──────────────────────────
  const { data: insertedCount, error: rpcErr } = await admin.rpc('planifier_interventions', {
    p_residence_id: residenceId,
    p_lignes:       rowsFuturs,
  })
  if (rpcErr) {
    console.error('[generer] ❌ RPC planifier_interventions échoué:', rpcErr.message)
    return NextResponse.json({ error: rpcErr.message }, { status: 400 })
  }

  console.log(`[generer] ✅ ${insertedCount} interventions insérées (transaction atomique)`)

  const interventionsForUI = rowsFuturs.map(r => ({
    date:       r.date_prevue,
    dayName:    DAY_NAMES[new Date(r.date_prevue + 'T00:00:00').getDay()],
    heureDebut: r.heure_debut_prevue,
    heureFin:   r.heure_fin_prevue,
    agentId:    r.agent_id,
    agentNom:   null,
    taches:     [],
    typePrincipal: 'hebdo',
  }))

  return NextResponse.json({
    count:         insertedCount as number,
    interventions: interventionsForUI,
    agentId:       res.agent_prefere_id,
    warnings,
  })
}

export { DAY_ISO }
