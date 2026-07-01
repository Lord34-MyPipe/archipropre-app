'use client'

import type { ReactNode } from 'react'
import { ClipboardList, Smartphone, CheckCircle2, AlertCircle } from 'lucide-react'

interface KPIs {
  totalJour: number
  scansEffectues: number
  rapportsRecus: number
  pointsAttention: number
}

interface Tuile {
  label: string
  value: number
  total?: number
  sub?: string
  icon: ReactNode
  bg: string
  textColor: string
}

export default function DashboardKPIs({ kpis }: { kpis: KPIs }) {
  const toutesScanne = kpis.totalJour > 0 && kpis.scansEffectues === kpis.totalJour

  const tuiles: Tuile[] = [
    {
      label: 'Interventions',
      value: kpis.totalJour,
      sub: "aujourd'hui",
      icon: <ClipboardList className="w-5 h-5 text-slate-400" />,
      bg: 'bg-white',
      textColor: 'text-slate-800',
    },
    {
      label: 'Scans effectués',
      value: kpis.scansEffectues,
      total: kpis.totalJour,
      icon: <Smartphone className="w-5 h-5 text-slate-400" style={toutesScanne ? { color: 'rgb(21 128 61)' } : undefined} />,
      bg: toutesScanne ? 'bg-green-50' : 'bg-white',
      textColor: toutesScanne ? 'text-green-700' : 'text-slate-800',
    },
    {
      label: 'Rapports reçus',
      value: kpis.rapportsRecus,
      total: kpis.totalJour,
      icon: <CheckCircle2 className="w-5 h-5 text-slate-400" />,
      bg: 'bg-white',
      textColor: 'text-slate-800',
    },
    {
      label: "Points d'attention",
      value: kpis.pointsAttention,
      sub: kpis.pointsAttention === 0 ? 'aucun' : 'à traiter',
      icon: kpis.pointsAttention === 0
        ? <CheckCircle2 className="w-5 h-5 text-green-600" />
        : <AlertCircle className="w-5 h-5 text-red-500" />,
      bg: kpis.pointsAttention === 0 ? 'bg-green-50' : 'bg-red-50',
      textColor: kpis.pointsAttention === 0 ? 'text-green-700' : 'text-red-700',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tuiles.map(t => (
        <div key={t.label} className={`${t.bg} rounded-2xl p-4 border border-slate-100`}>
          {t.icon}
          <p className={`text-3xl font-bold mt-2 ${t.textColor}`}>
            {t.value}
            {t.total !== undefined && t.total > 0 && (
              <span className="text-lg font-medium text-slate-400">/{t.total}</span>
            )}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{t.label}</p>
          {t.sub && <p className="text-xs text-slate-400">{t.sub}</p>}
        </div>
      ))}
    </div>
  )
}
