'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { IdentiteContrat, Creneau, HorsPlanningIA } from './AnalyseContratWizard'
import type { StructureSoumission } from './AnalyseContratEtape3'
import { ORDRE_JOURS, type DispatchJour } from '@/lib/dispatchSemaine'

const JOURS_LABELS: Record<string, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer',
  jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}
const VALID_TYPES: Record<string, string> = {
  parties_communes: 'Parties communes', containers: 'Containers', espaces_verts: 'Espaces verts',
}

function formatCreneau(c: Creneau): string {
  return `${c.jours.map(j => JOURS_LABELS[j] ?? j).join(', ')} · ${c.heure_debut} – ${c.heure_fin}`
}

interface Props {
  residenceId: string
  identite: IdentiteContrat
  agentId: string
  agentNom: string
  binomeAgentNom?: string  // binôme indissociable de l'agent choisi (affichage seul, cf CONTEXT.md)
  creneaux: Creneau[]
  minutesHebdoReelles: number
  plafondRentable: number
  ecartRentable: number
  structure: StructureSoumission
  horsPlanningHebdo: HorsPlanningIA[]
  alertes: string[]
  joursRamassageContainers: string[]
  dispatchSemaine: DispatchJour[]
  onBack: () => void
  onClose: () => void
}

interface CreationResult {
  contratId: string
  nbZones: number
  nbTaches: number
}

export default function AnalyseContratEtape4({
  residenceId, identite, agentId, agentNom, binomeAgentNom, creneaux, minutesHebdoReelles, plafondRentable, ecartRentable,
  structure, horsPlanningHebdo, alertes, joursRamassageContainers, dispatchSemaine, onBack, onClose,
}: Props) {
  const router = useRouter()
  const [creating, setCreating]   = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [result, setResult]       = useState<CreationResult | null>(null)

  const [generating, setGenerating]   = useState(false)
  const [generateMsg, setGenerateMsg] = useState<string | null>(null)
  const [generateErr, setGenerateErr] = useState<string | null>(null)

  const nbBatiments = structure.batiments.length
  const nbZones     = structure.batiments.reduce((s, b) => s + b.zones.length, 0)
  const ecartOk      = ecartRentable <= 0

  const tauxEffectifLabel = identite.tauxMode === 'specifique' && identite.tauxSpecifique
    ? `${identite.tauxSpecifique} €/h (spécifique)`
    : `${identite.tauxBase} €/h (base société)`

  async function handleCreer() {
    setCreating(true)
    setCreateErr(null)
    try {
      const montantNum = parseFloat(identite.montant)
      const res = await fetch(`/api/residences/${residenceId}/contrats/creer-complet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identite: {
            libelle:         identite.libelle,
            type_contrat:    identite.typeContrat,
            date_debut:      identite.dateDebut,
            date_fin:        identite.dateFin,
            montant_mensuel: Number.isFinite(montantNum) ? montantNum : null,
            taux_mode:       identite.tauxMode,
            taux_specifique: identite.tauxSpecifique ? parseFloat(identite.tauxSpecifique) : null,
            taux_base:       identite.tauxBase,
          },
          agent_prefere_id:      agentId,
          creneaux_acceptes:     creneaux,
          minutes_hebdo_reelles: minutesHebdoReelles,
          structure,
          jours_ramassage_containers: joursRamassageContainers.length > 0 ? joursRamassageContainers : undefined,
          dispatch_semaine:           dispatchSemaine.length > 0 ? dispatchSemaine : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setCreateErr(json.error ?? 'Erreur inconnue.'); setCreating(false); return }
      setResult({ contratId: json.contrat_id, nbZones: json.nb_zones, nbTaches: json.nb_taches })
    } catch {
      setCreateErr('Impossible de contacter le serveur.')
    } finally {
      setCreating(false)
    }
  }

  async function handleGenererPlanning() {
    if (!result) return
    setGenerating(true)
    setGenerateErr(null)
    setGenerateMsg(null)
    try {
      const res = await fetch('/api/planning/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceId, contratId: result.contratId }),
      })
      const json = await res.json()
      if (!res.ok) { setGenerateErr(json.error ?? 'Erreur inconnue.'); setGenerating(false); return }
      setGenerateMsg(`${json.count} intervention${json.count !== 1 ? 's' : ''} générée${json.count !== 1 ? 's' : ''}.`)
    } catch {
      setGenerateErr('Impossible de contacter le serveur.')
    } finally {
      setGenerating(false)
    }
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center space-y-1.5">
          <p className="text-green-800 font-bold text-lg">✓ Contrat créé</p>
          <p className="text-sm text-green-700">{result.nbZones} zone{result.nbZones !== 1 ? 's' : ''}, {result.nbTaches} tâche{result.nbTaches !== 1 ? 's' : ''}</p>
        </div>

        {generateMsg && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800 text-center">{generateMsg}</div>
        )}
        {generateErr && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 text-center">{generateErr}</div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={handleGenererPlanning} disabled={generating || !!generateMsg}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            {generating ? 'Génération…' : generateMsg ? '✓ Planning généré' : 'Générer le planning'}
          </button>
          <button type="button" onClick={() => router.push(`/manager/residences/${residenceId}/contrats/${result.contratId}`)}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Voir la fiche contrat
          </button>
        </div>
        <button type="button" onClick={onClose}
          className="w-full text-center text-xs text-slate-400 hover:text-slate-600 transition-colors">
          Fermer
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">

      {/* Identité */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Identité</p>
        <p className="text-sm text-slate-700"><span className="font-semibold">{identite.libelle}</span> — {VALID_TYPES[identite.typeContrat] ?? identite.typeContrat}</p>
        <p className="text-xs text-slate-500">{identite.dateDebut} → {identite.dateFin} · {identite.montant || '0'} €/mois · {tauxEffectifLabel}</p>
      </div>

      {/* Organisation actuelle */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Organisation actuelle</p>
        <p className="text-sm text-slate-700">
          {binomeAgentNom ? 'Agents' : 'Agent'} : <span className="font-semibold">
            {agentNom || '—'}{binomeAgentNom ? ` + ${binomeAgentNom} (binôme)` : ''}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {creneaux.map((c, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{formatCreneau(c)}</span>
          ))}
        </div>
      </div>

      {/* Écart rentable */}
      <div className={`rounded-2xl p-4 border ${ecartOk ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <p className={`text-sm font-medium ${ecartOk ? 'text-green-800' : 'text-amber-800'}`}>
          Actuel <span className="font-bold">{Math.round(minutesHebdoReelles)} min/sem</span>
          {' '}— Plafond rentable <span className="font-bold">{Math.round(plafondRentable)} min/sem</span>
          {' '}— Écart {ecartRentable >= 0 ? '+' : ''}{Math.round(ecartRentable)} min
        </p>
        {!ecartOk && (
          <p className="text-xs text-amber-700 mt-1.5">
            Cette organisation dépasse le plafond rentable de {Math.round(ecartRentable)} min/sem
            {' '}({(ecartRentable / 60).toFixed(1)} h/sem). C&apos;est l&apos;organisation actuelle documentée — pas une erreur bloquante.
          </p>
        )}
      </div>

      {/* Structure */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Structure</p>
        <p className="text-sm text-slate-700">{nbBatiments} bâtiment{nbBatiments !== 1 ? 's' : ''}, {nbZones} zone{nbZones !== 1 ? 's' : ''}</p>
      </div>

      {/* Répartition semaine */}
      {dispatchSemaine.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Répartition de la semaine</p>
          {[...dispatchSemaine].sort((a, b) => ORDRE_JOURS.indexOf(a.jour) - ORDRE_JOURS.indexOf(b.jour)).map(j => (
            <p key={j.jour} className="text-sm text-slate-700">
              <span className="font-semibold">{JOURS_LABELS[j.jour] ?? j.jour}</span> :{' '}
              {j.batiments_complets.join(', ') || '—'}
              {j.tournees_transverses.length > 0 && ` + ${j.tournees_transverses.map(t => t.libelle).join(', ')}`}
              {j.containers && ` · containers ${j.containers}`}
            </p>
          ))}
        </div>
      )}

      {/* Hors planning hebdo */}
      {horsPlanningHebdo.length > 0 && (
        <div className="border border-orange-200 bg-orange-50 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider">Hors planning hebdo</p>
          {horsPlanningHebdo.map((h, i) => (
            <p key={i} className="text-sm text-slate-700"><span className="font-medium">{h.libelle}</span> ({h.frequence})</p>
          ))}
        </div>
      )}

      {/* Alertes */}
      {alertes.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Alertes</p>
          {alertes.map((a, i) => <p key={i} className="text-sm text-amber-800">⚠ {a}</p>)}
        </div>
      )}

      {createErr && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-3">
          <span>{createErr}</span>
          <button type="button" onClick={handleCreer}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
            Réessayer
          </button>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onBack} disabled={creating}
          className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
          Retour
        </button>
        <button type="button" onClick={handleCreer} disabled={creating}
          className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
          style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
          {creating ? 'Création…' : 'Créer le contrat complet'}
        </button>
      </div>
    </div>
  )
}
