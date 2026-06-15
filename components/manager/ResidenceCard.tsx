'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { Residence } from '@/lib/types'
import { createClient } from '@/lib/supabase'
import { downloadQRCodePDF } from '@/lib/qr-pdf'
import AgentAttitreModal from '@/components/manager/AgentAttitreModal'
import PlanifierInterventionModal from '@/components/manager/PlanifierInterventionModal'
import ContratModal, { type GeneratedIntervention } from '@/components/manager/ContratModal'
import PlanningPreviewModal from '@/components/manager/PlanningPreviewModal'

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

function googleMapsUrl(r: Residence) {
  if (r.lat && r.lng) return `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.adresse + ', Montpellier')}`
}
function wazeUrl(r: Residence) {
  if (r.lat && r.lng) return `https://waze.com/ul?ll=${r.lat},${r.lng}&navigate=yes`
  return `https://waze.com/ul?q=${encodeURIComponent(r.adresse + ', Montpellier')}&navigate=yes`
}

const PauseIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.563C9 9.252 9.252 9 9.563 9h4.874c.311 0 .563.252.563.563v4.874c0 .311-.252.563-.563.563H9.564A.562.562 0 019 14.437V9.564z"/>
  </svg>
)
const PlayIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/>
  </svg>
)
const RegenIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/>
  </svg>
)
const EyeIcon = ({ open }: { open: boolean }) => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    {open
      ? <><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></>
      : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></>
    }
  </svg>
)
const SliderIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/>
  </svg>
)

export default function ResidenceCard({ residence: initial }: { residence: Residence }) {
  const [token, setToken]               = useState(initial.qr_code_token)
  const [actif, setActif]               = useState(initial.actif)
  const [agentPrefereId, setAgentPrefereId] = useState(initial.agent_prefere_id)
  const [agentExcluIds, setAgentExcluIds]   = useState<string[]>(initial.agent_exclu_ids ?? [])
  const [menuOpen, setMenuOpen]         = useState(false)
  const [showToken, setShowToken]       = useState(false)
  const [showRegenModal, setShowRegenModal]       = useState(false)
  const [showAttitreModal, setShowAttitreModal]       = useState(false)
  const [showPlanifierModal, setShowPlanifierModal]   = useState(false)
  const [showContratModal, setShowContratModal]       = useState(false)
  const [showPlanningPreview, setShowPlanningPreview] = useState(false)
  const [generatedPlan, setGeneratedPlan]             = useState<GeneratedIntervention[]>([])
  const [planGenDebut, setPlanGenDebut]               = useState('')
  const [planGenFin, setPlanGenFin]                   = useState('')
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenError, setRegenError]     = useState('')
  const [toggling, setToggling]         = useState(false)
  const [qrLoading, setQrLoading]       = useState(false)
  const [toast, setToast]               = useState('')
  const toastRef                        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function showCardToast(msg: string) {
    setToast(msg)
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(''), 2800)
  }

  useEffect(() => {
    if (!menuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  async function handleToggleActif() {
    setToggling(true)
    setMenuOpen(false)
    const supabase = createClient()
    const { error } = await supabase.from('residences').update({ actif: !actif }).eq('id', initial.id)
    if (!error) setActif(a => !a)
    setToggling(false)
  }

  async function handleRegen() {
    setRegenLoading(true)
    setRegenError('')
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
    } catch {
      alert('Erreur lors de la génération du PDF.')
    }
    setQrLoading(false)
  }

  return (
    <>
      <div className={`bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md transition-all flex flex-col gap-4 ${!actif ? 'opacity-65' : ''}`}>

        {/* En-tête */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg leading-none">🏢</span>
              <h3 className="font-semibold text-slate-800 leading-snug">{initial.nom}</h3>
              {!actif && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-[11px] rounded-full font-medium shrink-0">En sommeil</span>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-1.5 truncate">📍 {initial.adresse}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {initial.type_client && (
              <span className={`px-2.5 py-0.5 text-xs rounded-full font-medium ${TYPE_BG[initial.type_client] ?? 'bg-slate-100 text-slate-600'}`}>
                {TYPE_LABEL[initial.type_client] ?? initial.type_client}
              </span>
            )}
            {initial.client_exigeant && (
              <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-medium" title="Client exigeant">⚠️</span>
            )}
            {initial.vehicule_requis && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-500 text-xs rounded-full font-medium" title="Véhicule requis">🚗</span>
            )}
          </div>
        </div>

        {/* Séparateur */}
        <div className="border-t border-slate-100"/>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <a href={googleMapsUrl(initial)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1A5FA8] text-white text-xs rounded-xl font-medium hover:bg-[#0A2E5A] transition-colors">
            🗺️ Maps
          </a>
          <a href={wazeUrl(initial)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#05C8F7] text-white text-xs rounded-xl font-medium hover:bg-[#04a8d0] transition-colors">
            🚗 Waze
          </a>
          <button onClick={handleQRPDF} disabled={qrLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0A2E5A] text-white text-xs rounded-xl font-medium hover:bg-[#1A5FA8] transition-colors disabled:opacity-60">
            {qrLoading
              ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"/>
              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"/></svg>
            }
            QR PDF
          </button>

          {/* Menu ⚙️ */}
          <div ref={menuRef} className="relative ml-auto">
            <button onClick={() => setMenuOpen(m => !m)}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                menuOpen ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}>
              <SliderIcon/>
            </button>

            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-20">
                <button
                  onClick={() => { setShowContratModal(true); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/>
                  </svg>
                  Créer / Modifier le contrat
                </button>

                <div className="border-t border-slate-100 my-1"/>

                <button
                  onClick={() => { setShowAttitreModal(true); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#1A5FA8] hover:bg-blue-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"/>
                  </svg>
                  Affecter un agent attitré
                </button>

                <button
                  onClick={() => { setShowPlanifierModal(true); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[#0BBFBF] hover:bg-teal-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/>
                  </svg>
                  Planifier une intervention
                </button>

                <div className="border-t border-slate-100 my-1"/>

                <button
                  onClick={() => { setShowRegenModal(true); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <RegenIcon/>
                  Régénérer QR code
                </button>

                <button
                  onClick={handleToggleActif}
                  disabled={toggling}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors disabled:opacity-50 ${
                    actif ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'
                  }`}>
                  {toggling
                    ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>
                    : actif ? <PauseIcon/> : <PlayIcon/>
                  }
                  {actif ? 'Mettre en sommeil' : 'Réactiver'}
                </button>

                <div className="border-t border-slate-100 my-1"/>

                <Link
                  href={`/manager/residences/${initial.id}/taches`}
                  onClick={() => setMenuOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                  </svg>
                  Gérer les tâches
                </Link>

                <button
                  onClick={() => { setShowToken(s => !s); setMenuOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  <EyeIcon open={showToken}/>
                  {showToken ? 'Masquer le token' : 'Voir le token QR'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Token (caché par défaut) */}
        {showToken && (
          <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">Token QR</p>
            <p className="text-xs text-slate-500 font-mono break-all select-all">{token}</p>
          </div>
        )}
      </div>

      {/* Toast carte */}
      {toast && (
        <div className="fixed bottom-28 md:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-[#0A2E5A] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-medium pointer-events-none">
          ✓ {toast}
        </div>
      )}

      {/* Modal contrat */}
      {showContratModal && (
        <ContratModal
          residence={initial}
          onClose={() => setShowContratModal(false)}
          onGenerated={(inters, gDebut, gFin) => {
            setGeneratedPlan(inters)
            setPlanGenDebut(gDebut)
            setPlanGenFin(gFin)
            setShowContratModal(false)
            setShowPlanningPreview(true)
          }}
        />
      )}

      {/* Prévisualisation planning */}
      {showPlanningPreview && (
        <PlanningPreviewModal
          interventions={generatedPlan}
          residence={initial}
          genDebut={planGenDebut}
          genFin={planGenFin}
          onClose={() => setShowPlanningPreview(false)}
          onValidated={(count) => {
            setShowPlanningPreview(false)
            showCardToast(`Planning publié — ${count} interventions planifiées ✓`)
          }}
        />
      )}

      {/* Modal agent attitré */}
      {showAttitreModal && (
        <AgentAttitreModal
          residence={{ ...initial, agent_prefere_id: agentPrefereId, agent_exclu_ids: agentExcluIds }}
          onClose={() => setShowAttitreModal(false)}
          onSaved={(id, excluIds) => {
            setAgentPrefereId(id)
            setAgentExcluIds(excluIds)
            setShowAttitreModal(false)
            showCardToast('Agent attitré mis à jour')
          }}
        />
      )}

      {/* Modal planifier intervention */}
      {showPlanifierModal && (
        <PlanifierInterventionModal
          residence={{ ...initial, agent_prefere_id: agentPrefereId, agent_exclu_ids: agentExcluIds }}
          onClose={() => setShowPlanifierModal(false)}
          onCreated={(count) => {
            setShowPlanifierModal(false)
            showCardToast(`${count} intervention${count > 1 ? 's' : ''} planifiée${count > 1 ? 's' : ''} ✓`)
          }}
        />
      )}

      {/* Modal confirmation régénération */}
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
              L'ancien QR code sera invalidé immédiatement. Vous devrez imprimer et remplacer l'affichage physique avant la prochaine intervention.
            </p>
            {regenError && (
              <p className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{regenError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowRegenModal(false); setRegenError('') }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">
                Annuler
              </button>
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
