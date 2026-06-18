'use client'

import { useRouter } from 'next/navigation'
import type { AgentDetailData, AgentIntervention, CongeItem, AbsenceItem } from './page'

// ── Constantes (identiques à ChargeClient) ────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  voiture: 'Voiture',
  tramway: 'Tramway',
  velo:    'Vélo/Scooter',
}
const MODE_ICONS: Record<string, string> = {
  voiture: '🚗',
  tramway: '🚊',
  velo:    '🛵',
}

const ECHELLE   = 125
const CONTRAT_X = (100 / ECHELLE) * 100  // 80 % de la piste

// ── Helpers ───────────────────────────────────────────────────────────────────

function initiales(nom: string) {
  return nom.split(' ').map(p => p[0] ?? '').join('').slice(0, 2).toUpperCase()
}

function couleurBarre(taux: number, seuil: number) {
  if (taux > 95) return '#EF4444'
  if (taux >= seuil) return '#F97316'
  return '#22C55E'
}

function addDaysStr(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateFr(isoDate: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', opts ?? { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtDuree(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  agent: AgentDetailData
  interventions: AgentIntervention[]
  conges: CongeItem[]
  absences: AbsenceItem[]
  mondayStr: string
  sundayStr: string
  agentId: string
}

export default function AgentDetailClient({
  agent, interventions, conges, absences, mondayStr, sundayStr, agentId,
}: Props) {
  const router = useRouter()

  // ── Charge bar (même logique que ChargeClient) ─────────────────────────────
  const taux      = agent.taux
  const seuil     = Math.round(agent.seuil_cible_pct)
  const contrat   = agent.contrat_heures_hebdo
  const heuresProg = agent.heures_prog
  const heuresSup  = agent.heures_sup
  const dispo      = agent.dispo
  const couleur    = couleurBarre(taux, seuil)

  const tauxCap  = Math.min(taux, ECHELLE)
  const largNorm = (Math.min(taux, 100) / ECHELLE) * 100
  const largSup  = (Math.max(0, tauxCap - 100) / ECHELLE) * 100
  const posCharge = (tauxCap / ECHELLE) * 100
  const posSeuil  = (Math.min(seuil, ECHELLE) / ECHELLE) * 100
  const showChargeLabel = Math.abs(posCharge - CONTRAT_X) > 9

  // ── Navigation semaine ────────────────────────────────────────────────────
  const prevMonday = addDaysStr(mondayStr, -7)
  const nextMonday = addDaysStr(mondayStr,  7)

  const weekLabel = `${formatDateFr(mondayStr, { day: 'numeric', month: 'long' })} → ${formatDateFr(sundayStr, { day: 'numeric', month: 'long', year: 'numeric' })}`

  // ── Groupement des interventions par jour ─────────────────────────────────
  const byDay = interventions.reduce<Record<string, AgentIntervention[]>>((acc, i) => {
    if (!acc[i.date_prevue]) acc[i.date_prevue] = []
    acc[i.date_prevue].push(i)
    return acc
  }, {})
  const sortedDays = Object.keys(byDay).sort()

  return (
    <div className="min-h-screen bg-slate-100" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── En-tête agent ────────────────────────────────────────────────────── */}
      <div className="bg-[#0A2E5A] text-white px-6 py-6 md:px-10">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push('/manager/charge')}
            className="flex items-center gap-1.5 text-blue-300 text-sm hover:text-white transition mb-5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Charge des agents
          </button>

          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg,#1A5FA8,#0BBFBF)' }}
            >
              {initiales(agent.nom_complet)}
            </div>

            {/* Infos */}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold leading-tight">{agent.nom_complet}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-sm text-blue-200">
                {agent.mode_deplacement && (
                  <span>
                    {MODE_ICONS[agent.mode_deplacement] ?? ''}{' '}
                    {MODE_LABELS[agent.mode_deplacement] ?? agent.mode_deplacement}
                  </span>
                )}
                {agent.secteur_libelle && <span>· {agent.secteur_libelle}</span>}
                <span>· {contrat}h / semaine</span>
              </div>

              {/* Badge binôme cliquable */}
              {agent.binome_nom && agent.binome_agent_id && (
                <button
                  onClick={() => router.push(`/manager/charge/${agent.binome_agent_id}`)}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-[#0BBFBF]/20 hover:bg-[#0BBFBF]/30 text-[#0BBFBF] rounded-full text-xs font-semibold transition"
                >
                  Binôme avec {agent.binome_nom}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-10 py-6 max-w-4xl mx-auto space-y-5">

        {/* ── Navigation semaine ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl px-5 py-3 shadow-sm border border-slate-100 flex items-center justify-between">
          <button
            onClick={() => router.push(`/manager/charge/${agentId}?date=${prevMonday}`)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-[#0A2E5A] hover:text-white transition"
            aria-label="Semaine précédente"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>

          <div className="text-center">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Semaine affichée</p>
            <p className="text-sm text-slate-700 font-medium mt-0.5">{weekLabel}</p>
          </div>

          <button
            onClick={() => router.push(`/manager/charge/${agentId}?date=${nextMonday}`)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-[#0A2E5A] hover:text-white transition"
            aria-label="Semaine suivante"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        {/* ── Grande barre de charge ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-5">
            Charge de la semaine
          </h2>

          {/* Stats */}
          <div className="flex items-end justify-between mb-6">
            <div>
              <p className="text-4xl font-bold leading-none" style={{ color: couleur }}>{taux}%</p>
              <p className="text-sm text-slate-600 mt-1 font-medium">
                {heuresProg}h programmées / {contrat}h contrat
              </p>
              {heuresSup > 0 ? (
                <p className="text-xs font-semibold mt-0.5" style={{ color: '#A32D2D' }}>
                  +{heuresSup}h heures supplémentaires
                </p>
              ) : (
                <p className="text-xs text-slate-400 mt-0.5">{dispo}h libres cette semaine</p>
              )}
            </div>
            <div className="text-right text-xs text-slate-400 space-y-0.5">
              <p>Seuil cible : <span className="font-medium text-slate-600">{seuil}%</span></p>
              <p>Contrat : <span className="font-medium text-slate-600">{contrat}h / sem</span></p>
            </div>
          </div>

          {/* Barre — même logique que ChargeClient.tsx */}
          <div className="relative mb-12">
            {/* Piste */}
            <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
              {/* Segment normal (couleur selon seuil) */}
              <div
                className="absolute left-0 top-0 h-full transition-all duration-300"
                style={{
                  width: `${largNorm}%`,
                  backgroundColor: couleur,
                  borderRadius: largSup > 0 ? '9999px 0 0 9999px' : '9999px',
                }}
              />
              {/* Segment heures sup (rouge foncé #A32D2D) */}
              {largSup > 0 && (
                <div
                  className="absolute top-0 h-full transition-all duration-300"
                  style={{
                    left: `${largNorm}%`,
                    width: `${largSup}%`,
                    backgroundColor: '#A32D2D',
                    borderRadius: '0 9999px 9999px 0',
                  }}
                />
              )}
            </div>

            {/* Repère contrat à 80% de la piste (trait plein) */}
            <div
              className="absolute w-0.5 bg-slate-400 pointer-events-none z-10"
              style={{ left: `${CONTRAT_X}%`, top: -5, height: 26 }}
            />

            {/* Repère seuil individuel (pointillé) */}
            <div
              className="absolute w-px pointer-events-none z-10"
              style={{
                left: `${posSeuil}%`,
                top: -5,
                height: 26,
                background: 'repeating-linear-gradient(to bottom,#94A3B8 0,#94A3B8 3px,transparent 3px,transparent 6px)',
              }}
            />

            {/* Labels sous la barre */}
            <div className="absolute left-0 right-0 text-[11px] leading-tight" style={{ top: 24 }}>
              {/* ↑ Xh — uniquement sans dépassement et sans collision avec le label contrat */}
              {heuresSup === 0 && showChargeLabel && (
                <span
                  className="absolute -translate-x-1/2 text-slate-500 whitespace-nowrap"
                  style={{ left: `${posCharge}%` }}
                >
                  ↑ {heuresProg}h
                </span>
              )}
              {/* Xh contrat */}
              <span
                className="absolute -translate-x-1/2 text-slate-400 whitespace-nowrap"
                style={{ left: `${CONTRAT_X}%` }}
              >
                {contrat}h contrat
              </span>
              {/* Label fusionné en dépassement */}
              {heuresSup > 0 && (
                <span
                  className="absolute right-0 font-semibold whitespace-nowrap"
                  style={{ color: '#A32D2D' }}
                >
                  {heuresProg}h (+{heuresSup}h sup)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Liste des interventions ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Interventions de la semaine
          </h2>

          {sortedDays.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Aucune intervention cette semaine</p>
          ) : (
            <div className="space-y-6">
              {sortedDays.map(date => {
                const d = new Date(date + 'T00:00:00')
                const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                return (
                  <div key={date}>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 capitalize">
                      {dayLabel}
                    </p>
                    <div className="space-y-2">
                      {byDay[date].map(inter => (
                        <div
                          key={inter.id}
                          className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100"
                        >
                          {/* Créneau */}
                          <div className="shrink-0 w-28 pt-0.5">
                            <p className="text-sm font-semibold text-slate-700">
                              {inter.heure_debut} → {inter.heure_fin}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {fmtDuree(inter.duree_minutes)}
                            </p>
                          </div>

                          {/* Résidence + tâches */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {inter.residence_nom}
                            </p>
                            {inter.taches.length > 0 && (
                              <p className="text-xs text-slate-400 truncate mt-0.5">
                                {inter.taches.join(' · ')}
                              </p>
                            )}
                          </div>

                          {/* Badge binôme */}
                          {inter.est_binome && (
                            <span className="shrink-0 text-[10px] px-2 py-0.5 bg-[#0BBFBF]/10 text-[#0BBFBF] rounded-full font-semibold whitespace-nowrap">
                              Binôme
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Congés & absences à venir ──────────────────────────────────────── */}
        {(conges.length > 0 || absences.length > 0) && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Congés &amp; absences à venir
            </h2>
            <div className="space-y-2">
              {conges.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border border-blue-100">
                  <span className="text-xl shrink-0">🏖️</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700">
                      {formatDateFr(c.date_debut, { day: 'numeric', month: 'long' })}
                      {' → '}
                      {formatDateFr(c.date_fin, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {c.valide ? '✓ Congés validés' : 'Congés — en attente de validation'}
                    </p>
                  </div>
                </div>
              ))}
              {absences.map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-100">
                  <span className="text-xl shrink-0">⚠️</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700">
                      Absence · {formatDateFr(a.date_debut, { day: 'numeric', month: 'long' })}
                      {' → '}
                      {formatDateFr(a.date_fin, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    {a.motif && <p className="text-xs text-slate-400 mt-0.5">{a.motif}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
