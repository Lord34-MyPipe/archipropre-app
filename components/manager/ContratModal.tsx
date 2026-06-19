'use client'

import { useState, useEffect } from 'react'
import type { Residence } from '@/lib/types'

const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_LABELS: Record<string, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer',
  jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

function todayStr() { return new Date().toISOString().split('T')[0] }
function in12Months() {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

export interface Creneau {
  jours: string[]
  heure_debut: string
  heure_fin: string
  label?: string
}

function formatCreneau(c: Creneau): string {
  const jours = c.jours.map(j => JOURS_LABELS[j] ?? j).join(', ')
  return `${jours} · ${c.heure_debut} – ${c.heure_fin}`
}

interface Props {
  residence: Residence
  onClose: () => void
  onSaved?: () => void
}

export default function ContratModal({ residence, onClose, onSaved }: Props) {
  // Contrat fields
  const [contratId, setContratId]                   = useState<string | null>(null)
  const [dateDebut, setDateDebut]                   = useState(todayStr())
  const [dateFin, setDateFin]                       = useState(in12Months())
  const [montant, setMontant]                       = useState('')
  const [nbInterventionsMois, setNbInterventionsMois] = useState<number>(4)
  const [joursInterdits, setJoursInterdits]         = useState<string[]>([])
  const [creneaux, setCreneaux]                     = useState<Creneau[]>([])
  const [notes, setNotes]                           = useState('')

  // Taux horaire facturation
  const [tauxMode, setTauxMode]           = useState<'base' | 'specifique'>('base')
  const [tauxSpecifique, setTauxSpecifique] = useState('')
  const [tauxBase, setTauxBase]           = useState<number>(25)

  // Fréquence estimée (indicateur, depuis tâches hebdo)
  const [freqEstimee, setFreqEstimee] = useState<number | null>(null)

  // Formulaire ajout créneau
  const [showAddForm, setShowAddForm] = useState(false)
  const [newJours, setNewJours]       = useState<string[]>([])
  const [newDebut, setNewDebut]       = useState('08:00')
  const [newFin, setNewFin]           = useState('12:00')

  // UI
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/contrats?residenceId=${residence.id}`).then(r => r.json()),
      fetch(`/api/taches-template?residenceId=${residence.id}&frequenceType=hebdo`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([contratJson, tachesJson]) => {
      const contrat = contratJson.data

      // Taux Base depuis la réponse enrichie
      if (contratJson.tauxBase != null) setTauxBase(contratJson.tauxBase)

      if (contrat) {
        setContratId(contrat.id)
        setDateDebut(contrat.date_debut)
        setDateFin(contrat.date_fin)
        setMontant(contrat.montant_mensuel != null ? String(contrat.montant_mensuel) : '')
        setNbInterventionsMois(contrat.nb_interventions_mois ?? 4)
        setJoursInterdits(contrat.jours_interdits ?? [])
        setCreneaux(contrat.creneaux_acceptes ?? [])
        setNotes(contrat.notes_specifiques ?? '')
        // Taux facturation
        if (contrat.taux_horaire_facturation != null) {
          setTauxMode('specifique')
          setTauxSpecifique(String(contrat.taux_horaire_facturation))
        } else {
          setTauxMode('base')
        }
        setSaved(true)
      }

      // Fréquence estimée depuis tâches hebdo — indicateur seulement
      const taches: Array<{ jours_semaine: string[] }> = tachesJson.data ?? []
      if (taches.length > 0) {
        const joursUniques = new Set(taches.flatMap(t => t.jours_semaine ?? []))
        setFreqEstimee(Math.round(joursUniques.size * 4.3))
      }
      setLoading(false)
    })
  }, [residence.id])

  // ── Calcul heures vendues (live) ──────────────────────────────────────────
  const montantNum     = parseFloat(montant) || 0
  const tauxEffectif   = tauxMode === 'base' ? tauxBase : (parseFloat(tauxSpecifique) || 0)
  const heuresMois     = montantNum > 0 && tauxEffectif > 0 ? Math.round(montantNum / tauxEffectif) : null
  const heuresPassage  = heuresMois !== null && nbInterventionsMois > 0
    ? Math.round((heuresMois / nbInterventionsMois) * 10) / 10
    : null

  function toggleJour(jour: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(jour) ? list.filter(j => j !== jour) : [...list, jour])
  }

  function addCreneau() {
    if (newJours.length === 0) return
    setCreneaux(prev => [...prev, { jours: [...newJours], heure_debut: newDebut, heure_fin: newFin }])
    setNewJours([])
    setNewDebut('08:00')
    setNewFin('12:00')
    setShowAddForm(false)
    setSaved(false)
  }

  function removeCreneau(idx: number) {
    setCreneaux(prev => prev.filter((_, i) => i !== idx))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const res = await fetch('/api/contrats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residenceId: residence.id,
        contratId,
        dateDebut, dateFin,
        montantMensuel:         montant || null,
        nbInterventionsMois:    nbInterventionsMois,
        tauxHoraireFacturation: tauxMode === 'specifique' && tauxSpecifique
          ? Number(tauxSpecifique)
          : null,
        joursInterdits,
        creneauxAcceptes: creneaux,
        notesSpecifiques: notes || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); return }
    setContratId(json.data.id)
    setSaved(true)
    onSaved?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[93vh]">

        <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full"/>
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">
                {contratId ? 'Modifier le contrat' : 'Créer le contrat'}
              </h3>
              <p className="text-sm text-slate-500 mt-0.5 truncate">{residence.nom}</p>
            </div>
            {saved && (
              <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs rounded-full font-semibold shrink-0">
                ✓ Enregistré
              </span>
            )}
          </div>
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse"/>)}
            </div>
          ) : (
            <div className="space-y-5">

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Début contrat
                  </label>
                  <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Fin contrat
                  </label>
                  <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                </div>
              </div>

              {/* Montant mensuel */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Montant mensuel HT (€)
                </label>
                <input type="number" value={montant} onChange={e => { setMontant(e.target.value); setSaved(false) }}
                  placeholder="Ex : 350"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
              </div>

              {/* Interventions facturées / mois — valeur contractuelle */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Interventions facturées / mois
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number" min={1} max={31}
                    value={nbInterventionsMois}
                    onChange={e => { setNbInterventionsMois(Math.max(1, Number(e.target.value))); setSaved(false) }}
                    className="w-24 px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"
                  />
                  {freqEstimee !== null && (
                    <span className="text-xs text-slate-400 italic">
                      ~{freqEstimee}/mois estimé d&apos;après les tâches
                    </span>
                  )}
                </div>
              </div>

              {/* Taux horaire de facturation */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Taux horaire facturé (€/h)
                </label>
                {/* Toggle Base / Spécifique */}
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => { setTauxMode('base'); setSaved(false) }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      tauxMode === 'base'
                        ? 'bg-[#0A2E5A] text-white border-[#0A2E5A]'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Taux Base société
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTauxMode('specifique'); setSaved(false) }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      tauxMode === 'specifique'
                        ? 'bg-[#0BBFBF] text-white border-[#0BBFBF]'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Taux spécifique
                  </button>
                </div>

                {tauxMode === 'base' ? (
                  <div className="w-full px-3 py-2.5 border border-slate-100 bg-slate-50 rounded-xl text-sm text-slate-500 flex items-center justify-between">
                    <span>Taux Base société</span>
                    <span className="font-semibold text-slate-700">{tauxBase} €/h</span>
                  </div>
                ) : (
                  <input
                    type="number" min={1} step={0.5}
                    value={tauxSpecifique}
                    onChange={e => { setTauxSpecifique(e.target.value); setSaved(false) }}
                    placeholder={`Ex : ${tauxBase}`}
                    className="w-full px-3 py-2.5 border border-[#0BBFBF]/40 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"
                  />
                )}
              </div>

              {/* Heures vendues — calcul live */}
              {heuresMois !== null && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1.5">
                    Heures vendues
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-blue-700">{heuresMois} h</span>
                    <span className="text-sm text-blue-500">/ mois</span>
                  </div>
                  {heuresPassage !== null && (
                    <p className="text-xs text-blue-500 mt-0.5">
                      soit <span className="font-semibold">{heuresPassage} h</span> par passage
                      {' '}({nbInterventionsMois} interventions × {tauxEffectif} €/h)
                    </p>
                  )}
                </div>
              )}

              {/* Créneaux acceptés */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Créneaux d'intervention acceptés
                </p>

                {creneaux.length === 0 && !showAddForm && (
                  <p className="text-xs text-slate-400 italic mb-2">Aucun créneau défini — fallback 08:00 à la génération.</p>
                )}

                {/* Liste des créneaux */}
                <div className="space-y-1.5 mb-2">
                  {creneaux.map((c, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 bg-[#0BBFBF]/5 border border-[#0BBFBF]/20 rounded-xl">
                      <span className="text-sm text-slate-700 font-medium">{formatCreneau(c)}</span>
                      <button
                        type="button"
                        onClick={() => removeCreneau(idx)}
                        className="ml-2 w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                        aria-label="Supprimer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Mini-formulaire ajout créneau */}
                {showAddForm ? (
                  <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-slate-50">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Jours</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {JOURS.map(j => (
                          <button
                            key={j}
                            type="button"
                            onClick={() => toggleJour(j, newJours, setNewJours)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              newJours.includes(j)
                                ? 'bg-[#0BBFBF] text-white'
                                : 'bg-white border border-slate-200 text-slate-500 hover:border-[#0BBFBF]/40'
                            }`}
                          >
                            {JOURS_LABELS[j]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Début</label>
                        <input type="time" value={newDebut} onChange={e => setNewDebut(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 bg-white"/>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Fin</label>
                        <input type="time" value={newFin} onChange={e => setNewFin(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 bg-white"/>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowAddForm(false)}
                        className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-white">
                        Annuler
                      </button>
                      <button type="button" onClick={addCreneau} disabled={newJours.length === 0}
                        className="flex-1 py-2 rounded-xl bg-[#0BBFBF] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#0BBFBF]/90">
                        Ajouter
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-1.5 text-sm font-semibold text-[#0BBFBF] hover:text-[#0BBFBF]/80 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                    </svg>
                    Ajouter un créneau
                  </button>
                )}
              </div>

              {/* Jours interdits */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Jours interdits (client)
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {JOURS.map(j => {
                    const isChecked = joursInterdits.includes(j)
                    return (
                      <button
                        key={j}
                        type="button"
                        onClick={() => toggleJour(j, joursInterdits, setJoursInterdits)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isChecked
                            ? 'bg-[#0A2E5A] text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {JOURS_LABELS[j]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Notes spécifiques client
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Instructions particulières, accès, codes…"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 resize-none"
                />
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            {saved ? 'Fermer' : 'Annuler'}
          </button>
          <button onClick={handleSave} disabled={saving || loading}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            {saving
              ? (contratId ? 'Mise à jour…' : 'Enregistrement…')
              : (saved ? 'Mettre à jour' : 'Enregistrer le contrat')
            }
          </button>
        </div>
      </div>
    </div>
  )
}
