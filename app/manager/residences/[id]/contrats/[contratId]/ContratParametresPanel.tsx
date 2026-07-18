'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, CalendarDays } from 'lucide-react'
import GestionContratModal from '../../GestionContratModal'
import RepartitionSemainePanel from './RepartitionSemainePanel'
import { type DispatchJour } from '@/lib/dispatchSemaine'

interface ContratCard {
  id: string
  libelle: string | null
  type_contrat: string | null
  statut_calcule: 'actif' | 'futur' | 'sommeil' | 'termine'
  montant_mensuel: number | null
  nb_interventions_mois: number | null
  agent_prefere_id: string | null
  nb_interventions: number
  actif: boolean
}

interface Creneau {
  jours: string[]
  heure_debut: string
  heure_fin: string
}
interface BatimentInfo {
  nom: string
  zones: string[]
}

interface Props {
  residenceId: string
  contrat: ContratCard
  dateDebut: string
  dateFin: string
  tauxHoraire: number | null
  nbCreneaux: number
  agentNom: string | null
  creneaux: Creneau[]
  joursRamassageContainers: string[]
  dispatchSemaine: DispatchJour[]
  batimentsContrat: BatimentInfo[]
}

const TYPE_LABEL: Record<string, string> = {
  parties_communes: 'Parties communes',
  containers: 'Containers',
  espaces_verts: 'Espaces verts',
}

function Ligne({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
    </div>
  )
}

export default function ContratParametresPanel({
  residenceId, contrat, dateDebut, dateFin, tauxHoraire, nbCreneaux, agentNom,
  creneaux, joursRamassageContainers, dispatchSemaine, batimentsContrat,
}: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [showDispatch, setShowDispatch] = useState(false)

  const joursPassage = [...new Set(creneaux.flatMap(c => c.jours ?? []))]

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700">Paramètres du contrat</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDispatch(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#EAF2FF] text-[#1A5FA8] hover:bg-[#1A5FA8]/15 transition-colors"
            >
              <CalendarDays className="w-3.5 h-3.5" /> Répartition semaine
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#EAF2FF] text-[#1A5FA8] hover:bg-[#1A5FA8]/15 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </button>
          </div>
        </div>

        <Ligne label="Libellé" value={contrat.libelle ?? '—'} />
        <Ligne label="Type" value={contrat.type_contrat ? (TYPE_LABEL[contrat.type_contrat] ?? contrat.type_contrat) : '—'} />
        <Ligne label="Période" value={`${dateDebut} → ${dateFin}`} />
        <Ligne label="Montant mensuel" value={contrat.montant_mensuel != null ? `${contrat.montant_mensuel} €/mois` : '—'} />
        <Ligne label="Interventions / mois" value={contrat.nb_interventions_mois != null ? String(contrat.nb_interventions_mois) : '—'} />
        <Ligne label="Taux horaire facturation" value={tauxHoraire != null ? `${tauxHoraire} €/h` : 'Défaut société'} />
        <Ligne label="Créneaux acceptés" value={nbCreneaux > 0 ? `${nbCreneaux} créneau${nbCreneaux > 1 ? 'x' : ''}` : 'Aucun'} />
        <Ligne label="Agent attitré" value={agentNom ?? 'Aucun'} />
        <Ligne label="Répartition semaine" value={dispatchSemaine.length > 0 ? `${dispatchSemaine.length} jour${dispatchSemaine.length > 1 ? 's' : ''} configuré${dispatchSemaine.length > 1 ? 's' : ''}` : 'Non configurée'} />
      </div>

      {showModal && (
        <GestionContratModal
          residenceId={residenceId}
          contrat={contrat}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); router.refresh() }}
          onDeleted={() => { setShowModal(false); router.push(`/manager/residences/${residenceId}`) }}
        />
      )}

      {showDispatch && (
        <RepartitionSemainePanel
          residenceId={residenceId}
          contratId={contrat.id}
          batiments={batimentsContrat}
          joursPassage={joursPassage}
          creneaux={creneaux}
          initialJoursRamassage={joursRamassageContainers}
          initialDispatch={dispatchSemaine}
          onClose={() => setShowDispatch(false)}
        />
      )}
    </div>
  )
}
