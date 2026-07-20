'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ORDRE_JOURS, type DispatchJour } from '@/lib/dispatchSemaine'

const JOURS_LABELS: Record<string, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
  jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

interface Props {
  open: boolean
  onClose: () => void
  residenceId: string
  contratId: string
  joursRamassageContainers: string[]
  plafondRentableMin: number
  tauxCible: number
}

function DispatchColonne({ titre, dispatch, loading, error }: {
  titre: string
  dispatch: DispatchJour[] | null
  loading?: boolean
  error?: string | null
}) {
  const jours = dispatch
    ? [...dispatch].sort((a, b) => ORDRE_JOURS.indexOf(a.jour) - ORDRE_JOURS.indexOf(b.jour))
    : []
  const totalMin = jours.reduce((s, j) => s + j.duree_totale_estimee_minutes, 0)

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{titre}</p>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : !dispatch || jours.length === 0 ? (
        <p className="text-sm text-slate-400 italic">Aucune répartition configurée.</p>
      ) : (
        <div className="space-y-2">
          {jours.map(j => (
            <div key={j.jour} className="border border-slate-200 rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-slate-700">{JOURS_LABELS[j.jour] ?? j.jour}</span>
                <span className="text-[11px] text-slate-500">{j.duree_totale_estimee_minutes} min</span>
              </div>
              <p className="text-xs text-slate-600">
                {j.batiments_complets.join(', ') || '—'}
              </p>
              {j.tournees_transverses.length > 0 && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  + {j.tournees_transverses.map(t => t.libelle).join(', ')}
                </p>
              )}
              {j.containers && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Containers : {j.containers === 'sortie' ? 'sortie' : 'rentrée'}
                </p>
              )}
            </div>
          ))}
          <p className="text-xs font-semibold text-slate-500 text-right pt-1">
            Total : {totalMin} min/semaine
          </p>
        </div>
      )}
    </div>
  )
}

export default function SimulationTauxRentablePanel({
  open, onClose, residenceId, contratId, joursRamassageContainers, plafondRentableMin, tauxCible,
}: Props) {
  const router = useRouter()
  const [actuel, setActuel]         = useState<DispatchJour[] | null>(null)
  const [proposal, setProposal]     = useState<DispatchJour[] | null>(null)
  const [alertesIA, setAlertesIA]   = useState<string[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  // Garde-fou (lecture seule, calculé serveur) : ne fait jamais confiance au
  // texte "alertes" de l'IA — violations recalculées déterministiquement à
  // partir des jours/zones/créneaux réels. null = pas encore chargé.
  const [violations, setViolations] = useState<string[] | null>(null)

  const [applying, setApplying]         = useState(false)
  const [applyErr, setApplyErr]         = useState<string | null>(null)
  const [applied, setApplied]           = useState(false)
  const [confirmApply, setConfirmApply] = useState(false)

  const [regenerating, setRegenerating]   = useState(false)
  const [regenerateMsg, setRegenerateMsg] = useState<string | null>(null)
  const [regenerateErr, setRegenerateErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setActuel(null)
    setProposal(null)
    setAlertesIA([])
    setViolations(null)
    setError(null)
    setApplied(false)
    setApplyErr(null)
    setConfirmApply(false)
    setLoading(true)
    fetch(`/api/residences/${residenceId}/contrats/${contratId}/dispatch/proposer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joursRamassageContainers, enveloppeMinutesHebdo: plafondRentableMin }),
    })
      .then(async r => {
        const json = await r.json()
        if (!r.ok) { setError(json.error ?? 'Erreur inconnue.'); return }
        // "Organisation actuelle" recalculée par le serveur (même règle que la
        // vraie génération de planning), jamais le texte libre stocké en base
        // (cf audit "540 min faux") — les deux colonnes viennent du même appel.
        setActuel(json.dispatch_actuel as DispatchJour[])
        setProposal(json.dispatch_semaine as DispatchJour[])
        setAlertesIA(json.alertes ?? [])
        setViolations(json.verification?.violations ?? [])
      })
      .catch(() => setError('Impossible de contacter le serveur.'))
      .finally(() => setLoading(false))
  }, [open, residenceId, contratId, plafondRentableMin, joursRamassageContainers])

  async function handleApplyConfirmed() {
    if (!proposal) return
    setApplying(true)
    setApplyErr(null)
    try {
      const res = await fetch(`/api/residences/${residenceId}/contrats/${contratId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatch_semaine: proposal }),
      })
      const json = await res.json()
      if (!res.ok) { setApplyErr(json.error ?? 'Erreur inconnue.'); setApplying(false); return }
      setApplied(true)
      setConfirmApply(false)
      router.refresh()
    } catch {
      setApplyErr('Impossible de contacter le serveur.')
    } finally {
      setApplying(false)
    }
  }

  async function handleRegenerer() {
    setRegenerating(true)
    setRegenerateErr(null)
    setRegenerateMsg(null)
    try {
      const res = await fetch('/api/planning/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceId, contratId }),
      })
      const json = await res.json()
      if (!res.ok) { setRegenerateErr(json.error ?? 'Erreur inconnue.'); setRegenerating(false); return }
      setRegenerateMsg(`${json.count} intervention${json.count !== 1 ? 's' : ''} générée${json.count !== 1 ? 's' : ''}.`)
    } catch {
      setRegenerateErr('Impossible de contacter le serveur.')
    } finally {
      setRegenerating(false)
    }
  }

  const hasViolations = (violations?.length ?? 0) > 0

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-40 transition-opacity" onClick={onClose} />

      {/* Panneau */}
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl w-full"
        style={{ maxWidth: 860 }}>

        {/* Header */}
        <div className="px-6 py-5 flex items-start justify-between shrink-0" style={{ background: '#0A2E5A' }}>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Simulation au taux rentable</h2>
            <p className="text-blue-300 text-sm mt-0.5">
              Enveloppe cible ({tauxCible} €/h) : {(plafondRentableMin / 60).toFixed(1)} h/semaine
            </p>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white mt-0.5 transition-colors" aria-label="Fermer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Garde-fou déterministe — prime sur le texte "alertes" de l'IA :
              si une règle R1/R3/R4/R5 est violée, c'est affiché ici, en rouge,
              et le bouton "Appliquer" est désactivé plus bas tant que ce n'est
              pas résolu (nouvelle proposition, ou correction manuelle du contrat). */}
          {hasViolations && (
            <div className="border border-red-300 bg-red-50 rounded-2xl p-4 space-y-1.5 mb-4">
              <p className="text-sm font-bold text-red-700">
                ⚠ Cette proposition ne respecte pas les règles de répartition — vérifiez avant d&apos;appliquer
              </p>
              <ul className="space-y-1">
                {violations!.map((v, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                    <span className="shrink-0 mt-0.5">✕</span><span>{v}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-600 pt-1">
                Relancez la simulation pour obtenir une nouvelle proposition, ou fermez ce panneau sans appliquer.
              </p>
            </div>
          )}

          {alertesIA.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-1.5 mb-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Alertes de la proposition</p>
              <ul className="space-y-1">
                {alertesIA.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                    <span className="shrink-0 mt-0.5">⚠</span><span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-5 flex-col sm:flex-row">
            <DispatchColonne titre="Organisation actuelle" dispatch={actuel} loading={loading} error={error} />
            <div className="hidden sm:block w-px bg-slate-100 shrink-0" />
            <DispatchColonne titre="Proposition au taux rentable" dispatch={proposal} loading={loading} error={error} />
          </div>

          {applyErr && <p className="text-xs text-red-600 mt-4">{applyErr}</p>}
          {applied && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
              ✓ Proposition appliquée à la répartition du contrat.
            </div>
          )}
          {applied && (
            <div className="mt-3 space-y-2">
              <button type="button" onClick={handleRegenerer} disabled={regenerating || !!regenerateMsg}
                className="w-full border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60">
                {regenerating ? 'Génération…' : regenerateMsg ? '✓ Planning régénéré' : 'Régénérer le planning'}
              </button>
              {regenerateMsg && <p className="text-xs text-blue-700 text-center">{regenerateMsg}</p>}
              {regenerateErr && <p className="text-xs text-red-600 text-center">{regenerateErr}</p>}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {!applied && (
          <div className="shrink-0 px-6 py-4 border-t border-slate-100">
            {!confirmApply ? (
              <div className="flex gap-3">
                <button type="button" onClick={onClose}
                  className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                  Annuler
                </button>
                <button type="button" onClick={() => setConfirmApply(true)} disabled={!proposal || loading || hasViolations}
                  title={hasViolations ? 'Proposition non conforme — corrigez ou relancez la simulation' : undefined}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                  style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
                  Appliquer cette proposition
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  Ceci remplace la répartition de semaine actuelle du contrat par la proposition simulée. Le planning existant ne sera pas régénéré automatiquement.
                </p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setConfirmApply(false)} disabled={applying}
                    className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
                    Retour
                  </button>
                  <button type="button" onClick={handleApplyConfirmed} disabled={applying}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition-opacity bg-red-600 hover:bg-red-700">
                    {applying ? 'Application…' : 'Confirmer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
