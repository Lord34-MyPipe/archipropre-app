'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import ContratModal from '@/components/manager/ContratModal'
import type { Residence } from '@/lib/types'
import type { ResidenceEtat } from '@/components/manager/ResidenceCard'

// ── Types locaux ──────────────────────────────────────────────────────────────

interface Contrat {
  id: string
  montant_mensuel: number | null
  nb_interventions_mois: number | null
}

interface PageData {
  residence: Residence
  agentNom: string | null
  contrat: Contrat | null
  etat: ResidenceEtat
}

// ── Config badge état ─────────────────────────────────────────────────────────

const ETAT_CONFIG: Record<ResidenceEtat, { label: string; bg: string }> = {
  a_configurer:  { label: 'À configurer',  bg: 'bg-slate-100 text-slate-500' },
  prete:         { label: 'Prête',         bg: 'bg-orange-100 text-orange-600' },
  planning_actif:{ label: 'Planning actif',bg: 'bg-green-100 text-green-700' },
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

// ── Icônes SVG ────────────────────────────────────────────────────────────────

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
const IcoContract = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="16" y2="17"/>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResidenceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { id } = params

  const [data, setData]             = useState<PageData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [notFound, setNotFound]     = useState(false)
  const [showContrat, setShowContrat] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Résidence
      const { data: res } = await supabase.from('residences')
        .select('id,nom,adresse,type_client,actif,agent_prefere_id,notes_import,lat,lng,qr_code_token,manager_id,agent_secondaire_id,agent_exclu_ids,vehicule_requis,competences_requises,created_at,client_exigeant')
        .eq('id', id)
        .eq('manager_id', user.id)
        .single()

      if (!res) { setNotFound(true); setLoading(false); return }

      // Etat depuis v_etat_residence
      const { data: etatRow } = await supabase.from('v_etat_residence')
        .select('etat,nom_agent_attitre')
        .eq('residence_id', id)
        .maybeSingle()

      const etat: ResidenceEtat = (etatRow?.etat as ResidenceEtat) ?? 'a_configurer'
      const agentNom: string | null = etatRow?.nom_agent_attitre ?? null

      // Contrat
      const { data: contratRow } = await supabase.from('contrats_residences')
        .select('id,montant_mensuel,nb_interventions_mois')
        .eq('residence_id', id)
        .maybeSingle()

      setData({
        residence: res as unknown as Residence,
        agentNom,
        contrat: contratRow ?? null,
        etat,
      })
      setLoading(false)
    }
    load()
  }, [id, router])

  if (loading) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#0BBFBF] border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-4">
      <p className="text-slate-500">Résidence introuvable.</p>
      <Link href="/manager/residences" className="text-[#0BBFBF] hover:underline text-sm">← Retour à la liste</Link>
    </div>
  )

  if (!data) return null
  const { residence: r, agentNom, contrat, etat } = data
  const etatCfg = ETAT_CONFIG[etat]
  const enSommeil = !r.actif

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── En-tête ── */}
      <div className="bg-[#0A2E5A] text-white px-6 py-5 md:px-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-blue-300 hover:text-white text-sm mb-3 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
          Retour au planning
        </button>

        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">🏢</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-snug">{r.nom}</h1>
            {r.adresse && (
              <p className="text-blue-300 text-sm mt-0.5 truncate">📍 {r.adresse}</p>
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
              ⚠ Adresse manquante
            </span>
          )}
          {r.notes_import === 'doublon_potentiel' && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
              🔶 À vérifier doublon
            </span>
          )}
        </div>

        {/* Agent attitré */}
        {agentNom && (
          <p className="text-blue-200 text-sm mt-2">
            Agent attitré : <span className="font-semibold text-white">{agentNom}</span>
          </p>
        )}

        {/* Infos contrat */}
        {contrat && (
          <p className="text-blue-300 text-sm mt-1">
            {contrat.montant_mensuel != null && `${contrat.montant_mensuel} €/mois`}
            {contrat.montant_mensuel != null && contrat.nb_interventions_mois != null && ' · '}
            {contrat.nb_interventions_mois != null && `${contrat.nb_interventions_mois} intervention${contrat.nb_interventions_mois > 1 ? 's' : ''}/mois`}
          </p>
        )}
      </div>

      {/* ── Grille de navigation ── */}
      <div className="p-4 md:p-8 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">

          {/* Planning */}
          <Link
            href={`/manager/residences/${id}/planning`}
            className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
          >
            <span className="w-10 h-10 rounded-full bg-[#EAF2FF] flex items-center justify-center text-[#1A5FA8]">
              <IcoCalendar />
            </span>
            <span className="text-sm font-semibold text-slate-700">Planning</span>
          </Link>

          {/* Rapports */}
          <Link
            href={`/manager/residences/${id}/rapports`}
            className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
          >
            <span className="w-10 h-10 rounded-full bg-[#E6FAF9] flex items-center justify-center text-[#0BBFBF]">
              <IcoReport />
            </span>
            <span className="text-sm font-semibold text-slate-700">Rapports</span>
          </Link>

          {/* Tâches */}
          <Link
            href={`/manager/residences/${id}/taches`}
            className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
          >
            <span className="w-10 h-10 rounded-full bg-[#EAF2FF] flex items-center justify-center text-[#1A5FA8]">
              <IcoTask />
            </span>
            <span className="text-sm font-semibold text-slate-700">Tâches</span>
          </Link>

          {/* Contrat */}
          <button
            onClick={() => setShowContrat(true)}
            className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
          >
            <span className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-700">
              <IcoContract />
            </span>
            <span className="text-sm font-semibold text-slate-700">Contrat</span>
          </button>

          {/* QR Code */}
          {r.qr_code_token && (
            <button
              onClick={async () => {
                const { downloadQRCodePDF } = await import('@/lib/qr-pdf')
                downloadQRCodePDF(
                  { nom: r.nom, adresse: r.adresse ?? '', token: r.qr_code_token },
                  window.location.origin
                )
              }}
              className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
            >
              <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                <IcoQr />
              </span>
              <span className="text-sm font-semibold text-slate-700">QR Code</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Modal contrat ── */}
      {showContrat && (
        <ContratModal
          residence={r}
          actif={r.actif}
          onClose={() => setShowContrat(false)}
          onSaved={() => setShowContrat(false)}
        />
      )}
    </div>
  )
}
