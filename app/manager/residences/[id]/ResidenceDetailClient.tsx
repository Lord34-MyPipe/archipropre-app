'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Trash2, Leaf, MapPin, AlertTriangle, User, FileText, Sparkles } from 'lucide-react'
import RentabiliteModal from './RentabiliteModal'
import AjoutContratModal from './AjoutContratModal'
import AnalyseContratWizard from './AnalyseContratWizard'
import { FEATURES } from '@/lib/features'
import GestionContratModal from './GestionContratModal'
import AgentAttitreModal from '@/components/manager/AgentAttitreModal'
import PlanifierInterventionModal from '@/components/manager/PlanifierInterventionModal'
import ConfigChecklist from '@/components/manager/ConfigChecklist'
import Breadcrumb from '@/components/manager/Breadcrumb'
import type { Residence } from '@/lib/types'
import type { ResidenceEtat } from '@/components/manager/ResidenceCard'

interface ContratChecklist {
  id: string
  step1: boolean
  step2: boolean
  step3: boolean
  step4: boolean
  allDone: boolean
  estTermine: boolean
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Contrat {
  id: string
  montant_mensuel: number | null
  nb_interventions_mois: number | null
}

interface ContratCard {
  id: string
  libelle: string | null
  type_contrat: string | null
  statut_calcule: 'actif' | 'futur' | 'sommeil' | 'termine'
  montant_mensuel: number | null
  nb_interventions_mois: number | null
  agent_prefere_id: string | null
  agent_prenom: string | null
  agent_nom: string | null
  nb_zones: number
  nb_interventions: number
  qr_code_token: string | null
  actif: boolean
  date_debut: string
  date_fin: string
}

interface Props {
  residence: Residence
  etat: ResidenceEtat
  agentNom: string | null
  contrat: Contrat | null
  kpi: import('@/lib/rentabilite').KpiResidence | null
  contratsChecklist: ContratChecklist[]
}

// ── Config cartes contrats ────────────────────────────────────────────────────

const STATUT_CFG: Record<ContratCard['statut_calcule'], { label: string; cls: string }> = {
  actif:    { label: 'Actif',       cls: 'bg-green-100 text-green-700' },
  futur:    { label: 'Futur',       cls: 'bg-blue-100 text-blue-700' },
  sommeil:  { label: 'En sommeil',  cls: 'bg-slate-100 text-slate-500' },
  termine:  { label: 'Terminé',     cls: 'bg-slate-200 text-slate-600' },
}

const TYPE_CONTRAT_CFG: Record<string, { label: string; icon: ReactNode }> = {
  parties_communes: { label: 'Parties communes', icon: <Building2 className="w-3.5 h-3.5 inline" /> },
  containers:       { label: 'Containers',       icon: <Trash2 className="w-3.5 h-3.5 inline" /> },
  espaces_verts:    { label: 'Espaces verts',    icon: <Leaf className="w-3.5 h-3.5 inline" /> },
}

// ── Config badge état ─────────────────────────────────────────────────────────

const ETAT_CONFIG: Record<ResidenceEtat, { label: string; bg: string }> = {
  a_configurer:   { label: 'À configurer',  bg: 'bg-slate-100 text-slate-500' },
  prete:          { label: 'Prête',         bg: 'bg-orange-100 text-orange-600' },
  planning_actif: { label: 'Planning actif',bg: 'bg-green-100 text-green-700' },
}

const TYPE_LABEL: Record<string, string> = {
  syndic:              'Syndic',
  profession_liberale: 'Profession libérale',
  societe:             'Société',
  magasin:             'Magasin',
  particulier:         'Particulier',
}
const TYPE_BG: Record<string, string> = {
  syndic:              'bg-blue-100 text-blue-700',
  profession_liberale: 'bg-green-100 text-green-700',
  societe:             'bg-orange-100 text-orange-700',
  magasin:             'bg-purple-100 text-purple-700',
  particulier:         'bg-slate-100 text-slate-600',
}

// ── Icônes ────────────────────────────────────────────────────────────────────

const IcoCalendar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="16" rx="2"/>
    <line x1="16" y1="3" x2="16" y2="7"/>
    <line x1="8" y1="3" x2="8" y2="7"/>
    <line x1="4" y1="11" x2="20" y2="11"/>
  </svg>
)
const IcoReport = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="12" y2="17"/>
  </svg>
)
const IcoTask = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4"/>
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
  </svg>
)
const IcoCoins = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
  </svg>
)
const IcoQr = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
    <rect x="14" y="14" width="3" height="3"/>
    <line x1="17" y1="17" x2="20" y2="17"/>
    <line x1="20" y1="17" x2="20" y2="20"/>
  </svg>
)

// ── Composant ─────────────────────────────────────────────────────────────────

export default function ResidenceDetailClient({ residence: r, etat, agentNom, contrat, kpi, contratsChecklist }: Props) {
  const router = useRouter()
  // null = modal fermé ; { contratId: null } = global ; { contratId: id } = par contrat
  const [rentabiliteState, setRentabiliteState] = useState<{ contratId: string | null } | null>(null)
  const [showAjoutContrat, setShowAjoutContrat]     = useState(false)
  const [contratSelectionne, setContratSelectionne] = useState<ContratCard | null>(null)
  // null = fermé ; { contratId: null } = nouveau contrat assisté IA ; { contratId: id } = analyser/restructurer un contrat existant
  const [wizardState, setWizardState]               = useState<{ contratId: string | null } | null>(null)
  const [showAgentModal, setShowAgentModal]         = useState(false)
  const [showPlanifier, setShowPlanifier]           = useState(false)
  const [genContratId, setGenContratId]             = useState<string | null>(null)
  const [contrats, setContrats]                     = useState<ContratCard[]>([])
  const [contratsLoading, setContratsLoading]       = useState(true)
  const [contratsError, setContratsError]           = useState<string | null>(null)

  function fetchContrats() {
    setContratsLoading(true)
    setContratsError(null)
    fetch(`/api/residences/${r.id}/contrats`)
      .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
      .then((data: ContratCard[]) => setContrats(data))
      .catch(() => setContratsError('Impossible de charger les contrats.'))
      .finally(() => setContratsLoading(false))
  }

  useEffect(() => { fetchContrats() }, [r.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Après une action de configuration : recharge les cartes + recalcule la checklist serveur
  function refreshAll() { fetchContrats(); router.refresh() }

  // ── Checklist de configuration ──────────────────────────────────────────────
  const checklistById = new Map(contratsChecklist.map(c => [c.id, c]))
  const contratsAConfigurer = contratsChecklist.filter(c => !c.allDone && !c.estTermine)
  const configMode = contratsAConfigurer.length > 0 || contratsChecklist.length === 0

  // Création manuelle d'intervention : possible dès qu'un contrat actif a un agent attitré
  const peutPlanifier = contrats.some(c => c.actif && c.agent_prefere_id)

  // Étape ① : éditer le contrat placeholder existant, sinon en créer un
  function onStep1(contratId: string | null) {
    if (contratId) {
      const card = contrats.find(c => c.id === contratId)
      if (card) { setContratSelectionne(card); return }
    }
    setShowAjoutContrat(true)
  }
  // Étape ④ : génération du planning via la route existante
  async function genererPlanning(contratId: string) {
    if (genContratId) return
    setGenContratId(contratId)
    try {
      const res = await fetch('/api/planning/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceId: r.id, contratId }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Erreur' }))
        alert(error ?? 'Échec de la génération du planning.')
      } else {
        refreshAll()
      }
    } catch {
      alert('Échec de la génération du planning.')
    } finally {
      setGenContratId(null)
    }
  }

  const etatCfg = ETAT_CONFIG[etat]
  const enSommeil = !r.actif

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── En-tête ── */}
      <div className="bg-[#0A2E5A] text-white px-6 py-5 md:px-8">
        <div className="mb-3">
          <Breadcrumb items={[
            { label: 'Résidences', href: '/manager/residences' },
            { label: r.nom },
          ]} />
        </div>

        <div className="flex items-start gap-3">
          <Building2 className="w-6 h-6 mt-0.5 text-white/80 shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-snug">{r.nom}</h1>
            {r.adresse && (
              <p className="text-blue-300 text-sm mt-0.5 truncate flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{r.adresse}</p>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mt-3">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${etatCfg.bg}`}>
            {etatCfg.label}
          </span>
          {enSommeil && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-500">
              En sommeil
            </span>
          )}
          {r.type_client && (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${TYPE_BG[r.type_client] ?? 'bg-slate-100 text-slate-600'}`}>
              {TYPE_LABEL[r.type_client] ?? r.type_client}
            </span>
          )}
          {r.notes_import === 'adresse_manquante' && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
              <AlertTriangle className="w-3 h-3 inline mr-1" />Adresse manquante
            </span>
          )}
          {r.notes_import === 'doublon_potentiel' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
              <AlertTriangle className="w-3 h-3" /> À vérifier doublon
            </span>
          )}
        </div>

        {agentNom && (
          <p className="text-blue-200 text-sm mt-2">
            Agent attitré : <span className="font-semibold text-white">{agentNom}</span>
          </p>
        )}
        {/* Bande KPI agrégée — données financières masquées par le flag rentabilite */}
        {FEATURES.rentabilite && kpi !== null && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
            {!kpi.hasContrats ? (
              <span className="text-blue-300 text-sm">Aucun contrat actif</span>
            ) : (
              <>
                <span className="text-sm text-white/90">
                  <span className="text-blue-300 mr-1">CA</span>
                  {Math.round(kpi.caMois).toLocaleString('fr-FR')} €/mois
                </span>
                <span className="text-blue-600">·</span>
                <span className="text-sm text-white/90">
                  <span className="text-blue-300 mr-1">Coût</span>
                  {Math.round(kpi.coutMoisEstime).toLocaleString('fr-FR')} €/mois
                </span>
                <span className="text-blue-600">·</span>
                <span className={`text-sm font-semibold ${kpi.margeMois >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                  <span className="font-normal text-blue-300 mr-1">Marge</span>
                  {kpi.margeMois >= 0 ? '+' : ''}{Math.round(kpi.margeMois).toLocaleString('fr-FR')} €
                  {kpi.tauxMarge !== null && ` (${kpi.tauxMarge.toFixed(1)} %)`}
                </span>
                {kpi.perteCachee && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-red-500/30 text-red-200 rounded-full border border-red-400/40">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />Perte cachée
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="p-4 md:p-8">

        {/* ── Nouvelle intervention — visible dès qu'un contrat actif a un agent attitré ── */}
        {peutPlanifier && (
          <button
            onClick={() => setShowPlanifier(true)}
            className="w-full mb-4 flex items-center justify-center gap-2 py-3.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Nouvelle intervention
          </button>
        )}

        {/* ── Checklist de configuration guidée ── */}
        {configMode && (
          <div className="space-y-3 mb-4">
            {contratsChecklist.length === 0 ? (
              <ConfigChecklist
                steps={{ step1: false, step2: false, step3: false, step4: false }}
                onStep1={() => onStep1(null)}
                onStep2={() => {}}
                onStep3={() => setShowAgentModal(true)}
                onStep4={() => {}}
              />
            ) : (
              contratsAConfigurer.map(chk => {
                const card = contrats.find(c => c.id === chk.id)
                return (
                  <ConfigChecklist
                    key={chk.id}
                    libelle={contratsAConfigurer.length > 1 ? (card?.libelle ?? 'Contrat') : undefined}
                    steps={{ step1: chk.step1, step2: chk.step2, step3: chk.step3, step4: chk.step4 }}
                    onStep1={() => onStep1(chk.id)}
                    onStep2={() => router.push(`/manager/residences/${r.id}/taches?contratId=${chk.id}`)}
                    onStep3={() => setShowAgentModal(true)}
                    onStep4={() => genererPlanning(chk.id)}
                    busyStep4={genContratId === chk.id}
                  />
                )
              })
            )}
          </div>
        )}

        {/* ── Grille navigation (masquée pendant la configuration) ── */}
        {!configMode && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

          <Link
            href={`/manager/residences/${r.id}/planning`}
            className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
          >
            <span className="w-10 h-10 rounded-full bg-[#EAF2FF] flex items-center justify-center text-[#1A5FA8]">
              <IcoCalendar />
            </span>
            <span className="text-sm font-semibold text-slate-700">Planning</span>
          </Link>

          <Link
            href={`/manager/residences/${r.id}/rapports`}
            className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
          >
            <span className="w-10 h-10 rounded-full bg-[#E6FAF9] flex items-center justify-center text-[#0BBFBF]">
              <IcoReport />
            </span>
            <span className="text-sm font-semibold text-slate-700">Rapports</span>
          </Link>

          <Link
            href={`/manager/residences/${r.id}/rapport-syndic`}
            className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
          >
            <span className="w-10 h-10 rounded-full bg-[#EAF2FF] flex items-center justify-center text-[#1A5FA8]">
              <FileText className="w-5 h-5" />
            </span>
            <span className="text-sm font-semibold text-slate-700">Rapport syndic</span>
          </Link>

          {FEATURES.rentabilite && (
            <button
              onClick={() => setRentabiliteState({ contratId: null })}
              className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
            >
              <span className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-700">
                <IcoCoins />
              </span>
              <span className="text-sm font-semibold text-slate-700">Rentabilité</span>
            </button>
          )}

          {!contratsLoading && contrats.filter(c => c.actif && c.qr_code_token).length > 0 && (
            <button
              onClick={async () => {
                const actifs = contrats.filter(c => c.actif && c.qr_code_token)
                const { downloadQRAllContratsPDF } = await import('@/lib/qr-pdf')
                downloadQRAllContratsPDF(r.nom, actifs, window.location.origin)
              }}
              className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
            >
              <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                <IcoQr />
              </span>
              <span className="text-sm font-semibold text-slate-700">QR Codes</span>
            </button>
          )}
        </div>
        )}

        {/* ── Cartes contrats ── */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Contrats
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setWizardState({ contratId: null })}
                className="flex items-center gap-1 text-xs font-semibold text-[#0BBFBF] hover:text-[#0BBFBF]/80 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Nouveau contrat (assisté IA)
              </button>
              <button
                onClick={() => setShowAjoutContrat(true)}
                className="flex items-center gap-1 text-xs font-semibold text-[#1A5FA8] hover:text-[#0A4A8A] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Ajouter un contrat
              </button>
            </div>
          </div>

          {contratsLoading && (
            <div className="space-y-2">
              {[0, 1].map(i => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 animate-pulse">
                  <div className="h-3 bg-slate-200 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {contratsError && (
            <p className="text-sm text-red-500 px-1">{contratsError}</p>
          )}

          {!contratsLoading && !contratsError && contrats.filter(c => {
            // En mode config, le contrat non terminé est représenté par sa checklist, pas par une carte
            const chk = checklistById.get(c.id)
            return !(chk && !chk.allDone && !chk.estTermine)
          }).map(c => {
            const statutCfg = STATUT_CFG[c.statut_calcule]
            const typeCfg   = c.type_contrat ? (TYPE_CONTRAT_CFG[c.type_contrat] ?? { label: c.type_contrat, icon: '📄' }) : null
            const agentNomComplet = c.agent_prenom && c.agent_nom
              ? `${c.agent_prenom} ${c.agent_nom}`
              : null

            return (
              <Link
                key={c.id}
                href={`/manager/residences/${r.id}/contrats/${c.id}`}
                className="block bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md hover:border-slate-200 transition-all"
              >
                {/* Ligne 1 : libellé + badge statut + QR */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {c.libelle ?? 'Contrat sans libellé'}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statutCfg.cls}`}>
                      {statutCfg.label}
                    </span>
                    <button
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        setWizardState({ contratId: c.id })
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-[#0BBFBF] hover:bg-slate-100 transition-colors"
                      aria-label="Analyser / restructurer ce contrat avec l'IA"
                      title="Analyser / restructurer (IA)"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                    {c.qr_code_token && (
                      <button
                        onClick={(e) => {
                          e.preventDefault(); e.stopPropagation()
                          import('@/lib/qr-pdf').then(({ downloadQRContratPDF }) =>
                            downloadQRContratPDF(r.nom, { libelle: c.libelle, token: c.qr_code_token! }, window.location.origin))
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        aria-label="QR Code de ce contrat"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                          <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/>
                          <line x1="17" y1="17" x2="20" y2="17"/><line x1="20" y1="17" x2="20" y2="20"/>
                        </svg>
                        QR
                      </button>
                    )}
                  </div>
                </div>

                {/* Ligne 2 : type + agent */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mb-2">
                  {typeCfg && (
                    <span>{typeCfg.icon} {typeCfg.label}</span>
                  )}
                  <span className={agentNomComplet ? 'text-slate-600' : 'text-slate-400 italic'}>
                    <User className="w-3 h-3 inline mr-1" />{agentNomComplet ?? 'Aucun agent attitré'}
                  </span>
                </div>

                {/* Ligne 3 : montant + compteurs */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {c.montant_mensuel != null ? `${c.montant_mensuel} €/mois` : '—'}
                  </span>
                  <span>{c.nb_zones} zone{c.nb_zones !== 1 ? 's' : ''}</span>
                  <span>{c.nb_interventions} intervention{c.nb_interventions !== 1 ? 's' : ''}</span>
                </div>

                {/* Badges alertes */}
                {(c.statut_calcule === 'actif' && c.nb_interventions === 0) || c.montant_mensuel === 0
                  ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {c.statut_calcule === 'actif' && c.nb_interventions === 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                          Aucune intervention planifiée
                        </span>
                      )}
                      {c.montant_mensuel === 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                          Offert 0€
                        </span>
                      )}
                    </div>
                  )
                  : null
                }
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Modal ajout contrat ── */}
      {showAjoutContrat && (
        <AjoutContratModal
          residenceId={r.id}
          onClose={() => setShowAjoutContrat(false)}
          onSuccess={() => { setShowAjoutContrat(false); refreshAll() }}
        />
      )}

      {/* ── Modal affectation agent (étape ③ de la checklist) ── */}
      {showAgentModal && (
        <AgentAttitreModal
          residence={r}
          onClose={() => setShowAgentModal(false)}
          onSaved={() => { setShowAgentModal(false); refreshAll() }}
        />
      )}

      {/* ── Modal création manuelle d'intervention ── */}
      {showPlanifier && (
        <PlanifierInterventionModal
          residence={r}
          onClose={() => setShowPlanifier(false)}
          onCreated={() => { setShowPlanifier(false); refreshAll() }}
        />
      )}

      {/* ── Modal rentabilité ── */}
      {FEATURES.rentabilite && rentabiliteState !== null && (
        <RentabiliteModal
          residenceId={r.id}
          contratId={rentabiliteState.contratId}
          onClose={() => setRentabiliteState(null)}
        />
      )}

      {/* ── Modal gestion contrat par carte ── */}
      {contratSelectionne && (
        <GestionContratModal
          residenceId={r.id}
          contrat={contratSelectionne}
          onClose={() => setContratSelectionne(null)}
          onSaved={() => { setContratSelectionne(null); refreshAll() }}
          onDeleted={() => { setContratSelectionne(null); refreshAll() }}
        />
      )}

      {/* ── Wizard analyse contrat assistée IA (lot 1 — lecture/proposition seule) ── */}
      {wizardState !== null && (
        <AnalyseContratWizard
          residenceId={r.id}
          contratId={wizardState.contratId}
          onClose={() => setWizardState(null)}
        />
      )}
    </div>
  )
}
