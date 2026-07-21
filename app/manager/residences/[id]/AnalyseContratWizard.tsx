'use client'

import { useState, useEffect } from 'react'
import { heuresVenduesMois, volumeHebdoMinutes } from '@/lib/prorata'
import { type DispatchJour } from '@/lib/dispatchSemaine'
import AnalyseContratEtape2 from './AnalyseContratEtape2'
import AnalyseContratEtape3, { type StructureSoumission } from './AnalyseContratEtape3'
import AnalyseContratEtape4 from './AnalyseContratEtape4'

export type { DispatchJour }

// ── Types partagés avec AnalyseContratEtape2/AnalyseContratEtape3 (lot 1, étape 3) ──

export interface IdentiteContrat {
  libelle: string
  typeContrat: string
  dateDebut: string
  dateFin: string
  montant: string          // valeur brute du champ (comme AjoutContratModal/GestionContratModal)
  tauxMode: 'base' | 'specifique'
  tauxSpecifique: string
  tauxBase: number
}

// ── Organisation actuelle (lot 2, principe 1) — devient creneaux_acceptes ──

export interface Creneau {
  jours: string[]
  heure_debut: string
  heure_fin: string
}
export interface Agent {
  id: string
  prenom: string
  nom: string
  binome_agent_id: string | null
}

// Refonte top-down (21/07) : plus de durée estimée par tâche. Les tâches basse
// fréquence restent dans l'arbre, positionnées (semaine_du_mois / mois_de_annee),
// alignées sur les colonnes déjà existantes de taches_template.
export interface AnalyseTacheIA {
  libelle: string
  frequence_type: 'hebdo' | 'mensuel' | 'trimestriel' | 'semestriel' | 'annuel'
  jours_semaine: string[]           // hebdo : 1+ jours. Basse fréquence : exactement 1 jour positionné.
  semaine_du_mois: number[] | null  // mensuel uniquement : [1..5] (5 = dernière semaine)
  mois_de_annee: number[] | null    // trimestriel/semestriel/annuel uniquement : mois 1-12
}
export interface AnalyseZoneIA {
  nom: string
  taches: AnalyseTacheIA[]
}
export interface AnalyseBatimentIA {
  nom: string
  zones: AnalyseZoneIA[]
}
export interface CreneauProposeIA {
  jours: string[]
  heure_debut: string
  heure_fin: string
}
export interface HorsPlanningIA {
  libelle: string
  frequence: string
  note: string
}
export interface AnalyseIA {
  batiments: AnalyseBatimentIA[]
  creneaux_proposes: CreneauProposeIA[]
  jours_interdits_detectes: string[]
  hors_planning_hebdo: HorsPlanningIA[]
  alertes: string[]
  dispatch_semaine: DispatchJour[]
}

interface Props {
  residenceId: string
  contratId: string | null   // null = nouveau contrat assisté IA ; sinon = "Analyser / restructurer" un contrat existant
  onClose: () => void
}

type Step = 1 | 2 | 3 | 4

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
const JOURS_LABELS: Record<string, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer',
  jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

function toggleItem(item: string, list: string[]): string[] {
  return list.includes(item) ? list.filter(j => j !== item) : [...list, item]
}
function formatCreneau(c: Creneau): string {
  return `${c.jours.map(j => JOURS_LABELS[j] ?? j).join(', ')} · ${c.heure_debut} – ${c.heure_fin}`
}
function dureeCreneauMinutes(c: Creneau): number {
  const [h1, m1] = c.heure_debut.split(':').map(Number)
  const [h2, m2] = c.heure_fin.split(':').map(Number)
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Identité' },
  { n: 2, label: 'Analyse' },
  { n: 3, label: 'Répartition' },
  { n: 4, label: 'Validation' },
]

const today    = new Date().toISOString().split('T')[0]
const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]

function defaultIdentite(): IdentiteContrat {
  return {
    libelle: 'Contrat principal', typeContrat: 'parties_communes', dateDebut: today, dateFin: nextYear,
    montant: '', tauxMode: 'base', tauxSpecifique: '', tauxBase: 25,
  }
}

export default function AnalyseContratWizard({ residenceId, contratId, onClose }: Props) {
  const [step, setStep]                     = useState<Step>(1)
  const [maxStepReached, setMaxStepReached] = useState<Step>(1)
  const [loadingContrat, setLoadingContrat] = useState(!!contratId)
  const [loadErr, setLoadErr]               = useState<string | null>(null)
  const [identite, setIdentite]             = useState<IdentiteContrat>(defaultIdentite())
  // Taux commercial cible (item 3 — indicateur d'écart) : jamais utilisé pour la facturation
  // ni pour le calcul de l'enveloppe transmise à l'analyse IA.
  const [tauxCible, setTauxCible]           = useState<number>(30)

  // Organisation actuelle (lot 2, principe 1) — devient creneaux_acceptes.
  const [agents, setAgents]           = useState<Agent[]>([])
  const [agentId, setAgentId]         = useState('')
  const [creneaux, setCreneaux]       = useState<Creneau[]>([])
  const [showAddCreneau, setShowAddCreneau] = useState(false)
  const [newJours, setNewJours]       = useState<string[]>([])
  const [newDebut, setNewDebut]       = useState('08:00')
  const [newFin, setNewFin]           = useState('12:00')
  // Jours de ramassage containers (agglo) — chantier "Répartition semaine", optionnel.
  const [joursRamassageContainers, setJoursRamassageContainers] = useState<string[]>([])

  // État étapes 2-4, conservé au niveau du wizard pour survivre à la navigation
  // entre étapes ("Relancer l'analyse" doit garder le texte saisi).
  const [texteContrat, setTexteContrat]           = useState('')
  const [contraintesLibres, setContraintesLibres] = useState('')
  const [analyse, setAnalyse]                     = useState<AnalyseIA | null>(null)
  const [analyseVersion, setAnalyseVersion]       = useState(0) // remonte l'étape 3 à neuf à chaque nouvelle analyse
  const [structureFinale, setStructureFinale]     = useState<StructureSoumission | null>(null)
  const [dispatchFinal, setDispatchFinal]         = useState<DispatchJour[]>([])

  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => setAgents(d.agents ?? []))
      .catch(() => {/* liste vide si échec */})
  }, [])

  // Pré-remplissage lecture seule depuis un contrat existant (entrée "Analyser / restructurer").
  // Réutilise la route GET existante (GestionContratModal), qui renvoie aussi tauxCible (item 3).
  useEffect(() => {
    if (!contratId) { setLoadingContrat(false); return }
    fetch(`/api/residences/${residenceId}/contrats/${contratId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: {
        libelle: string | null; type_contrat: string | null; date_debut: string; date_fin: string
        montant_mensuel: number | null; taux_horaire_facturation: number | null; tauxBase: number; tauxCible: number
        agent_prefere_id: string | null; creneaux_acceptes: Creneau[] | null
        jours_ramassage_containers: string[] | null
      }) => {
        setIdentite({
          libelle:        d.libelle ?? '',
          typeContrat:    d.type_contrat ?? 'parties_communes',
          dateDebut:      d.date_debut,
          dateFin:        d.date_fin,
          montant:        d.montant_mensuel != null ? String(d.montant_mensuel) : '',
          tauxMode:       d.taux_horaire_facturation != null ? 'specifique' : 'base',
          tauxSpecifique: d.taux_horaire_facturation != null ? String(d.taux_horaire_facturation) : '',
          tauxBase:       d.tauxBase ?? 25,
        })
        setTauxCible(d.tauxCible ?? 30)
        setAgentId(d.agent_prefere_id ?? '')
        setCreneaux(d.creneaux_acceptes ?? [])
        setJoursRamassageContainers(d.jours_ramassage_containers ?? [])
      })
      .catch(() => setLoadErr('Impossible de charger le contrat existant.'))
      .finally(() => setLoadingContrat(false))
  }, [contratId, residenceId])

  // Nouveau contrat (pas de contratId) : le taux cible vient quand même de
  // parametres_societe, via la route manager dédiée (item 3).
  useEffect(() => {
    if (contratId) return
    fetch('/api/parametres-societe')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { tauxBase: number; tauxCible: number }) => setTauxCible(d.tauxCible ?? 30))
      .catch(() => {/* repli sur le défaut 30 déjà en state */})
  }, [contratId])

  function goTo(n: Step) {
    if (n > maxStepReached) return
    setStep(n)
  }
  function advance(n: Step) {
    setStep(n)
    setMaxStepReached(m => (n > m ? n : m))
  }

  function handleAnalyseSuccess(result: AnalyseIA) {
    setAnalyse(result)
    setAnalyseVersion(v => v + 1)
    advance(3)
  }

  function handleStructureContinue(structure: StructureSoumission, dispatch: DispatchJour[]) {
    setStructureFinale(structure)
    setDispatchFinal(dispatch)
    advance(4)
  }

  function addCreneau() {
    if (newJours.length === 0) return
    setCreneaux(prev => [...prev, { jours: [...newJours], heure_debut: newDebut, heure_fin: newFin }])
    setNewJours([])
    setNewDebut('08:00')
    setNewFin('12:00')
    setShowAddCreneau(false)
  }
  function removeCreneau(i: number) {
    setCreneaux(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Calcul enveloppe live (étape 1) — mêmes formules que lib/prorata (charge + planning) ──
  const montantNum    = parseFloat(identite.montant) || 0
  const montantSaisi  = identite.montant.trim() !== ''
  const montantOffert = montantSaisi && montantNum === 0
  const tauxEffectif  = identite.tauxMode === 'base' ? identite.tauxBase : (parseFloat(identite.tauxSpecifique) || 0)
  const heuresMois    = heuresVenduesMois(montantNum, tauxEffectif)
  const minutesHebdo  = volumeHebdoMinutes(montantNum, tauxEffectif)

  // ── Organisation actuelle : minutes hebdo réelles + plafond rentable (item 2, principe 1+2) ──
  // Le plafond utilise TOUJOURS le taux cible (jamais le taux effectif du contrat) : c'est un
  // repère de rentabilité, indépendant du prix facturé.
  // minutesHebdoReelles doit représenter la MAIN D'ŒUVRE PAYÉE (comparable au plafond
  // rentable, lui-même en heures-personne), pas la simple présence sur site : si l'agent
  // choisi est en binôme, 2 agents sont payés simultanément sur le même créneau (cf. audit
  // du 21/07 — le mirroring binôme de /api/planning/generer confirme cette même règle
  // uniformément sur toutes les interventions générées).
  const agentSelectionne    = agents.find(a => a.id === agentId)
  const estBinome           = !!agentSelectionne?.binome_agent_id
  const minutesHebdoPresence = creneaux.reduce((sum, c) => sum + dureeCreneauMinutes(c) * c.jours.length, 0)
  const minutesHebdoReelles  = estBinome ? minutesHebdoPresence * 2 : minutesHebdoPresence
  const plafondRentable     = volumeHebdoMinutes(montantNum, tauxCible)
  const ecartRentable       = minutesHebdoReelles - plafondRentable
  const ecartRentableOk     = ecartRentable <= 0

  const peutContinuerEtape1 = creneaux.length > 0 && !loadingContrat

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">

      {/* ── Header : stepper + fermer ── */}
      <div className="shrink-0 px-4 md:px-8 py-4" style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-bold text-lg">
            {contratId ? 'Analyser / restructurer le contrat' : 'Nouveau contrat — assisté IA'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors" aria-label="Fermer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => {
            const done      = s.n < step
            const active    = s.n === step
            const clickable = s.n <= maxStepReached && s.n !== step
            return (
              <div key={s.n} className="flex items-center gap-1.5 flex-1">
                <button
                  type="button"
                  onClick={() => clickable && goTo(s.n)}
                  disabled={!clickable}
                  className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    active ? 'bg-white text-[#0A2E5A]'
                    : done ? 'bg-white/20 text-white hover:bg-white/30 cursor-pointer'
                    : 'bg-white/10 text-white/50 cursor-not-allowed'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                    active ? 'bg-[#0BBFBF] text-white' : done ? 'bg-white text-[#0A2E5A]' : 'bg-white/20 text-white/70'
                  }`}>{s.n}</span>
                  <span className="truncate">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <div className="w-2 h-px bg-white/20 shrink-0" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Corps ── */}
      <div className="flex-1 overflow-y-auto">
        {loadingContrat ? (
          <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : loadErr ? (
          <div className="max-w-2xl mx-auto p-4 md:p-8">
            <p className="text-sm text-red-500">{loadErr}</p>
          </div>
        ) : step === 1 ? (
          <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Début <span className="text-red-400">*</span>
                </label>
                <input type="date" value={identite.dateDebut} onChange={e => setIdentite(f => ({ ...f, dateDebut: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Fin <span className="text-red-400">*</span>
                </label>
                <input type="date" value={identite.dateFin} onChange={e => setIdentite(f => ({ ...f, dateFin: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
              </div>
            </div>

            {/* Montant */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Montant mensuel HT (€)</label>
              <input type="number" value={identite.montant} min={0} step={0.01}
                onChange={e => setIdentite(f => ({ ...f, montant: e.target.value }))}
                placeholder="ex : 355"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
            </div>

            {/* Taux horaire */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Taux horaire facturation</label>
              <div className="flex gap-2 mb-2">
                <button type="button" onClick={() => setIdentite(f => ({ ...f, tauxMode: 'base' }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    identite.tauxMode === 'base' ? 'bg-[#1A5FA8] text-white border-[#1A5FA8]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}>
                  Base société ({identite.tauxBase} €/h)
                </button>
                <button type="button" onClick={() => setIdentite(f => ({ ...f, tauxMode: 'specifique' }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    identite.tauxMode === 'specifique' ? 'bg-[#1A5FA8] text-white border-[#1A5FA8]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}>
                  Taux spécifique
                </button>
              </div>
              {identite.tauxMode === 'specifique' && (
                <input type="number" value={identite.tauxSpecifique} min={0} step={0.5}
                  onChange={e => setIdentite(f => ({ ...f, tauxSpecifique: e.target.value }))}
                  placeholder={`ex : ${identite.tauxBase}`}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
              )}
            </div>

            {/* Enveloppe temps vendue — calcul live, mêmes formules que lib/prorata */}
            {montantOffert ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-800 font-medium">Contrat offert — l&apos;analyse calculera la perte cachée.</p>
              </div>
            ) : montantSaisi && tauxEffectif > 0 ? (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1.5">Enveloppe temps vendue</p>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-xl font-bold text-blue-700">{heuresMois.toFixed(1)} h</span>
                  <span className="text-sm text-blue-500">/ mois</span>
                  <span className="text-blue-300 mx-1">·</span>
                  <span className="text-xl font-bold text-blue-700">{Math.round(minutesHebdo)} min</span>
                  <span className="text-sm text-blue-500">/ semaine</span>
                </div>
              </div>
            ) : null}

            {/* ── Organisation actuelle (principe 1) — devient creneaux_acceptes ── */}
            <div className="pt-2 border-t border-slate-100 space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Organisation actuelle</h3>

              {/* Agent attitré */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Agent attitré <span className="text-slate-400 font-normal normal-case">(optionnel — à affecter plus tard si besoin)</span>
                </label>
                <select value={agentId} onChange={e => setAgentId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40">
                  <option value="">— Choisir un agent —</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                </select>
              </div>

              {/* Créneaux de passage actuels */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Jours et horaires de passage actuels <span className="text-red-400">*</span>
                </label>
                {creneaux.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {creneaux.map((c, i) => (
                      <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                        <span className="text-xs text-slate-700">{formatCreneau(c)}</span>
                        <button type="button" onClick={() => removeCreneau(i)}
                          className="text-slate-400 hover:text-red-500 transition-colors ml-2">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {!showAddCreneau ? (
                  <button type="button" onClick={() => setShowAddCreneau(true)}
                    className="w-full border border-dashed border-slate-300 rounded-xl py-2 text-xs text-slate-500 hover:text-[#1A5FA8] hover:border-[#1A5FA8] transition-colors">
                    + Ajouter un créneau {creneaux.length > 0 ? '(si jours différents)' : ''}
                  </button>
                ) : (
                  <div className="border border-slate-200 rounded-xl p-3 space-y-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1.5">Jours</p>
                      <div className="flex flex-wrap gap-1.5">
                        {JOURS.map(j => (
                          <button key={j} type="button" onClick={() => setNewJours(prev => toggleItem(j, prev))}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                              newJours.includes(j) ? 'bg-[#1A5FA8] text-white border-[#1A5FA8]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                            }`}>
                            {JOURS_LABELS[j]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Début</p>
                        <input type="time" value={newDebut} onChange={e => setNewDebut(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"/>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Fin</p>
                        <input type="time" value={newFin} onChange={e => setNewFin(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"/>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowAddCreneau(false)}
                        className="flex-1 border border-slate-200 rounded-xl py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
                        Annuler
                      </button>
                      <button type="button" onClick={addCreneau} disabled={newJours.length === 0}
                        className="flex-1 bg-[#1A5FA8] text-white rounded-xl py-1.5 text-xs font-semibold hover:bg-[#0A4A8A] transition-colors disabled:opacity-40">
                        Ajouter
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bloc indicateur permanent — plafond rentable (principe 2) */}
              {creneaux.length > 0 && (
                <div className={`rounded-xl px-4 py-3 border ${ecartRentableOk ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                  {estBinome && (
                    <p className="text-xs text-slate-500 mb-1.5">
                      {Math.round(minutesHebdoPresence)} min/sem (créneau) × 2 agents (binôme) = <span className="font-semibold">{Math.round(minutesHebdoReelles)} min/sem</span> de main d&apos;œuvre
                    </p>
                  )}
                  <div className={`text-sm font-medium ${ecartRentableOk ? 'text-green-800' : 'text-amber-800'}`}>
                    Actuel <span className="font-bold">{Math.round(minutesHebdoReelles)} min/sem</span>
                    {' '}({(minutesHebdoReelles / 60).toFixed(1)} h/sem)
                    {' '}— Plafond rentable ({tauxCible} €/h) <span className="font-bold">{Math.round(plafondRentable)} min/sem</span>
                    {' '}— Écart {ecartRentable >= 0 ? '+' : ''}{Math.round(ecartRentable)} min
                  </div>
                </div>
              )}

              {/* Jours de ramassage containers (agglo) — chantier "Répartition semaine" */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Jours de ramassage containers (agglo) — laisser vide si non concerné
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {JOURS.map(j => (
                    <button key={j} type="button"
                      onClick={() => setJoursRamassageContainers(prev => toggleItem(j, prev))}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        joursRamassageContainers.includes(j) ? 'bg-[#0A2E5A] text-white border-[#0A2E5A]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}>
                      {JOURS_LABELS[j]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose}
                className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Annuler
              </button>
              <button type="button" onClick={() => peutContinuerEtape1 && advance(2)} disabled={!peutContinuerEtape1}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
                Continuer → Analyse
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          <AnalyseContratEtape2
            residenceId={residenceId}
            identite={identite}
            planningActuel={{ creneaux, minutesHebdoReelles }}
            joursRamassageContainers={joursRamassageContainers}
            texteContrat={texteContrat}
            onTexteChange={setTexteContrat}
            contraintesLibres={contraintesLibres}
            onContraintesChange={setContraintesLibres}
            onSuccess={handleAnalyseSuccess}
          />
        ) : step === 3 && analyse ? (
          <AnalyseContratEtape3
            key={analyseVersion}
            analyse={analyse}
            joursOrganisationActuelle={[...new Set(creneaux.flatMap(c => c.jours))]}
            creneaux={creneaux}
            joursRamassageContainers={joursRamassageContainers}
            minutesHebdoReelles={minutesHebdoReelles}
            plafondRentable={plafondRentable}
            ecartRentable={ecartRentable}
            tauxCible={tauxCible}
            facteurRessource={estBinome ? 2 : 1}
            onBack={() => advance(2)}
            onContinue={handleStructureContinue}
          />
        ) : step === 4 && !contratId && structureFinale ? (
          <AnalyseContratEtape4
            residenceId={residenceId}
            identite={identite}
            agentId={agentId}
            agentNom={(() => { const a = agents.find(a => a.id === agentId); return a ? `${a.prenom} ${a.nom}` : '' })()}
            creneaux={creneaux}
            joursRamassageContainers={joursRamassageContainers}
            minutesHebdoReelles={minutesHebdoReelles}
            plafondRentable={plafondRentable}
            ecartRentable={ecartRentable}
            structure={structureFinale}
            dispatchSemaine={dispatchFinal}
            horsPlanningHebdo={analyse?.hors_planning_hebdo ?? []}
            alertes={analyse?.alertes ?? []}
            onBack={() => advance(3)}
            onClose={onClose}
          />
        ) : step === 4 ? (
          <div className="max-w-lg mx-auto p-8 text-center space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Validation</h3>
            <p className="text-sm text-slate-500">Bientôt disponible — lot 3 (restructuration d&apos;un contrat existant).</p>
            <button disabled className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white opacity-40 cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
              Créer le contrat
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
