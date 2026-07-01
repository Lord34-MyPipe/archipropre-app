'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Building2, Trash2, Leaf, MapPin, AlertTriangle, User } from 'lucide-react'
import RentabiliteModal from './RentabiliteModal'
import AjoutContratModal from './AjoutContratModal'
import GestionContratModal from './GestionContratModal'
import type { Residence } from '@/lib/types'
import type { ResidenceEtat } from '@/components/manager/ResidenceCard'

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

export default function ResidenceDetailClient({ residence: r, etat, agentNom, contrat, kpi }: Props) {
  const router = useRouter()
  // null = modal fermé ; { contratId: null } = global ; { contratId: id } = par contrat
  const [rentabiliteState, setRentabiliteState] = useState<{ contratId: string | null } | null>(null)
  const [showAjoutContrat, setShowAjoutContrat]     = useState(false)
  const [contratSelectionne, setContratSelectionne] = useState<ContratCard | null>(null)
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
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
              🔶 À vérifier doublon
            </span>
          )}
        </div>

        {agentNom && (
          <p className="text-blue-200 text-sm mt-2">
            Agent attitré : <span className="font-semibold text-white">{agentNom}</span>
          </p>
        )}
        {/* Bande KPI agrégée */}
        {kpi !== null && (
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

      {/* ── Grille navigation ── */}
      <div className="p-4 md:p-8">
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

          <button
            onClick={() => setRentabiliteState({ contratId: null })}
            className="bg-white rounded-xl p-5 flex flex-col items-center gap-2 shadow-sm hover:shadow-md hover:bg-slate-50 transition-all border border-slate-100 text-center"
          >
            <span className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-700">
              <IcoCoins />
            </span>
            <span className="text-sm font-semibold text-slate-700">Rentabilité</span>
          </button>

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

        {/* ── Cartes contrats ── */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Contrats
            </h2>
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

          {!contratsLoading && !contratsError && contrats.map(c => {
            const statutCfg = STATUT_CFG[c.statut_calcule]
            const typeCfg   = c.type_contrat ? (TYPE_CONTRAT_CFG[c.type_contrat] ?? { label: c.type_contrat, icon: '📄' }) : null
            const agentNomComplet = c.agent_prenom && c.agent_nom
              ? `${c.agent_prenom} ${c.agent_nom}`
              : null

            return (
              <div key={c.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
                {/* Ligne 1 : libellé + badge statut + bouton Gérer */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {c.libelle ?? 'Contrat sans libellé'}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statutCfg.cls}`}>
                      {statutCfg.label}
                    </span>
                    <Link
                      href={`/manager/residences/${r.id}/planning?contratId=${c.id}`}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-[#1A5FA8] hover:bg-[#EAF2FF] transition-colors"
                      aria-label="Planning de ce contrat"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/>
                      </svg>
                      Planning
                    </Link>
                    <Link
                      href={`/manager/residences/${r.id}/taches?contratId=${c.id}`}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-[#1A5FA8] hover:bg-[#EAF2FF] transition-colors"
                      aria-label="Tâches de ce contrat"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
                      </svg>
                      Tâches
                    </Link>
                    <Link
                      href={`/manager/residences/${r.id}/rapports?contratId=${c.id}`}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-[#1A5FA8] hover:bg-[#EAF2FF] transition-colors"
                      aria-label="Rapports de ce contrat"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                      </svg>
                      Rapports
                    </Link>
                    <button
                      onClick={() => setRentabiliteState({ contratId: c.id })}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-green-700 hover:bg-green-50 transition-colors"
                      aria-label="Rentabilité de ce contrat"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                      </svg>
                      Rentabilité
                    </button>
                    {c.qr_code_token && (
                      <button
                        onClick={async () => {
                          const { downloadQRContratPDF } = await import('@/lib/qr-pdf')
                          downloadQRContratPDF(r.nom, { libelle: c.libelle, token: c.qr_code_token! }, window.location.origin)
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
                    <button
                      onClick={() => setContratSelectionne(c)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-[#0A2E5A] hover:bg-slate-100 transition-colors"
                      aria-label="Gérer ce contrat"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                      Gérer
                    </button>
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
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Modal ajout contrat ── */}
      {showAjoutContrat && (
        <AjoutContratModal
          residenceId={r.id}
          onClose={() => setShowAjoutContrat(false)}
          onSuccess={() => { setShowAjoutContrat(false); fetchContrats() }}
        />
      )}

      {/* ── Modal rentabilité ── */}
      {rentabiliteState !== null && (
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
          onSaved={() => { setContratSelectionne(null); fetchContrats() }}
          onDeleted={() => { setContratSelectionne(null); fetchContrats() }}
        />
      )}
    </div>
  )
}
