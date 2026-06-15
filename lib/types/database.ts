export type UserRole = 'employe' | 'manager'
export type InterventionStatut = 'planifiee' | 'en_cours' | 'terminee' | 'annulee'
export type TacheCategorie = 'cuisine' | 'salon' | 'chambre' | 'salle_de_bain' | 'exterieur' | 'autre'
export type AlerteType = 'probleme' | 'retard' | 'materiel' | 'client' | 'autre'
export type AlertePriorite = 'basse' | 'moyenne' | 'haute' | 'urgente'
export type ResidenceType = 'appartement' | 'maison' | 'villa' | 'autre'

export interface Profile {
  id: string
  full_name: string
  email: string
  role: UserRole
  phone: string | null
  avatar_url: string | null
  actif: boolean
  created_at: string
  updated_at: string
}

export interface Residence {
  id: string
  nom: string
  adresse: string
  code_postal: string
  ville: string
  type: ResidenceType
  superficie_m2: number | null
  etage: number | null
  code_acces: string | null
  notes: string | null
  qr_code: string | null
  actif: boolean
  manager_id: string | null
  created_at: string
  updated_at: string
}

export interface TacheTemplate {
  id: string
  residence_id: string
  titre: string
  description: string | null
  duree_estimee_min: number | null
  ordre: number
  categorie: TacheCategorie
  actif: boolean
  created_at: string
}

export interface Intervention {
  id: string
  residence_id: string
  employe_id: string
  manager_id: string | null
  statut: InterventionStatut
  date_planifiee: string
  date_debut: string | null
  date_fin: string | null
  notes_employe: string | null
  notes_manager: string | null
  signature_url: string | null
  rapport_photos: string[] | null
  created_at: string
  updated_at: string
}

export interface TacheIntervention {
  id: string
  intervention_id: string
  titre: string
  description: string | null
  categorie: TacheCategorie
  ordre: number
  completee: boolean
  completee_at: string | null
  photo_url: string | null
  commentaire: string | null
}

export interface Alerte {
  id: string
  intervention_id: string | null
  residence_id: string | null
  employe_id: string | null
  manager_id: string | null
  type: AlerteType
  titre: string
  message: string
  priorite: AlertePriorite
  lue: boolean
  resolue: boolean
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at' | 'updated_at'>; Update: Partial<Profile> }
      residences: { Row: Residence; Insert: Omit<Residence, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Residence> }
      taches_template: { Row: TacheTemplate; Insert: Omit<TacheTemplate, 'id' | 'created_at'>; Update: Partial<TacheTemplate> }
      interventions: { Row: Intervention; Insert: Omit<Intervention, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Intervention> }
      taches_intervention: { Row: TacheIntervention; Insert: Omit<TacheIntervention, 'id'>; Update: Partial<TacheIntervention> }
      alertes: { Row: Alerte; Insert: Omit<Alerte, 'id' | 'created_at'>; Update: Partial<Alerte> }
    }
  }
}
