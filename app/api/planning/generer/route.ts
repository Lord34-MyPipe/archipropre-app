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

interface TacheRow {
  id: string
  libelle: string
  frequence_type: string
  jours_semaine: string[]
  semaine_du_mois: number[] | null
  mois_de_annee: number[] | null
  heure_debut: string | null
  zone_nom: string | null
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
      return false // 'sur_passage' ignoré
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

  const heureDebut     = contrat?.heure_debut_min ?? '08:00'
  const joursInterdits: string[] = contrat?.jours_interdits ?? []

  // Calcul heure_fin depuis duree_estimee_min si disponible, sinon depuis le contrat
  const dureeMin = (res as unknown as { duree_estimee_min?: number }).duree_estimee_min ?? 0
  let heureFin = contrat?.heure_fin_max ?? '12:00'
  if (dureeMin > 0) {
    const [h, m] = heureDebut.split(':').map(Number)
    const totalMin = h * 60 + m + dureeMin
    heureFin = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
  }

  // Tâches template (toutes sauf sur_passage)
  const { data: rawTaches } = await admin.from('taches_template')
    .select('id, libelle, frequence_type, jours_semaine, semaine_du_mois, mois_de_annee, heure_debut, zones_residence(nom)')
    .eq('residence_id', residenceId)
    .neq('frequence_type', 'sur_passage')
    .order('ordre')

  const taches: TacheRow[] = (rawTaches ?? []).map((t: {
    id: string; libelle: string; frequence_type: string;
    jours_semaine: string[]; semaine_du_mois: number[] | null;
    mois_de_annee: number[] | null; heure_debut: string | null;
    zones_residence: { nom: string }[] | { nom: string } | null
  }) => ({
    id: t.id,
    libelle: t.libelle,
    frequence_type: t.frequence_type,
    jours_semaine: t.jours_semaine ?? [],
    semaine_du_mois: t.semaine_du_mois,
    mois_de_annee: t.mois_de_annee,
    heure_debut: t.heure_debut,
    zone_nom: Array.isArray(t.zones_residence)
      ? (t.zones_residence[0]?.nom ?? null)
      : ((t.zones_residence as { nom: string } | null)?.nom ?? null),
  }))

  // Jours actifs = union des jours des tâches hebdo / contrainte_horaire
  // (les tâches mensuelles/trim. etc. ne créent PAS leur propre jour, elles se greffent sur les jours hebdo)
  const joursHebdo = new Set<string>()
  taches.forEach(t => {
    if (t.frequence_type === 'hebdo' || t.frequence_type === 'contrainte_horaire') {
      ;(t.jours_semaine ?? []).forEach(d => joursHebdo.add(d))
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

    // Intervention uniquement les jours couverts par des tâches hebdo (pas tous les jours)
    if (joursHebdo.has(dayName) && !joursInterdits.includes(dayName)) {
      const matching = taches.filter(t => tacheAppliesOn(t, current))

      if (matching.length > 0) {
        const types = matching.map(t => t.frequence_type)
        const typePrincipal = types.includes('hebdo')       ? 'hebdo'
          : types.includes('mensuel')     ? 'mensuel'
          : types.includes('trimestriel') ? 'trimestriel'
          : types.includes('semestriel')  ? 'semestriel'
          : types.includes('annuel')      ? 'annuel'
          : 'contrainte_horaire'

        // Heure de début : si contrainte_horaire uniquement, prendre l'heure de la tâche
        const hDebutFinal = matching.some(t => t.frequence_type !== 'contrainte_horaire')
          ? heureDebut
          : (matching.find(t => t.heure_debut)?.heure_debut ?? heureDebut)

        generated.push({
          date:    current.toISOString().split('T')[0],
          dayName,
          heureDebut: hDebutFinal,
          heureFin,
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
