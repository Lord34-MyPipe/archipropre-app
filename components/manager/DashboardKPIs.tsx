'use client'

interface KPIs {
  totalJour: number
  scansEffectues: number
  rapportsRecus: number
  pointsAttention: number
}

export default function DashboardKPIs({ kpis }: { kpis: KPIs }) {
  const toutesScanne = kpis.totalJour > 0 && kpis.scansEffectues === kpis.totalJour

  const tuiles = [
    {
      label: 'Interventions',
      value: kpis.totalJour,
      sub: 'aujourd\'hui',
      icon: '📋',
      bg: 'bg-white',
      textColor: 'text-slate-800',
    },
    {
      label: 'Scans effectués',
      value: kpis.scansEffectues,
      sub: `/ ${kpis.totalJour}`,
      icon: '📱',
      bg: toutesScanne ? 'bg-green-50' : 'bg-white',
      textColor: toutesScanne ? 'text-green-700' : 'text-slate-800',
    },
    {
      label: 'Rapports reçus',
      value: kpis.rapportsRecus,
      sub: `/ ${kpis.totalJour}`,
      icon: '✅',
      bg: 'bg-white',
      textColor: 'text-slate-800',
    },
    {
      label: 'Points d\'attention',
      value: kpis.pointsAttention,
      sub: kpis.pointsAttention === 0 ? 'aucun' : 'à traiter',
      icon: kpis.pointsAttention === 0 ? '🟢' : '🔴',
      bg: kpis.pointsAttention === 0 ? 'bg-green-50' : 'bg-red-50',
      textColor: kpis.pointsAttention === 0 ? 'text-green-700' : 'text-red-700',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tuiles.map(t => (
        <div key={t.label} className={`${t.bg} rounded-2xl p-4 border border-slate-100`}>
          <span className="text-2xl">{t.icon}</span>
          <p className={`text-3xl font-bold mt-2 ${t.textColor}`}>{t.value}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t.label}</p>
          <p className="text-xs text-slate-400">{t.sub}</p>
        </div>
      ))}
    </div>
  )
}
