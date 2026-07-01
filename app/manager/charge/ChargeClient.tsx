'use client'

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { ChargeAgent } from './page'
import { Car, TramFront } from 'lucide-react'

const MODE_LABELS: Record<string, string> = {
  voiture: 'Voiture',
  tramway: 'Tramway',
  velo:    'Vélo/Scooter',
}
const MODE_ICONS: Record<string, ReactNode> = {
  voiture: <Car className="w-3 h-3" />,
  tramway: <TramFront className="w-3 h-3" />,
  velo:    null,
}

function initiales(nom: string) {
  return nom.split(' ').map(p => p[0] ?? '').join('').slice(0, 2).toUpperCase()
}

function couleurBarre(taux: number, seuil: number) {
  if (taux > 95) return '#EF4444'
  if (taux >= seuil) return '#F97316'
  return '#22C55E'
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

type SortKey = 'taux_desc' | 'nom' | 'dispo_desc'

interface Props {
  agents: ChargeAgent[]
  managerId: string
}

// Barre : échelle 0–125% du contrat.
// Le repère contrat est toujours à 80% de la piste (= 100/125).
const ECHELLE      = 125
const CONTRAT_X    = (100 / ECHELLE) * 100  // 80 %

export default function ChargeClient({ agents }: Props) {
  const router = useRouter()
  const [search, setSearch]       = useState('')
  const [modeFilter, setModeFilter] = useState<'tous' | 'voiture' | 'tramway'>('tous')
  const [sort, setSort]           = useState<SortKey>('taux_desc')

  const stats = useMemo(() => {
    const n = agents.length
    const moyRemplissage = n > 0 ? Math.round(agents.reduce((s, a) => s + a.taux_remplissage_pct, 0) / n) : 0
    const capaciteLibre  = Math.round(agents.reduce((s, a) => s + a.capacite_disponible, 0))
    const surcharge      = agents.filter(a => a.taux_remplissage_pct > 95).length
    return { n, moyRemplissage, capaciteLibre, surcharge }
  }, [agents])

  const filtered = useMemo(() => {
    let list = [...agents]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a => a.nom_complet.toLowerCase().includes(q))
    }
    if (modeFilter !== 'tous') {
      list = list.filter(a => a.mode_deplacement === modeFilter)
    }
    switch (sort) {
      case 'taux_desc':  list.sort((a, b) => b.taux_remplissage_pct - a.taux_remplissage_pct); break
      case 'nom':        list.sort((a, b) => a.nom_complet.localeCompare(b.nom_complet)); break
      case 'dispo_desc': list.sort((a, b) => b.capacite_disponible - a.capacite_disponible); break
    }
    return list
  }, [agents, search, modeFilter, sort])

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-[#0A2E5A] text-white px-6 py-8 md:px-10">
        <p className="text-xs text-blue-300 uppercase tracking-widest mb-1">Manager</p>
        <h1 className="text-2xl font-bold">Charge des agents</h1>
        <p className="text-blue-300 text-sm mt-1">Semaine courante — capacité &amp; disponibilité</p>
      </div>

      <div className="px-4 md:px-10 py-6 max-w-5xl mx-auto space-y-6">

        {/* Cartes stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Agents actifs" value={String(stats.n)} color="#0A2E5A" />
          <StatCard
            label="Remplissage moyen"
            value={`${stats.moyRemplissage}%`}
            color={stats.moyRemplissage > 95 ? '#EF4444' : stats.moyRemplissage > 80 ? '#F97316' : '#22C55E'}
          />
          <StatCard
            label="Capacité libre"
            value={`${stats.capaciteLibre}h`}
            sub="sur la semaine"
            color="#0BBFBF"
          />
          <StatCard
            label="En surcharge"
            value={String(stats.surcharge)}
            sub="> 95% de remplissage"
            color={stats.surcharge > 0 ? '#EF4444' : '#22C55E'}
          />
        </div>

        {/* Barre recherche + filtres + tri */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un agent…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition"
            />
          </div>
          <div className="flex gap-1.5">
            {(['tous', 'voiture', 'tramway'] as const).map(m => (
              <button key={m}
                onClick={() => setModeFilter(m)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  modeFilter === m ? 'bg-[#0A2E5A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {m === 'tous' ? 'Tous' : m === 'voiture' ? <span className="flex items-center gap-1"><Car className="w-3.5 h-3.5" />Voiture</span> : <span className="flex items-center gap-1"><TramFront className="w-3.5 h-3.5" />Tramway</span>}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] transition">
            <option value="taux_desc">Charge décroissante</option>
            <option value="nom">Nom A→Z</option>
            <option value="dispo_desc">Dispo décroissante</option>
          </select>
        </div>

        {/* Liste agents */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-sm">
              Aucun agent trouvé
            </div>
          )}
          {filtered.map(agent => {
            const taux    = Math.round(agent.taux_remplissage_pct)
            const seuil   = Math.round(agent.seuil_cible_pct)
            const contrat = Math.round(agent.capacite_theorique)
            const dispo   = Math.round(agent.capacite_disponible)

            // heures_programmées = tout ce qui occupe le contrat cette semaine
            const heuresProg = Math.round(
              agent.heures_nettoyage + agent.heures_trajets_est +
              agent.heures_conges   + agent.heures_absences
            )
            const heuresSup  = Math.max(0, heuresProg - contrat)
            const couleur    = couleurBarre(taux, seuil)
            const indisponible = dispo <= 0

            // Largeurs des segments (en % de la piste, échelle 0–125%)
            const tauxCap   = Math.min(taux, ECHELLE)
            const largNorm  = (Math.min(taux, 100) / ECHELLE) * 100  // portion seuil-colorée
            const largSup   = (Math.max(0, tauxCap - 100) / ECHELLE) * 100  // portion rouge foncé
            const posCharge = (tauxCap / ECHELLE) * 100    // position du label "↑ Xh"
            const posSeuil  = (Math.min(seuil, ECHELLE) / ECHELLE) * 100  // repère seuil

            // N'affiche le label "↑ Xh" que s'il ne chevauche pas le label "contrat"
            const showChargeLabel = Math.abs(posCharge - CONTRAT_X) > 9

            return (
              <div key={agent.agent_id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-start gap-4">

                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 mt-0.5"
                  style={{ background: indisponible ? '#94A3B8' : 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
                  {initiales(agent.nom_complet)}
                </div>

                {/* Zone centrale : nom + barre */}
                <div className="flex-1 min-w-0">

                  {/* Nom + badges */}
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm truncate">{agent.nom_complet}</span>
                    {agent.mode_deplacement && (
                      <span className="text-slate-500">{MODE_ICONS[agent.mode_deplacement] ?? null}</span>
                    )}
                    {agent.secteur_libelle && (
                      <span className="text-xs text-slate-400 truncate hidden md:block">· {agent.secteur_libelle}</span>
                    )}
                    {agent.binome_nom && (
                      <span className="text-xs px-1.5 py-0.5 bg-[#0BBFBF]/10 text-[#0BBFBF] rounded-full font-medium whitespace-nowrap">
                        + {agent.binome_nom}
                      </span>
                    )}
                    {indisponible && (
                      <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">Indisponible</span>
                    )}
                  </div>

                  {/* Sous-titre binôme */}
                  {agent.binome_nom && (() => {
                    const contratsOk = agent.binome_heures_hebdo === contrat
                    return contratsOk ? (
                      <p className="text-xs text-[#0BBFBF] mb-1">
                        Binôme · {agent.nom_complet.split(' ')[0]} + {agent.binome_nom.split(' ')[0]}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 mb-1">
                        ⚠️ Contrats différents ({contrat}h vs {agent.binome_heures_hebdo}h)
                      </p>
                    )
                  })()}

                  {/* ── Barres de charge ── */}
                  <div className="relative mt-2 mb-6">

                    {/* Piste */}
                    <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
                      {/* Segment normal (couleur seuil) */}
                      <div
                        className="absolute left-0 top-0 h-full transition-all duration-300"
                        style={{
                          width: `${largNorm}%`,
                          backgroundColor: couleur,
                          borderRadius: largSup > 0 ? '9999px 0 0 9999px' : '9999px',
                        }}
                      />
                      {/* Segment heures sup (rouge foncé) */}
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

                    {/* Repère contrat (trait plein) */}
                    <div
                      className="absolute w-0.5 bg-slate-400 pointer-events-none z-10"
                      style={{ left: `${CONTRAT_X}%`, top: -4, height: 20 }}
                    />

                    {/* Repère seuil individuel (pointillé) */}
                    <div
                      className="absolute w-px pointer-events-none z-10"
                      style={{
                        left: `${posSeuil}%`,
                        top: -4,
                        height: 20,
                        background: 'repeating-linear-gradient(to bottom,#94A3B8 0,#94A3B8 3px,transparent 3px,transparent 6px)',
                      }}
                    />

                    {/* Labels sous la barre */}
                    <div className="absolute left-0 right-0 text-[10px] leading-tight" style={{ top: 18 }}>
                      {/* ↑ Xh à la position de charge — uniquement sans dépassement */}
                      {heuresSup === 0 && showChargeLabel && (
                        <span
                          className="absolute -translate-x-1/2 text-slate-500 whitespace-nowrap"
                          style={{ left: `${posCharge}%` }}
                        >
                          ↑ {heuresProg}h
                        </span>
                      )}
                      {/* Xh contrat au repère 80% */}
                      <span
                        className="absolute -translate-x-1/2 text-slate-400 whitespace-nowrap"
                        style={{ left: `${CONTRAT_X}%` }}
                      >
                        {contrat}h contrat
                      </span>
                      {/* En dépassement : label fusionné "Xh prog (+Xh sup)" à droite */}
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

                  {/* Barre 2 — heures réalisées (journées validées) */}
                  {agent.heures_realisees !== null && agent.heures_realisees > 0 && (() => {
                    const realisees  = agent.heures_realisees
                    const tauxReel   = Math.round((realisees / contrat) * 100)
                    const largReel   = Math.min(tauxReel, ECHELLE) / ECHELLE * 100
                    const delta      = contrat - realisees
                    const couleurReel = tauxReel > 95 ? '#A32D2D' : tauxReel >= seuil ? '#BA7517' : '#3B6D11'
                    return (
                      <div className="mt-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] text-slate-400">Réalisé</span>
                          <span className="text-[10px] text-slate-600 font-medium">
                            {Math.round(realisees * 10) / 10}h validées
                          </span>
                          {delta > 0.5 && (
                            <span className="text-[10px] font-medium ml-auto" style={{ color: '#A32D2D' }}>
                              △ {Math.round(delta * 10) / 10}h non prod.
                            </span>
                          )}
                        </div>
                        <div className="relative h-1.5 bg-[#F1EFE8] rounded-full">
                          <div
                            className="absolute w-px pointer-events-none"
                            style={{ left: `${CONTRAT_X}%`, top: -2, bottom: -2, background: '#94928A' }}
                          />
                          <div
                            className="absolute left-0 top-0 h-full rounded-full transition-all duration-300"
                            style={{ width: `${largReel}%`, backgroundColor: couleurReel }}
                          />
                        </div>
                      </div>
                    )
                  })()}

                  {/* Mode sous la barre */}
                  <p className="text-xs text-slate-400">
                    {agent.mode_deplacement ? (MODE_LABELS[agent.mode_deplacement] ?? '') : 'Mode non défini'}
                    {' · '}seuil {seuil}%
                  </p>
                </div>

                {/* Colonne droite : taux + ratio + dispo */}
                <div className="text-right shrink-0 min-w-[64px]">
                  <p className="font-bold text-base" style={{ color: couleur }}>{taux}%</p>
                  <p className="text-xs font-medium text-slate-600">{heuresProg}h / {contrat}h</p>
                  <p className="text-xs text-slate-400">{dispo}h libres</p>
                </div>

                {/* Bouton détail */}
                <button
                  onClick={() => router.push(`/manager/charge/${agent.agent_id}`)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-[#0A2E5A] hover:text-white transition-all shrink-0 mt-0.5"
                  aria-label={`Détail de ${agent.nom_complet}`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
