export type Role = 'agent' | 'manager' | 'directeur'
export type InterventionStatut = 'planifiee' | 'en_cours' | 'terminee' | 'non_demarree' | 'disponible'
export type FrequenceType = 'hebdo' | 'jours_specifiques' | 'mensuel' | 'trimestriel' | 'semestriel' | 'annuel' | 'sur_passage' | 'contrainte_horaire'
export type TypeClient = 'syndic' | 'profession_liberale' | 'societe' | 'magasin' | 'particulier'

export interface Profile {
  id: string
  nom: string
  prenom: string
  email: string
  role: Role
  vehicule: boolean
  telephone: string | null
  manager_id: string | null
  zones_geo: string[]
  competences: string[]
  contrat_heures_hebdo: number
  residences_attitrees: string[]
  residences_exclues: string[]
  disponibilites: Record<string, unknown>
  adresse_domicile: string | null
  actif: boolean
  created_at: string
}

export interface Residence {
  id: string
  nom: string
  adresse: string
  lat: number | null
  lng: number | null
  qr_code_token: string
  type_client: TypeClient | null
  client_exigeant: boolean
  agent_prefere_id: string | null
  agent_exclu_ids: string[]
  vehicule_requis: boolean
  competences_requises: string[]
  manager_id: string | null
  actif: boolean
  created_at: string
}

export interface ZoneResidence {
  id: string
  residence_id: string
  nom: string
  ordre: number
  couleur: string | null
  created_at: string
}

export interface TacheTemplate {
  id: string
  residence_id: string
  zone_id: string | null
  libelle: string
  ordre: number
  jours_semaine: string[]
  frequence_type: FrequenceType
  frequence_valeur: number
  heure_debut: string | null
  heure_fin: string | null
  contrainte_externe: string | null
  tache_liee_id: string | null
  semaine_du_mois: number[] | null
  mois_de_annee: number[] | null
  duree_minutes: number
  created_at: string
}

export interface ContratResidence {
  id: string
  residence_id: string
  type_client: string | null
  date_debut: string
  date_fin: string
  montant_mensuel: number | null
  nb_interventions_mois: number
  jours_obliges: string[]
  jours_interdits: string[]
  heure_debut_min: string | null
  heure_fin_max: string | null
  notes_specifiques: string | null
  actif: boolean
  created_at: string
}

export interface Planning {
  id: string
  semaine: string
  statut: 'brouillon' | 'publie'
  manager_id: string | null
  created_at: string
}

export interface InterventionPlanifiee {
  id: string
  planning_id: string
  residence_id: string | null
  agent_id: string | null
  date: string
  heure_debut: string | null
  heure_fin: string | null
  recurrence: 'hebdo' | 'bihebdo' | 'mensuelle' | 'ponctuelle'
  created_at: string
}

export interface Intervention {
  id: string
  agent_id: string
  residence_id: string
  date_prevue: string
  heure_debut_prevue: string | null
  heure_fin_prevue: string | null
  heure_scan: string | null
  heure_fin: string | null
  statut: InterventionStatut
  geoloc_lat: number | null
  geoloc_lng: number | null
  disponible_apres_fin: boolean
  created_at: string
}

export interface TacheIntervention {
  id: string
  intervention_id: string
  tache_template_id: string | null
  libelle: string
  zone_nom: string | null
  validee: boolean
  photo_url: string | null
  heure_validation: string | null
  created_at: string
}

export interface Alerte {
  id: string
  intervention_id: string | null
  type: string
  message: string | null
  envoyee_at: string
  lue: boolean
  destinataire_id: string | null
}

export type AbsenceType = 'maladie' | 'absence_justifiee' | 'absence_injustifiee' | 'jour_ferie' | 'formation'
export type CongeStatut = 'en_attente' | 'valide' | 'refuse'

export interface Absence {
  id: string
  agent_id: string | null
  date_debut: string
  date_fin: string
  motif: string | null
  type: AbsenceType
  valide: boolean
  created_at: string
}

export interface Conge {
  id: string
  agent_id: string | null
  date_debut: string
  date_fin: string
  valide: boolean
  valide_par: string | null
  statut: CongeStatut
  motif: string | null
  created_at: string
}

export interface Tournee {
  id: string
  agent_id: string | null
  date: string
  statut: string
  distance_totale_km: number | null
  duree_trajet_totale_min: number | null
  created_at: string
}

export interface TourneeEtape {
  id: string
  tournee_id: string
  intervention_id: string | null
  ordre: number
  heure_arrivee_estimee: string | null
  temps_trajet_min: number | null
}
