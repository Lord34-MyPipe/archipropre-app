'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Residence } from '@/lib/types'
import { createClient } from '@/lib/supabase'
import { downloadQRCodePDF } from '@/lib/qr-pdf'
import { wazeUrl, googleMapsUrl } from '@/lib/navigation'
import AgentAttitreModal from '@/components/manager/AgentAttitreModal'
import PlanifierInterventionModal from '@/components/manager/PlanifierInterventionModal'
import ContratModal from '@/components/manager/ContratModal'

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
    btnClass: 'bg-[#1A5FA8] hover:bg-[#0A2E5A] text-white',
    btnLabel: 'Configurer',
  },
  prete: {
    label: 'Prête',
    bg: 'bg-orange-100 text-orange-600',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
    btnClass: 'bg-orange-500 hover:bg-orange-600 text-white',
    btnLabel: 'Générer le planning',
  },
  planning_actif: {
    label: 'Planning actif',
    bg: 'bg-green-100 text-green-700',
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
    btnClass: 'bg-green-600 hover:bg-green-700 text-white',
    btnLabel: 'Voir le planning',
  },
} as const


function formatDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

// ── Icônes SVG inline ─────────────────────────────────────────────────────────

const RegenIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
  </svg>
)
const PauseIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 9.563C9 9.252 9.252 9 9.563 9h4.874c.311 0 .563.252.563.563v4.874c0 .311-.252.563-.563.563H9.564A.562.562 0 019 14.437V9.564z"/>
  </svg>
)
const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/>
  </svg>
)

// ── Composant principal ───────────────────────────────────────────────────────

interface Props {
  residence: Residence & { _etat?: EtatResidenceInfo | null }
}

export default function ResidenceCard({ residence: initial }: Props) {
  const router     = useRouter()
  const [etatLocal, setEtatLocal] = useState<ResidenceEtat | null>(null)
  const etat: ResidenceEtat       = etatLocal ?? (initial._etat?.etat ?? 'a_configurer')
  const etatCfg    = ETAT_CONFIG[etat]

  const [token, setToken]               = useState(initial.qr_code_token)
  const [actif, setActif]               = useState(initial.actif)
  const [agentPrefereId, setAgentPrefereId] = useState(initial.agent_prefere_id)
  const [agentExcluIds, setAgentExcluIds]   = useState<string[]>(initial.agent_exclu_ids ?? [])
  const [agentNomLocal, setAgentNomLocal]   = useState(initial._etat?.nom_agent_attitre ?? null)
  const [menuOpen, setMenuOpen]         = useState(false)
  const [showToken, setShowToken]       = useState(false)
  const [showRegenModal, setShowRegenModal]       = useState(false)
  const [showAttitreModal, setShowAttitreModal]   = useState(false)
  const [showPlanifierModal, setShowPlanifierModal] = useState(false)
  const [showContratModal, setShowContratModal]   = useState(false)
  const [genConfirm, setGenConfirm]     = useState(false)
  const [genLoading, setGenLoading]     = useState(false)
  const [genError, setGenError]         = useState('')
  const [genWarnings, setGenWarnings]   = useState<string[]>([])
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenError, setRegenError]     = useState('')
  const [toggling, setToggling]         = useState(false)
  const [qrLoading, setQrLoading]       = useState(false)
  const [toast, setToast]               = useState('')
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef  = useRef<HTMLDivElement>(null)

  function showCardToast(msg: string) {
    setToast(msg)
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(''), 2800)
  }

  useEffect(() => {
    if (!menuOpen) return
    function onOut(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [menuOpen])

  async function handleToggleActif() {
    setToggling(true); setMenuOpen(false)
    const supabase = createClient()
    const { error } = await supabase.from('residences').update({ actif: !actif }).eq('id', initial.id)
    if (!error) setActif(a => !a)
    setToggling(false)
  }

  async function handleRegen() {
    setRegenLoading(true); setRegenError('')
    try {
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

  async function handleGenerer() {
    setGenLoading(true); setGenError('')
    try {
      const res = await fetch('/api/planning/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceId: initial.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erreur de génération')
      setGenConfirm(false)
      setEtatLocal('planning_actif')
      const warns: string[] = json.warnings ?? []
      if (warns.length > 0) {
        setGenWarnings(warns)
        setTimeout(() => {
          setGenWarnings([])
          window.location.href = `/manager/residences/${initial.id}/planning`
        }, 5000)
      } else {
        window.location.href = `/manager/residences/${initial.id}/planning`
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue'
      setGenError(msg)
      setGenConfirm(false)
      setTimeout(() => setGenError(''), 5000)
    }
    setGenLoading(false)
  }

  // Bouton principal contextuel
  function handlePrimaryAction() {
    if (etat === 'a_configurer') {
      if (!agentPrefereId) { setShowAttitreModal(true) }
      else { setShowContratModal(true) }
    } else if (etat === 'prete') {
      setGenConfirm(true); setGenError('')
    }
    // 'planning_actif' → Link (géré dans JSX)
  }

  // Info ligne agent
  const hasAgent = !!agentPrefereId
  const agentLabel = agentNomLocal ?? (hasAgent ? 'Agent affecté' : null)
  const dateContrat = formatDate(initial._etat?.date_debut_contrat ?? null)
  const nbFutures = initial._etat?.nb_interventions_futures ?? 0

  return (
    <>
      <div className={`bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-all flex flex-col gap-0 ${!actif ? 'opacity-65' : ''}`}>

        {/* ── En-tête ── */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg leading-none">🏢</span>
              <h3 className="font-semibold text-slate-800 leading-snug">{initial.nom}</h3>
              {!actif && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[11px] rounded-full font-medium">En sommeil</span>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-1 truncate">📍 {initial.adresse}</p>
            {/* Badges type */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {initial.type_client && (
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${TYPE_BG[initial.type_client] ?? 'bg-slate-100 text-slate-600'}`}>
                  {TYPE_LABEL[initial.type_client] ?? initial.type_client}
                </span>
              )}
              {initial.client_exigeant && (
                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-medium">⚠️ Exigeant</span>
              )}
              {initial.vehicule_requis && (
                <span className="px-2 py-0.5 bg-blue-50 text-blue-500 text-xs rounded-full font-medium">🚗 Véhicule</span>
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
          {/* Agent */}
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

          {/* Contrat / planning */}
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

        {/* ── Bouton principal + menu ⋯ ── */}
        <div className="flex items-center gap-2">
          {/* Bouton principal */}
          {etat === 'planning_actif' ? (
            <Link
              href={`/manager/residences/${initial.id}/planning`}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${etatCfg.btnClass}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5"/>
              </svg>
              {etatCfg.btnLabel}
            </Link>
          ) : (
            <button
              onClick={handlePrimaryAction}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors ${etatCfg.btnClass}`}>
              {etat === 'a_configurer' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5"/>
                </svg>
              )}
              {etatCfg.btnLabel}
            </button>
          )}

          {/* ⋯ Menu actions secondaires */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen(m => !m)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors text-lg font-bold ${
                menuOpen ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}
              title="Actions secondaires">
              ⋯
            </button>

            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-20">

                {/* Navigation */}
                <Link href={`/manager/residences/${initial.id}/taches`} onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                  </svg>
                  Gérer les tâches
                </Link>

                <div className="border-t border-slate-100 my-1"/>

                {/* Config */}
                <button onClick={() => { setShowAttitreModal(true); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#1A5FA8] hover:bg-blue-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
                  </svg>
                  Affecter / changer l&apos;agent
                </button>

                <button onClick={() => { setShowContratModal(true); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                  </svg>
                  Modifier le contrat
                </button>

                <button onClick={() => { setShowPlanifierModal(true); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#0BBFBF] hover:bg-teal-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5"/>
                  </svg>
                  Planifier une intervention
                </button>

                <div className="border-t border-slate-100 my-1"/>

                {/* Navigation externe */}
                <a href={googleMapsUrl(initial)} target="_blank" rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <span className="text-base">🗺️</span>
                  Google Maps
                </a>

                <a href={wazeUrl(initial)} target="_blank" rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <span className="text-base">🚗</span>
                  Waze
                </a>

                <button onClick={() => { handleQRPDF(); setMenuOpen(false) }} disabled={qrLoading}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                  {qrLoading
                    ? <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/>
                    : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/></svg>
                  }
                  QR PDF
                </button>

                <div className="border-t border-slate-100 my-1"/>

                {/* Danger zone */}
                <button onClick={() => { setShowRegenModal(true); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <RegenIcon/>
                  Régénérer QR code
                </button>

                <button onClick={() => { setShowToken(s => !s); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  {showToken ? 'Masquer le token' : 'Voir le token QR'}
                </button>

                <button onClick={handleToggleActif} disabled={toggling}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors disabled:opacity-50 ${
                    actif ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'
                  }`}>
                  {toggling
                    ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>
                    : actif ? <PauseIcon/> : <PlayIcon/>
                  }
                  {actif ? 'Mettre en sommeil' : 'Réactiver'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Erreur génération planning */}
        {genError && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            Erreur : {genError}
          </p>
        )}

        {/* Warnings génération planning */}
        {genWarnings.length > 0 && (
          <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 space-y-0.5">
            {genWarnings.map((w, i) => (
              <p key={i}>⚠️ {w}</p>
            ))}
          </div>
        )}

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
      {showContratModal && (
        <ContratModal
          residence={initial}
          onClose={() => setShowContratModal(false)}
          onSaved={() => showCardToast('Contrat mis à jour')}
        />
      )}

      {/* Confirm Générer le planning */}
      {genConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#0BBFBF]/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-[#0BBFBF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-slate-800">Générer le planning ?</h2>
            </div>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              Cela va créer toutes les interventions planifiées pour <span className="font-semibold">{initial.nom}</span> sur toute la durée du contrat, à partir des tâches configurées.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setGenConfirm(false)} disabled={genLoading}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                Annuler
              </button>
              <button onClick={handleGenerer} disabled={genLoading}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {genLoading
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>Génération…</>
                  : 'Générer'}
              </button>
            </div>
          </div>
        </div>
      )}

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
