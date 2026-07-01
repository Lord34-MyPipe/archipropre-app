'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Bot, FileText, Clock, AlertTriangle } from 'lucide-react'
import AlerteReorganisationButton from './AlerteReorganisationButton'
import type { Alerte } from '@/lib/types'

interface ScanManquant {
  id: string
  agent_id: string
  heure_debut_prevue: string
  residence_id: string
  residences: { nom: string } | null
  prenom: string
  nom: string
  retardMin: number
}

interface RapportEnRetard {
  id: string
  agent_id: string
  heure_fin_prevue: string
  residences: { nom: string } | null
}

interface Props {
  scanManquants: ScanManquant[]
  rapportsEnRetard: RapportEnRetard[]
  alertes: Alerte[]
  kpis: { pointsAttention: number; scansEffectues: number }
}

function formatTs(iso: string): string {
  const date = new Date(iso)
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH}h`
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mn = String(date.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}h${mn}`
}

function groupBy<T>(arr: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of arr) {
    const k = key(item)
    const existing = map.get(k)
    if (existing) existing.push(item)
    else map.set(k, [item])
  }
  return map
}

export default function DashboardAlertes({ scanManquants, rapportsEnRetard, alertes, kpis }: Props) {
  const router = useRouter()

  const alertesUrgentes = alertes.filter(a => a.type !== 'reorganisation_proposee' && a.type !== 'rapport_soumis')
  const alertesANA      = alertes.filter(a => a.type === 'reorganisation_proposee')
  const alertesRapport  = alertes.filter(a => a.type === 'rapport_soumis')
  const toutesLesAlertes = [...alertesUrgentes, ...alertesANA, ...alertesRapport]

  const toutVaBien = kpis.pointsAttention === 0 && alertesUrgentes.length === 0

  async function marquerLue(alerteId: string) {
    await fetch(`/api/alertes/${alerteId}/lue`, { method: 'PATCH' })
    router.refresh()
  }

  async function marquerToutesLues() {
    await Promise.all(toutesLesAlertes.map(a => fetch(`/api/alertes/${a.id}/lue`, { method: 'PATCH' })))
    router.refresh()
  }

  // Grouper les alertes urgentes par type
  const urgentesParType = groupBy(alertesUrgentes, a => a.type)

  if (toutVaBien) {
    return (
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3 border"
        style={{ background: '#EAF3DE', borderColor: '#B5D88A' }}>
        <span className="text-xl shrink-0" style={{ color: '#3B6D11' }}>✓</span>
        <div>
          <p className="font-medium text-sm" style={{ color: '#3B6D11' }}>Tout se passe bien</p>
          <p className="text-xs" style={{ color: '#5A8F2A' }}>
            {kpis.scansEffectues} scan{kpis.scansEffectues > 1 ? 's' : ''} effectué{kpis.scansEffectues > 1 ? 's' : ''} · 0 retard
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {/* Bloc rouge — scans manquants */}
      {scanManquants.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-50 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"/>
            <p className="text-sm font-semibold text-red-700">
              {scanManquants.length} scan{scanManquants.length > 1 ? 's' : ''} manquant{scanManquants.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-red-50">
            {scanManquants.map(i => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xs font-bold shrink-0">
                  {i.prenom[0]}{i.nom[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {i.prenom} {i.nom} · {i.residences?.nom ?? '—'}
                  </p>
                  <p className="text-xs text-red-600">
                    Retard de {i.retardMin} min · prévu à {i.heure_debut_prevue.slice(0, 5)}
                  </p>
                </div>
                <a
                  href={`tel:`}
                  className="shrink-0 px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-xl hover:bg-red-600 transition-colors"
                >
                  Contacter
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bloc amber — alertes ANA + rapports en retard + rapports soumis + divers */}
      {(alertesANA.length > 0 || rapportsEnRetard.length > 0 || alertesRapport.length > 0 || alertesUrgentes.length > 0) && (
        <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"/>
              <p className="text-sm font-semibold text-amber-700">Points d'attention</p>
            </div>
            {toutesLesAlertes.length > 0 && (
              <button
                onClick={marquerToutesLues}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors whitespace-nowrap"
              >
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="divide-y divide-amber-50">

            {/* Alertes ANA réorganisation */}
            {alertesANA.map(al => (
              <div key={al.id} className="flex items-start gap-3 px-4 py-3">
                <Bot className="w-5 h-5 mt-0.5 shrink-0 text-amber-600" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-amber-800">Réorganisation requise</p>
                    <span className="text-[10px] text-slate-400">{formatTs(al.envoyee_at)}</span>
                  </div>
                  <p className="text-xs text-amber-700 mt-0.5 line-clamp-2">{al.message}</p>
                </div>
                <AlerteReorganisationButton
                  alerteId={al.id}
                  message={al.message ?? ''}
                  metadata={al.metadata}
                />
              </div>
            ))}

            {/* Rapports soumis */}
            {alertesRapport.map(al => (
              <div key={al.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="w-5 h-5 shrink-0 text-slate-400" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">Rapport soumis</p>
                    <span className="text-[10px] text-slate-400">{formatTs(al.envoyee_at)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{al.message}</p>
                </div>
                {al.intervention_id && (
                  <Link
                    href={`/manager/interventions/${al.intervention_id}/rapport`}
                    onClick={() => marquerLue(al.id)}
                    className="shrink-0 text-xs font-semibold whitespace-nowrap hover:underline"
                    style={{ color: '#0BBFBF' }}
                  >
                    Voir →
                  </Link>
                )}
              </div>
            ))}

            {/* Rapports en retard */}
            {rapportsEnRetard.map(i => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3">
                <Clock className="w-5 h-5 shrink-0 text-amber-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">Rapport en retard</p>
                  <p className="text-xs text-slate-500 truncate">
                    {i.residences?.nom ?? '—'} · fin prévue {i.heure_fin_prevue.slice(0, 5)}
                  </p>
                </div>
              </div>
            ))}

            {/* Alertes urgentes groupées par type */}
            {[...urgentesParType.entries()].map(([type, group]) => (
              <div key={type}>
                {group.length > 1 ? (
                  /* groupe de plusieurs alertes du même type */
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800">
                            {type.replace(/_/g, ' ')}
                          </p>
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                            ×{group.length}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{formatTs(group[0].envoyee_at)}</p>
                      </div>
                      <button
                        onClick={() => Promise.all(group.map(a => marquerLue(a.id)))}
                        className="shrink-0 text-xs text-slate-400 hover:text-slate-600"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="mt-2 ml-8 space-y-1">
                      {group.map(al => (
                        <p key={al.id} className="text-xs text-slate-500 truncate">{al.message}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* alerte unique */
                  <div className="flex items-center gap-3 px-4 py-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-800">{type.replace(/_/g, ' ')}</p>
                        <span className="text-[10px] text-slate-400">{formatTs(group[0].envoyee_at)}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{group[0].message}</p>
                    </div>
                    <button
                      onClick={() => marquerLue(group[0].id)}
                      className="shrink-0 text-xs text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}

          </div>
        </div>
      )}
    </div>
  )
}
