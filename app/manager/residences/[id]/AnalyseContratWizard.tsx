'use client'

import { useState, useEffect } from 'react'
import { heuresVenduesMois, volumeHebdoMinutes } from '@/lib/prorata'

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

export interface AnalyseTacheIA {
  libelle: string
  frequence: 'hebdo' | 'mensuel' | 'trimestriel' | 'semestriel' | 'annuel'
  jours_proposes: string[]
  duree_minutes_estimee: number
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
export interface RepartitionJourIA {
  jour: string
  duree_totale_minutes: number
  batiments: string[]
  resume: string
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
  repartition_hebdo: RepartitionJourIA[]
  totaux: { minutes_hebdo_estimees: number; minutes_hebdo_vendues: number; verdict: 'ok' | 'depassement' | 'marge_confortable' }
  hors_planning_hebdo: HorsPlanningIA[]
  alertes: string[]
}

interface Props {
  residenceId: string
  contratId: string | null   // null = nouveau contrat assisté IA ; sinon = "Analyser / restructurer" un contrat existant
  onClose: () => void
}

type Step = 1 | 2 | 3 | 4

const VALID_TYPES = [
  { value: 'parties_communes', label: 'Parties communes' },
  { value: 'containers',       label: 'Containers' },
  { value: 'espaces_verts',    label: 'Espaces verts' },
]

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
    libelle: '', typeContrat: 'parties_communes', dateDebut: today, dateFin: nextYear,
    montant: '', tauxMode: 'base', tauxSpecifique: '', tauxBase: 25,
  }
}

export default function AnalyseContratWizard({ residenceId, contratId, onClose }: Props) {
  const [step, setStep]                     = useState<Step>(1)
  const [maxStepReached, setMaxStepReached] = useState<Step>(1)
  const [loadingContrat, setLoadingContrat] = useState(!!contratId)
  const [loadErr, setLoadErr]               = useState<string | null>(null)
  const [identite, setIdentite]             = useState<IdentiteContrat>(defaultIdentite())

  // Pré-remplissage lecture seule depuis un contrat existant (entrée "Analyser / restructurer").
  // Réutilise la route GET existante (GestionContratModal) — aucune nouvelle route de lecture.
  useEffect(() => {
    if (!contratId) { setLoadingContrat(false); return }
    fetch(`/api/residences/${residenceId}/contrats/${contratId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: {
        libelle: string | null; type_contrat: string | null; date_debut: string; date_fin: string
        montant_mensuel: number | null; taux_horaire_facturation: number | null; tauxBase: number
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
      })
      .catch(() => setLoadErr('Impossible de charger le contrat existant.'))
      .finally(() => setLoadingContrat(false))
  }, [contratId, residenceId])

  function goTo(n: Step) {
    if (n > maxStepReached) return
    setStep(n)
  }
  function advance(n: Step) {
    setStep(n)
    setMaxStepReached(m => (n > m ? n : m))
  }

  // ── Calcul enveloppe live (étape 1) — mêmes formules que lib/prorata (charge + planning) ──
  const montantNum    = parseFloat(identite.montant) || 0
  const montantSaisi  = identite.montant.trim() !== ''
  const montantOffert = montantSaisi && montantNum === 0
  const tauxEffectif  = identite.tauxMode === 'base' ? identite.tauxBase : (parseFloat(identite.tauxSpecifique) || 0)
  const heuresMois    = heuresVenduesMois(montantNum, tauxEffectif)
  const minutesHebdo  = volumeHebdoMinutes(montantNum, tauxEffectif)

  const peutContinuerEtape1 = identite.libelle.trim().length > 0 && !loadingContrat

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

            {/* Libellé */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Libellé <span className="text-red-400">*</span>
              </label>
              <input type="text" value={identite.libelle}
                onChange={e => setIdentite(f => ({ ...f, libelle: e.target.value }))}
                placeholder="ex. Bâtiments A à D, Containers…"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Type de contrat</label>
              <select value={identite.typeContrat} onChange={e => setIdentite(f => ({ ...f, typeContrat: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40">
                {VALID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

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
          <div className="max-w-2xl mx-auto p-4 md:p-8">
            <p className="text-sm text-slate-400 italic">Étape 2 (analyse IA) — à venir dans ce même lot.</p>
          </div>
        ) : step === 3 ? (
          <div className="max-w-2xl mx-auto p-4 md:p-8">
            <p className="text-sm text-slate-400 italic">Étape 3 (proposition éditable) — à venir dans ce même lot.</p>
          </div>
        ) : (
          <div className="max-w-lg mx-auto p-8 text-center space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Validation</h3>
            <p className="text-sm text-slate-500">Bientôt disponible — lot 2.</p>
            <button disabled className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white opacity-40 cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
              Créer le contrat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
