'use client'

import { useState, useEffect } from 'react'

interface Creneau {
  jours: string[]
  heure_debut: string
  heure_fin: string
}

interface Agent {
  id: string
  prenom: string
  nom: string
}

interface Props {
  residenceId: string
  onClose: () => void
  onSuccess: () => void
}

const today    = new Date().toISOString().split('T')[0]
const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1))
  .toISOString().split('T')[0]

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
const JOURS_LABELS: Record<string, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer',
  jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}
const VALID_TYPES = [
  { value: 'parties_communes', label: '🏢 Parties communes' },
  { value: 'containers',       label: '🗑️ Containers' },
  { value: 'espaces_verts',    label: '🌿 Espaces verts' },
]

function formatCreneau(c: Creneau): string {
  const jours = c.jours.map(j => JOURS_LABELS[j] ?? j).join(', ')
  return `${jours} · ${c.heure_debut} – ${c.heure_fin}`
}

function toggleItem(item: string, list: string[]): string[] {
  return list.includes(item) ? list.filter(j => j !== item) : [...list, item]
}

export default function AjoutContratModal({ residenceId, onClose, onSuccess }: Props) {
  // Champs obligatoires
  const [libelle,           setLibelle]          = useState('')
  const [typeContrat,       setTypeContrat]       = useState('parties_communes')
  const [dateDebut,         setDateDebut]         = useState(today)
  const [dateFin,           setDateFin]           = useState(nextYear)
  const [montant,           setMontant]           = useState('')
  const [nbInterventions,   setNbInterventions]   = useState<number>(0)

  // Champs enrichis
  const [agentId,           setAgentId]           = useState('')
  const [agents,            setAgents]            = useState<Agent[]>([])
  const [tauxMode,          setTauxMode]          = useState<'base' | 'specifique'>('base')
  const [tauxSpecifique,    setTauxSpecifique]    = useState('')
  const [tauxBase]                                = useState<number>(25)
  const [creneaux,          setCreneaux]          = useState<Creneau[]>([])
  const [joursInterdits,    setJoursInterdits]    = useState<string[]>([])
  const [notes,             setNotes]             = useState('')

  // Mini-form créneau
  const [showAddCreneau,    setShowAddCreneau]    = useState(false)
  const [newJours,          setNewJours]          = useState<string[]>([])
  const [newDebut,          setNewDebut]          = useState('08:00')
  const [newFin,            setNewFin]            = useState('12:00')

  // UI
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => setAgents(d.agents ?? []))
      .catch(() => {/* liste vide si échec */})
  }, [])

  // Calcul heures vendues live
  const montantNum   = parseFloat(montant) || 0
  const tauxEffectif = tauxMode === 'base' ? tauxBase : (parseFloat(tauxSpecifique) || 0)
  const heuresMois   = montantNum > 0 && tauxEffectif > 0 ? Math.round(montantNum / tauxEffectif) : null
  const heuresPassage = heuresMois !== null && nbInterventions > 0
    ? Math.round((heuresMois / nbInterventions) * 10) / 10
    : null

  function addCreneau() {
    if (newJours.length === 0) return
    setCreneaux(prev => [...prev, { jours: [...newJours], heure_debut: newDebut, heure_fin: newFin }])
    setNewJours([])
    setNewDebut('08:00')
    setNewFin('12:00')
    setShowAddCreneau(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/residences/${residenceId}/contrats`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libelle,
          type_contrat:             typeContrat,
          date_debut:               dateDebut,
          date_fin:                 dateFin,
          montant_mensuel:          montant ? parseFloat(montant) : null,
          nb_interventions_mois:    nbInterventions,
          agent_prefere_id:         agentId || null,
          taux_horaire_facturation: tauxMode === 'specifique' && tauxSpecifique ? parseFloat(tauxSpecifique) : null,
          creneaux_acceptes:        creneaux,
          jours_interdits:          joursInterdits,
          notes_specifiques:        notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erreur inconnue.'); return }
      onSuccess()
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[93vh]">

        {/* Pill mobile */}
        <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full"/>
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-lg">Ajouter un contrat</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Fermer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Body scrollable */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Libellé */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Libellé <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={libelle}
              onChange={e => setLibelle(e.target.value)}
              placeholder="ex. Bâtiment B, Containers…"
              required
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Type de contrat
            </label>
            <select
              value={typeContrat}
              onChange={e => setTypeContrat(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"
            >
              {VALID_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Début <span className="text-red-400">*</span>
              </label>
              <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Fin <span className="text-red-400">*</span>
              </label>
              <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
            </div>
          </div>

          {/* Montant + interventions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Montant mensuel HT (€)
              </label>
              <input type="number" value={montant} min={0} step={0.01}
                onChange={e => setMontant(e.target.value)}
                placeholder="ex : 350"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Interventions / mois
              </label>
              <input type="number" value={nbInterventions} min={0}
                onChange={e => setNbInterventions(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
            </div>
          </div>

          {/* Heures vendues live */}
          {heuresMois !== null && (
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 flex gap-4 flex-wrap">
              <span>⏱ <span className="font-semibold text-slate-800">{heuresMois}h</span>/mois</span>
              {heuresPassage !== null && (
                <span>📍 <span className="font-semibold text-slate-800">{heuresPassage}h</span>/passage</span>
              )}
            </div>
          )}

          {/* Taux horaire */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Taux horaire facturation
            </label>
            <div className="flex gap-2 mb-2">
              <button type="button"
                onClick={() => setTauxMode('base')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  tauxMode === 'base'
                    ? 'bg-[#1A5FA8] text-white border-[#1A5FA8]'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}>
                Base société ({tauxBase} €/h)
              </button>
              <button type="button"
                onClick={() => setTauxMode('specifique')}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  tauxMode === 'specifique'
                    ? 'bg-[#1A5FA8] text-white border-[#1A5FA8]'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}>
                Taux spécifique
              </button>
            </div>
            {tauxMode === 'specifique' && (
              <input type="number" value={tauxSpecifique} min={0} step={0.5}
                onChange={e => setTauxSpecifique(e.target.value)}
                placeholder="ex : 28"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
            )}
          </div>

          {/* Agent attitré */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Agent attitré
            </label>
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"
            >
              <option value="">— Aucun agent attitré —</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>
              ))}
            </select>
          </div>

          {/* Créneaux */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Créneaux acceptés
            </label>
            {creneaux.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {creneaux.map((c, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                    <span className="text-xs text-slate-700">{formatCreneau(c)}</span>
                    <button type="button" onClick={() => setCreneaux(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-slate-400 hover:text-red-500 transition-colors ml-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!showAddCreneau ? (
              <button type="button" onClick={() => setShowAddCreneau(true)}
                className="w-full border border-dashed border-slate-300 rounded-xl py-2 text-xs text-slate-500 hover:text-[#1A5FA8] hover:border-[#1A5FA8] transition-colors">
                + Ajouter un créneau
              </button>
            ) : (
              <div className="border border-slate-200 rounded-xl p-3 space-y-3">
                {/* Sélecteur jours */}
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Jours</p>
                  <div className="flex flex-wrap gap-1.5">
                    {JOURS.map(j => (
                      <button
                        key={j} type="button"
                        onClick={() => setNewJours(prev => toggleItem(j, prev))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                          newJours.includes(j)
                            ? 'bg-[#1A5FA8] text-white border-[#1A5FA8]'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {JOURS_LABELS[j]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Début</p>
                    <input type="time" value={newDebut} onChange={e => setNewDebut(e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"/>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Fin</p>
                    <input type="time" value={newFin} onChange={e => setNewFin(e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"/>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowAddCreneau(false)}
                    className="flex-1 border border-slate-200 rounded-xl py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
                    Annuler
                  </button>
                  <button type="button" onClick={addCreneau} disabled={newJours.length === 0}
                    className="flex-1 bg-[#1A5FA8] text-white rounded-xl py-1.5 text-xs font-semibold hover:bg-[#0A4A8A] transition-colors disabled:opacity-40">
                    Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Jours interdits */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Jours interdits
            </label>
            <div className="flex flex-wrap gap-1.5">
              {JOURS.map(j => (
                <button
                  key={j} type="button"
                  onClick={() => setJoursInterdits(prev => toggleItem(j, prev))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    joursInterdits.includes(j)
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {JOURS_LABELS[j]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Notes spécifiques
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Contraintes particulières, accès, matériel…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 resize-none"
            />
          </div>

          {/* Erreur */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pb-1">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#1A5FA8] text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-[#0A4A8A] transition-colors disabled:opacity-50">
              {loading ? 'Création…' : 'Créer le contrat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
