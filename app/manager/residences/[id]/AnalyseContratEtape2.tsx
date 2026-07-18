'use client'

import { useState } from 'react'
import type { IdentiteContrat, AnalyseIA, Creneau } from './AnalyseContratWizard'

interface Props {
  residenceId: string
  identite: IdentiteContrat
  planningActuel: { creneaux: Creneau[]; minutesHebdoReelles: number }
  texteContrat: string
  onTexteChange: (v: string) => void
  contraintesLibres: string
  onContraintesChange: (v: string) => void
  onSuccess: (analyse: AnalyseIA, volumeHebdoMin: number, tauxEffectif: number) => void
}

export default function AnalyseContratEtape2({
  residenceId, identite, planningActuel, texteContrat, onTexteChange, contraintesLibres, onContraintesChange, onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleAnalyser() {
    if (!texteContrat.trim()) { setError('Collez le texte du contrat ou décrivez la prestation.'); return }
    setLoading(true)
    setError(null)
    try {
      const montantNum = parseFloat(identite.montant)
      const res = await fetch('/api/ia/analyse-contrat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residenceId,
          identite: {
            libelle:         identite.libelle,
            type_contrat:    identite.typeContrat,
            date_debut:      identite.dateDebut,
            date_fin:        identite.dateFin,
            montant_mensuel: Number.isFinite(montantNum) ? montantNum : null,
            taux_mode:       identite.tauxMode,
            taux_specifique: identite.tauxSpecifique ? parseFloat(identite.tauxSpecifique) : null,
            taux_base:       identite.tauxBase,
          },
          planningActuel: {
            jours:        [...new Set(planningActuel.creneaux.flatMap(c => c.jours))],
            creneaux:     planningActuel.creneaux,
            minutesHebdo: planningActuel.minutesHebdoReelles,
          },
          texteContrat,
          contraintesLibres: contraintesLibres.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erreur inconnue.'); setLoading(false); return }
      onSuccess(json.analyse as AnalyseIA, json.volumeHebdoMin as number, json.tauxEffectif as number)
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-5">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          Texte du contrat <span className="text-red-400">*</span>
        </label>
        <textarea
          rows={10}
          value={texteContrat}
          onChange={e => onTexteChange(e.target.value)}
          placeholder="Collez le texte du contrat ou décrivez la prestation"
          disabled={loading}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 disabled:opacity-60 resize-y"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          Contraintes particulières <span className="text-slate-400 font-normal normal-case">(optionnel)</span>
        </label>
        <textarea
          rows={3}
          value={contraintesLibres}
          onChange={e => onContraintesChange(e.target.value)}
          placeholder="ex. jamais le mercredi, containers sortis le dimanche soir"
          disabled={loading}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 disabled:opacity-60 resize-y"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={handleAnalyser}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
            Réessayer
          </button>
        </div>
      )}

      <button type="button" onClick={handleAnalyser} disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
        style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Analyse en cours…
          </>
        ) : 'Analyser'}
      </button>
    </div>
  )
}
