'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { ChargeAgent } from './page'

const MODE_LABELS: Record<string, string> = {
  voiture:  'Voiture',
  tramway:  'Tramway',
  velo:     'Vélo/Scooter',
}
const MODE_ICONS: Record<string, string> = {
  voiture:  '🚗',
  tramway:  '🚊',
  velo:     '🛵',
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

export default function ChargeClient({ agents }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState<'tous' | 'voiture' | 'tramway'>('tous')
  const [sort, setSort] = useState<SortKey>('taux_desc')

  // Stats globales
  const stats = useMemo(() => {
    const n = agents.length
    const moyRemplissage = n > 0 ? Math.round(agents.reduce((s, a) => s + a.taux_remplissage_pct, 0) / n) : 0
    const capaciteLibre = Math.round(agents.reduce((s, a) => s + a.capacite_disponible, 0))
    const surcharge = agents.filter(a => a.taux_remplissage_pct > 95).length
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
      case 'taux_desc':    list.sort((a, b) => b.taux_remplissage_pct - a.taux_remplissage_pct); break
      case 'nom':          list.sort((a, b) => a.nom_complet.localeCompare(b.nom_complet)); break
      case 'dispo_desc':   list.sort((a, b) => b.capacite_disponible - a.capacite_disponible); break
    }
    return list
  }, [agents, search, modeFilter, sort])

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-[#0A2E5A] text-white px-6 py-8 md:px-10">
        <p className="text-xs text-blue-300 uppercase tracking-widest mb-1">Manager</p>
        <h1 className="text-2xl font-bold">Charge des agents</h1>
        <p className="text-blue-300 text-sm mt-1">Semaine courante — capacité & disponibilité</p>
      </div>

      <div className="px-4 md:px-10 py-6 max-w-5xl mx-auto space-y-6">

        {/* Cartes stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Agents" value={String(stats.n)} color="#0A2E5A" />
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

        {/* Barre de recherche + filtres + tri */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-3">
          {/* Recherche */}
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

          {/* Filtres mode */}
          <div className="flex gap-1.5">
            {(['tous', 'voiture', 'tramway'] as const).map(m => (
              <button key={m}
                onClick={() => setModeFilter(m)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  modeFilter === m
                    ? 'bg-[#0A2E5A] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}>
                {m === 'tous' ? 'Tous' : m === 'voiture' ? '🚗 Voiture' : '🚊 Tramway'}
              </button>
            ))}
          </div>

          {/* Tri */}
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
            const taux = Math.round(agent.taux_remplissage_pct)
            const seuil = Math.round(agent.seuil_cible_pct)
            const dispo = Math.round(agent.capacite_disponible)
            const couleur = couleurBarre(taux, seuil)
            const indisponible = dispo <= 0

            return (
              <div key={agent.agent_id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-4">

                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ background: indisponible ? '#94A3B8' : 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
                  {initiales(agent.nom_complet)}
                </div>

                {/* Infos + barre */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm truncate">{agent.nom_complet}</span>
                    {agent.mode_deplacement && (
                      <span className="text-xs text-slate-500">
                        {MODE_ICONS[agent.mode_deplacement] ?? ''}
                      </span>
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
                  {agent.binome_nom && (
                    <p className="text-xs text-[#0BBFBF] mb-1">Binôme · {agent.nom_complet.split(' ')[0]} + {agent.binome_nom.split(' ')[0]}</p>
                  )}

                  {/* Barre de progression */}
                  <div className="relative h-2.5 bg-slate-100 rounded-full overflow-visible">
                    {/* Barre remplie */}
                    <div
                      className="absolute left-0 top-0 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(taux, 100)}%`, backgroundColor: couleur }}
                    />
                    {/* Repère seuil cible (pointillé vertical) */}
                    <div
                      className="absolute top-[-3px] bottom-[-3px] w-px"
                      style={{
                        left: `${seuil}%`,
                        background: 'repeating-linear-gradient(to bottom, #64748B 0px, #64748B 3px, transparent 3px, transparent 6px)',
                      }}
                    />
                  </div>

                  {/* Légende sous la barre */}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">
                      {agent.mode_deplacement ? MODE_LABELS[agent.mode_deplacement] ?? '' : 'Mode non défini'}
                    </span>
                    <span className="text-xs text-slate-400">seuil {seuil}%</span>
                  </div>
                </div>

                {/* Taux + dispo */}
                <div className="text-right shrink-0">
                  <p className="font-bold text-base" style={{ color: couleur }}>{taux}%</p>
                  <p className="text-xs text-slate-400">{dispo}h libres</p>
                </div>

                {/* Bouton détail */}
                <button
                  onClick={() => router.push(`/manager/charge/${agent.agent_id}`)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-[#0A2E5A] hover:text-white transition-all shrink-0">
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
