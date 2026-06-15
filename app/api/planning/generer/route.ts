import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'

async function getManagerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'manager' ? user.id : null
}

const DAY_NAMES = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']

/** Normalise "18:00:00" → "18:00", garde null si null */
const normalizeTime = (t: string | null | undefined): string | null =>
  t ? t.substring(0, 5) : null

interface TacheRow {
  id: string
  libelle: string
  frequence_type: string
  jours_semaine: string[]
  semaine_du_mois: number[] | null
  mois_de_annee: number[] | null
  heure_debut: string | null
  heure_fin: string | null
  duree_minutes: number | null
  zone_nom: string | null
}

/** Ajoute `minutes` à une heure "HH:MM" et retourne "HH:MM" */
function addMinutes(heure: string, minutes: number): string {
  const [h, m] = heure.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function tacheAppliesOn(t: TacheRow, date: Date): boolean {
  const day = DAY_NAMES[date.getDay()]
  const month = date.getMonth() + 1
  const week  = Math.ceil(date.getDate() / 7)

  if (!(t.jours_semaine ?? []).includes(day)) return false

  switch (t.frequence_type) {
    case 'hebdo':
    case 'contrainte_horaire':
      return true
    case 'mensuel':
      return (t.semaine_du_mois ?? [1]).includes(week)
    case 'trimestriel':
    case 'semestriel':
    case 'annuel':
      return (
        (t.semaine_du_mois ?? [1]).includes(week) &&
        (t.mois_de_annee ?? []).includes(month)
      )
    default:
      return false
  }
}

// POST — génère un planning prévisionnel (sans écriture en base)
export async function POST(req: NextRequest) {
  const managerId = await getManagerId()
  if (!managerId) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { residenceId, dateDebut, dateFin } = await req.json()
  if (!residenceId || !dateDebut || !dateFin)
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const admin = await createAdminClient()

  // Ownership
  const { data: res } = await admin.from('residences')
    .select('id, nom, agent_prefere_id, duree_estimee_min')
    .eq('id', residenceId).eq('manager_id', managerId).single()
  if (!res) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  // Agent
  let agentNom: string | null = null
  if (res.agent_prefere_id) {
    const { data: agent } = await admin.from('profiles')
      .select('nom, prenom').eq('id', res.agent_prefere_id).single()
    if (agent) agentNom = `${agent.prenom} ${agent.nom}`
  }

  // Contrat actif
  const { data: contrat } = await admin.from('contrats_residences')
    .select('heure_debut_min, heure_fin_max, jours_interdits')
    .eq('residence_id', residenceId).eq('actif', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const heureDebut: string    = normalizeTime(contrat?.heure_debut_min) ?? '08:00'
  const heureFinContrat: string = normalizeTime(contrat?.heure_fin_max) ?? '12:00'
  const joursInterdits: string[] = contrat?.jours_interdits ?? []
  const dureeEstimeeFallback: number =
    (res as unknown as { duree_estimee_min?: number }).duree_estimee_min ?? 0

  // Interventions réelles déjà existantes sur la période (en_cours ou terminee)
  const { data: existingInters } = await admin.from('interventions')
    .select('agent_id, date_prevue')
    .eq('residence_id', residenceId)
    .in('statut', ['en_cours', 'terminee'])
    .gte('date_prevue', dateDebut)
    .lte('date_prevue', dateFin)

  const existingSet = new Set(
    (existingInters ?? []).map(i => `${i.agent_id ?? ''}|${i.date_prevue}`)
  )

  // Tâches template (toutes sauf sur_passage)
  const { data: rawTaches } = await admin.from('taches_template')
    .select('id, libelle, frequence_type, jours_semaine, semaine_du_mois, mois_de_annee, heure_debut, heure_fin, duree_minutes, zones_residence(nom)')
    .eq('residence_id', residenceId)
    .neq('frequence_type', 'sur_passage')
    .order('ordre')

  const taches: TacheRow[] = (rawTaches ?? []).map((t: {
    id: string; libelle: string; frequence_type: string;
    jours_semaine: string[]; semaine_du_mois: number[] | null;
    mois_de_annee: number[] | null; heure_debut: string | null; heure_fin: string | null;
    duree_minutes: number | null;
    zones_residence: { nom: string }[] | { nom: string } | null
  }) => ({
    id: t.id,
    libelle: t.libelle,
    frequence_type: t.frequence_type,
    jours_semaine: t.jours_semaine ?? [],
    semaine_du_mois: t.semaine_du_mois,
    mois_de_annee: t.mois_de_annee,
    heure_debut: normalizeTime(t.heure_debut),
    heure_fin:   normalizeTime(t.heure_fin),
    duree_minutes: t.duree_minutes ?? null,
    zone_nom: Array.isArray(t.zones_residence)
      ? (t.zones_residence[0]?.nom ?? null)
      : ((t.zones_residence as { nom: string } | null)?.nom ?? null),
  }))

  // Jours hebdo = jours définis par des tâches HEBDO uniquement (anchor days)
  const joursHebdo = new Set<string>()
  taches.forEach(t => {
    if (t.frequence_type === 'hebdo') {
      ;(t.jours_semaine ?? []).forEach(d => joursHebdo.add(d))
    }
  })

  // Jours contrainte seule = jours couverts UNIQUEMENT par des tâches contrainte_horaire
  const joursContrainteSeul = new Set<string>()
  taches.forEach(t => {
    if (t.frequence_type === 'contrainte_horaire') {
      ;(t.jours_semaine ?? []).forEach(d => { if (!joursHebdo.has(d)) joursContrainteSeul.add(d) })
    }
  })

  // Parcourir les dates
  type InterventionGenerated = {
    date: string; dayName: string
    heureDebut: string; heureFin: string
    agentId: string | null; agentNom: string | null
    taches: { id: string; libelle: string; type: string; zone: string | null }[]
    typePrincipal: string
  }

  const generated: InterventionGenerated[] = []
  const start   = new Date(dateDebut + 'T00:00:00')
  const end     = new Date(dateFin   + 'T00:00:00')
  const current = new Date(start)

  while (current <= end) {
    const dayName = DAY_NAMES[current.getDay()]
    const isHebdoDay      = joursHebdo.has(dayName)
    const isContrainteDay = joursContrainteSeul.has(dayName)

    const dateStr = current.toISOString().split('T')[0]
    const existingKey = `${res.agent_prefere_id ?? ''}|${dateStr}`

    if ((isHebdoDay || isContrainteDay) && !joursInterdits.includes(dayName) && !existingSet.has(existingKey)) {
      const matching = taches.filter(t => tacheAppliesOn(t, current))

      if (matching.length > 0) {
        const types = matching.map(t => t.frequence_type)

        // Heure de début : heures de la tâche contrainte ou heures du contrat
        let hDebutFinal: string
        let typePrincipal: string

        if (!isHebdoDay) {
          // Jour purement contrainte_horaire
          const ctTask = matching.find(t => t.frequence_type === 'contrainte_horaire' && t.heure_debut)
          hDebutFinal  = ctTask?.heure_debut ?? heureDebut
          typePrincipal = 'contrainte_horaire'
        } else {
          // Jour hebdo (ou mix)
          const hasNonCH = matching.some(t => t.frequence_type !== 'contrainte_horaire')
          hDebutFinal = hasNonCH
            ? heureDebut
            : (matching.find(t => t.heure_debut)?.heure_debut ?? heureDebut)
          typePrincipal = types.includes('hebdo')        ? 'hebdo'
            : types.includes('mensuel')      ? 'mensuel'
            : types.includes('trimestriel')  ? 'trimestriel'
            : types.includes('semestriel')   ? 'semestriel'
            : types.includes('annuel')       ? 'annuel'
            : 'contrainte_horaire'
        }

        // Heure de fin : hDebutFinal + somme des durées des tâches du jour
        const dureeTotale = matching.reduce((sum, t) => sum + (t.duree_minutes ?? 0), 0)
        let hFinFinal: string
        if (dureeTotale > 0) {
          hFinFinal = addMinutes(hDebutFinal, dureeTotale)
        } else if (dureeEstimeeFallback > 0) {
          hFinFinal = addMinutes(hDebutFinal, dureeEstimeeFallback)
        } else {
          hFinFinal = heureFinContrat
        }

        generated.push({
          date:    dateStr,
          dayName,
          heureDebut: hDebutFinal,
          heureFin:   hFinFinal,
          agentId: res.agent_prefere_id ?? null,
          agentNom,
          taches: matching.map(t => ({
            id: t.id, libelle: t.libelle, type: t.frequence_type, zone: t.zone_nom,
          })),
          typePrincipal,
        })
      }
    }

    current.setDate(current.getDate() + 1)
  }

  return NextResponse.json({ interventions: generated, agentNom })
}
