import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ContratHeader from '@/components/manager/ContratHeader'
import ContratParametresPanel from './ContratParametresPanel'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string; contratId: string }>
}

function calcStatut(actif: boolean, dateDebut: string, dateFin: string, today: string): 'actif' | 'futur' | 'sommeil' | 'termine' {
  if (dateFin < today)   return 'termine'
  if (dateDebut > today) return actif ? 'futur' : 'sommeil'
  if (!actif)            return 'sommeil'
  return 'actif'
}

// Onglet « Paramètres » de la page contrat (les autres onglets sont les pages
// planning / tâches / rapports appelées avec ?contratId=, coiffées du même ContratHeader).
export default async function ContratDetailPage({ params }: Props) {
  const { id, contratId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()

  // Garde-fou ownership : la résidence appartient au manager
  const { data: res } = await admin.from('residences')
    .select('id').eq('id', id).eq('manager_id', user.id).single()
  if (!res) redirect('/manager/residences')

  // Le contrat appartient bien à cette résidence
  const { data: c } = await admin.from('contrats_residences')
    .select('id, libelle, type_contrat, date_debut, date_fin, montant_mensuel, nb_interventions_mois, taux_horaire_facturation, creneaux_acceptes, agent_prefere_id, actif, jours_ramassage_containers, dispatch_semaine')
    .eq('id', contratId).eq('residence_id', id).single()
  if (!c) redirect(`/manager/residences/${id}`)

  // Bâtiments/zones existants (lecture seule) — pour le panneau "Répartition semaine" (item 5)
  const { data: zonesContrat } = await admin.from('zones_residence')
    .select('nom, batiment').eq('contrat_id', contratId)
  const parBatiment = new Map<string, string[]>()
  for (const z of zonesContrat ?? []) {
    const nomBatiment = z.batiment?.trim() || '(mono-bâtiment)'
    const arr = parBatiment.get(nomBatiment) ?? []
    if (z.nom?.trim()) arr.push(z.nom.trim())
    parBatiment.set(nomBatiment, arr)
  }
  const batimentsContrat = [...parBatiment.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }))
    .map(([nom, zones]) => ({ nom, zones }))

  const todayStr = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  // Nombre d'interventions du contrat (pour ContratCard, utilisé par GestionContratModal)
  const { count: nbInter } = await admin.from('interventions')
    .select('id', { count: 'exact', head: true })
    .eq('contrat_id', contratId)

  // Nom de l'agent attitré
  let agentNom: string | null = null
  if (c.agent_prefere_id) {
    const { data: ag } = await admin.from('profiles')
      .select('prenom, nom').eq('id', c.agent_prefere_id).single()
    agentNom = ag ? `${ag.prenom} ${ag.nom}` : null
  }

  const statut = calcStatut(c.actif ?? false, c.date_debut, c.date_fin, todayStr)
  const creneaux = Array.isArray(c.creneaux_acceptes) ? c.creneaux_acceptes : []

  const contratCard = {
    id: c.id,
    libelle: c.libelle,
    type_contrat: c.type_contrat,
    statut_calcule: statut,
    montant_mensuel: c.montant_mensuel,
    nb_interventions_mois: c.nb_interventions_mois,
    agent_prefere_id: c.agent_prefere_id,
    nb_interventions: nbInter ?? 0,
    actif: c.actif ?? false,
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <ContratHeader residenceId={id} contratId={contratId} activeTab="parametres" />
      <ContratParametresPanel
        residenceId={id}
        contrat={contratCard}
        dateDebut={c.date_debut}
        dateFin={c.date_fin}
        tauxHoraire={c.taux_horaire_facturation}
        nbCreneaux={creneaux.length}
        agentNom={agentNom}
        creneaux={creneaux}
        joursRamassageContainers={c.jours_ramassage_containers ?? []}
        dispatchSemaine={c.dispatch_semaine ?? []}
        batimentsContrat={batimentsContrat}
      />
    </div>
  )
}
