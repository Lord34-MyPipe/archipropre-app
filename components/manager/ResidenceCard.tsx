'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Residence } from '@/lib/types'
import { Building2, MapPin, AlertTriangle, Car } from 'lucide-react'
import { downloadQRCodePDF } from '@/lib/qr-pdf'
import AgentAttitreModal from '@/components/manager/AgentAttitreModal'
import PlanifierInterventionModal from '@/components/manager/PlanifierInterventionModal'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResidenceEtat = 'a_configurer' | 'prete' | 'planning_actif'

export interface EtatResidenceInfo {
  etat: ResidenceEtat
  a_agent: boolean
  a_contrat: boolean
  nb_interventions_futures: number
  nom_agent_attitre: string | null
  date_debut_contrat: string | null
}

// ── Constantes visuelles ──────────────────────────────────────────────────────

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

const ETAT_CONFIG = {
  a_configurer: {
    label: 'À configurer',
    bg: 'bg-slate-100 text-slate-500',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
      </svg>
    ),
  },
  prete: {
    label: 'Prête',
    bg: 'bg-orange-100 text-orange-600',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
  },
  planning_actif: {
    label: 'Planning actif',
    bg: 'bg-green-100 text-green-700',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
  },
} as const

// ── Icônes SVG grille (style Tabler) ─────────────────────────────────────────

const IcoCalendar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="16" rx="2"/>
    <line x1="16" y1="3" x2="16" y2="7"/>
    <line x1="8" y1="3" x2="8" y2="7"/>
    <line x1="4" y1="11" x2="20" y2="11"/>
    <rect x="8" y="15" width="2" height="2" fill="currentColor" stroke="none"/>
  </svg>
)

const IcoPlusCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <line x1="12" y1="8" x2="12" y2="16"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
)

const IcoClipboard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="2"/>
    <line x1="9" y1="12" x2="15" y2="12"/>
    <line x1="9" y1="16" x2="13" y2="16"/>
  </svg>
)

const IcoListCheck = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6l2 2 3-3"/>
    <path d="M4 12l2 2 3-3"/>
    <path d="M4 18l2 2 3-3"/>
    <line x1="13" y1="7" x2="20" y2="7"/>
    <line x1="13" y1="13" x2="20" y2="13"/>
    <line x1="13" y1="19" x2="20" y2="19"/>
  </svg>
)

const IcoUserCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="10" r="3"/>
    <path d="M6.168 18.849A4 4 0 0 1 10 16h4a4 4 0 0 1 3.832 2.849"/>
  </svg>
)

const IcoQR = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <path d="M14 14h1M19 14h1M14 19h6M19 17v3"/>
  </svg>
)

const IcoPause = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="4" width="4" height="16" rx="1"/>
    <rect x="14" y="4" width="4" height="16" rx="1"/>
  </svg>
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

// ── Composant principal ───────────────────────────────────────────────────────

interface Props {
  residence: Residence & { _etat?: EtatResidenceInfo | null }
}

export default function ResidenceCard({ residence: initial }: Props) {
  const router                                   = useRouter()
  const [etatLocal, setEtatLocal]               = useState<ResidenceEtat | null>(null)
  const etat: ResidenceEtat                      = etatLocal ?? (initial._etat?.etat ?? 'a_configurer')
  const etatCfg                                  = ETAT_CONFIG[etat]

  const [token, setToken]                        = useState(initial.qr_code_token)
  const [actif, setActif]                        = useState(initial.actif)

  const enSommeil                                = !actif
  const planningActif                            = etat !== 'a_configurer' && !enSommeil
  const interventionActive                       = etat !== 'a_configurer' && !enSommeil
  const rapportsActif                            = etat !== 'a_configurer'
  const [agentPrefereId, setAgentPrefereId]      = useState(initial.agent_prefere_id)
  const [agentExcluIds, setAgentExcluIds]        = useState<string[]>(initial.agent_exclu_ids ?? [])
  const [agentNomLocal, setAgentNomLocal]        = useState(initial._etat?.nom_agent_attitre ?? null)
  const [showToken, setShowToken]                = useState(false)
  const [showRegenModal, setShowRegenModal]      = useState(false)
  const [showAttitreModal, setShowAttitreModal]  = useState(false)
  const [showPlanifierModal, setShowPlanifierModal] = useState(false)
  const [regenLoading, setRegenLoading]          = useState(false)
  const [regenError, setRegenError]              = useState('')
  const [qrLoading, setQrLoading]               = useState(false)
  const [toast, setToast]                        = useState('')
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showCardToast(msg: string) {
    setToast(msg)
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(''), 2800)
  }

  async function handleRegen() {
    setRegenLoading(true); setRegenError('')
    try {
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      const { data, error } = await supabase.rpc('regenerate_qr_token', { p_residence_id: initial.id })
      if (error) throw error
      setToken(data as string)
      setShowRegenModal(false)
    } catch (e: unknown) {
      setRegenError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
    setRegenLoading(false)
  }

  async function handleQRPDF() {
    setQrLoading(true)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
      await downloadQRCodePDF({ nom: initial.nom, adresse: initial.adresse, token }, appUrl)
    } catch { alert('Erreur lors de la génération du PDF.') }
    setQrLoading(false)
  }

  const hasAgent   = !!agentPrefereId
  const agentLabel = agentNomLocal ?? (hasAgent ? 'Agent affecté' : null)
  const dateContrat = formatDate(initial._etat?.date_debut_contrat ?? null)
  const nbFutures  = initial._etat?.nb_interventions_futures ?? 0

  // Classes grille
  const configHighlight = etat === 'a_configurer'
  const configCls = configHighlight
    ? 'border-blue-200 bg-blue-50 text-[#185FA5] hover:bg-blue-100'
    : 'border-slate-200/70 bg-slate-50 text-slate-500 hover:bg-slate-100'
  const opBtnBase = 'flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-all active:scale-95'
  const disabledCls = 'flex flex-col items-center gap-1.5 py-3 rounded-xl border border-slate-200/70 bg-slate-50 text-slate-400 opacity-30 cursor-not-allowed pointer-events-none'

  return (
    <>
      <div className={`bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-all flex flex-col gap-0 ${!actif ? 'opacity-65' : ''}`}>

        {/* ── En-tête ── */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="w-5 h-5 text-slate-400 shrink-0" />
              <Link
                href={`/manager/residences/${initial.id}`}
                className="font-semibold text-slate-800 leading-snug hover:text-[#1A5FA8] transition-colors"
              >
                {initial.nom}
              </Link>
              {enSommeil && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full font-medium" style={{ background: '#F1EFE8', color: '#5F5E5A' }}>
                  <IcoPause/> En sommeil
                </span>
              )}
            </div>
            {initial.notes_import === 'adresse_manquante' && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-orange-100 text-orange-700">
                <AlertTriangle className="w-3 h-3" /> Adresse manquante
              </span>
            )}
            {initial.notes_import === 'doublon_potentiel' && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-yellow-100 text-yellow-700">
                🔶 À vérifier doublon
              </span>
            )}
            <p className="text-sm text-slate-400 mt-1 truncate flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{initial.adresse}</p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {initial.type_client && (
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${TYPE_BG[initial.type_client] ?? 'bg-slate-100 text-slate-600'}`}>
                  {TYPE_LABEL[initial.type_client] ?? initial.type_client}
                </span>
              )}
              {initial.client_exigeant && (
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Exigeant</span>
              )}
              {initial.vehicule_requis && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-500 text-xs rounded-full font-medium flex items-center gap-1"><Car className="w-3 h-3" /> Véhicule</span>
              )}
            </div>
          </div>

          {/* Badge état */}
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${etatCfg.bg}`}>
            {etatCfg.icon}
            <span>{etatCfg.label}</span>
          </div>
        </div>

        {/* ── Séparateur ── */}
        <div className="border-t border-slate-100 mb-3"/>

        {/* ── Info ligne agent + contrat/planning ── */}
        <div className="flex items-center gap-3 mb-4 text-xs flex-wrap">
          {hasAgent && agentLabel ? (
            <span className="flex items-center gap-1 text-green-600 font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              {agentLabel}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/>
              </svg>
              Pas d&apos;agent
            </span>
          )}

          <span className="text-slate-200">·</span>

          {etat === 'planning_actif' ? (
            <span className="flex items-center gap-1 text-green-600 font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5"/>
              </svg>
              {nbFutures} intervention{nbFutures > 1 ? 's' : ''} / planif.
            </span>
          ) : initial._etat?.a_contrat && dateContrat ? (
            <span className="flex items-center gap-1 text-green-600">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Contrat dès le {dateContrat}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
              </svg>
              Pas de contrat
            </span>
          )}
        </div>

        {/* ── Grille d'actions ── */}
        <div className="space-y-2">

          {/* Ligne 1 : Opérationnel */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Planning */}
            {planningActif && (
              <Link href={`/manager/residences/${initial.id}/planning`}
                className={`${opBtnBase} border-slate-200/70 bg-slate-50 text-[#185FA5] hover:bg-blue-50`}>
                <IcoCalendar/>
                <span className="text-[10px] font-medium">Planning</span>
              </Link>
            )}

            {/* Intervention */}
            {interventionActive && (
              <button onClick={() => setShowPlanifierModal(true)}
                className={`${opBtnBase} border-slate-200/70 bg-slate-50 text-[#185FA5] hover:bg-blue-50`}>
                <IcoPlusCircle/>
                <span className="text-[10px] font-medium">Intervention</span>
              </button>
            )}

            {/* Rapports */}
            {rapportsActif && (
              <Link href={`/manager/residences/${initial.id}/rapports`}
                className={`${opBtnBase} border-slate-200/70 bg-slate-50 text-[#0F6E56] hover:bg-emerald-50`}>
                <IcoClipboard/>
                <span className="text-[10px] font-medium">Rapports</span>
              </Link>
            )}
          </div>

          {/* Séparateur config */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-100"/>
            <span className="text-[9px] text-slate-300 uppercase tracking-widest font-medium">config</span>
            <div className="flex-1 h-px bg-slate-100"/>
          </div>

          {/* Ligne 2 : Configuration */}
          <div className="grid grid-cols-1 gap-1.5">
            <button onClick={() => setShowAttitreModal(true)}
              className={`${opBtnBase} ${configCls}`}>
              <IcoUserCircle/>
              <span className="text-[10px] font-medium">Affectation</span>
            </button>
          </div>

          {/* QR Code — pleine largeur */}
          <button
            onClick={handleQRPDF}
            disabled={qrLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 text-[11px] font-medium hover:bg-slate-100 transition-all disabled:opacity-50">
            {qrLoading
              ? <span className="w-3.5 h-3.5 border border-slate-400 border-t-transparent rounded-full animate-spin"/>
              : <IcoQR/>
            }
            QR Code
          </button>

          {/* Fiche détail — pleine largeur */}
          <Link
            href={`/manager/residences/${initial.id}`}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#1A5FA8]/20 bg-[#EAF2FF] text-[#1A5FA8] text-[11px] font-semibold hover:bg-[#1A5FA8]/20 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"/>
            </svg>
            Fiche résidence
          </Link>
        </div>

        {/* Token QR (caché par défaut) */}
        {showToken && (
          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 mt-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">Token QR</p>
            <p className="text-xs text-slate-500 font-mono break-all select-all">{token}</p>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#0A2E5A] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none">
          ✓ {toast}
        </div>
      )}

      {/* Modales */}
      {showAttitreModal && (
        <AgentAttitreModal
          residence={{ ...initial, agent_prefere_id: agentPrefereId, agent_exclu_ids: agentExcluIds }}
          onClose={() => setShowAttitreModal(false)}
          onSaved={(id, excluIds) => {
            setAgentPrefereId(id); setAgentExcluIds(excluIds)
            setShowAttitreModal(false)
            showCardToast('Agent attitré mis à jour')
          }}/>
      )}

      {showPlanifierModal && (
        <PlanifierInterventionModal
          residence={{ ...initial, agent_prefere_id: agentPrefereId, agent_exclu_ids: agentExcluIds }}
          onClose={() => setShowPlanifierModal(false)}
          onCreated={(count) => { setShowPlanifierModal(false); showCardToast(`${count} intervention${count > 1 ? 's' : ''} planifiée${count > 1 ? 's' : ''} ✓`) }}/>
      )}

      {showRegenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-slate-800">Régénérer le QR code ?</h2>
            </div>
            <p className="text-sm font-semibold text-slate-800 mb-1">{initial.nom}</p>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              L&apos;ancien QR code sera invalidé immédiatement. Vous devrez imprimer et remplacer l&apos;affichage physique avant la prochaine intervention.
            </p>
            {regenError && <p className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{regenError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowRegenModal(false); setRegenError('') }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">Annuler</button>
              <button onClick={handleRegen} disabled={regenLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                {regenLoading ? 'Régénération…' : 'Oui, régénérer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
