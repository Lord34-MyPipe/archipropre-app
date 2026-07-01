'use client'

import { useState, useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContratCard {
  id: string
  libelle: string | null
  type_contrat: string | null
  statut_calcule: 'actif' | 'futur' | 'sommeil' | 'termine'
  montant_mensuel: number | null
  nb_interventions_mois: number | null
  agent_prefere_id: string | null
  nb_interventions: number
  actif: boolean
}

interface ContratDetail {
  id: string
  libelle: string | null
  type_contrat: string | null
  date_debut: string
  date_fin: string
  montant_mensuel: number | null
  nb_interventions_mois: number | null
  taux_horaire_facturation: number | null
  creneaux_acceptes: Creneau[]
  jours_interdits: string[]
  notes_specifiques: string | null
  agent_prefere_id: string | null
  actif: boolean
  tauxBase: number
}

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
  contrat: ContratCard
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
const JOURS_LABELS: Record<string, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer',
  jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}
const VALID_TYPES = [
  { value: 'parties_communes', label: 'Parties communes' },
  { value: 'containers',       label: 'Containers' },
  { value: 'espaces_verts',    label: '🌿 Espaces verts' },
]

function formatCreneau(c: Creneau): string {
  const jours = c.jours.map(j => JOURS_LABELS[j] ?? j).join(', ')
  return `${jours} · ${c.heure_debut} – ${c.heure_fin}`
}

function toggleItem(item: string, list: string[]): string[] {
  return list.includes(item) ? list.filter(j => j !== item) : [...list, item]
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function GestionContratModal({ residenceId, contrat, onClose, onSaved, onDeleted }: Props) {
  // Chargement du détail complet
  const [detail, setDetail]   = useState<ContratDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // Agents
  const [agents, setAgents] = useState<Agent[]>([])

  // Champs du formulaire
  const [libelle,              setLibelle]             = useState('')
  const [typeContrat,          setTypeContrat]         = useState('parties_communes')
  const [dateDebut,            setDateDebut]           = useState('')
  const [dateFin,              setDateFin]             = useState('')
  const [montant,              setMontant]             = useState('')
  const [nbInterventions,      setNbInterventions]     = useState<number>(0)
  const [agentId,              setAgentId]             = useState<string>('')
  const [tauxMode,             setTauxMode]            = useState<'base' | 'specifique'>('base')
  const [tauxSpecifique,       setTauxSpecifique]      = useState('')
  const [tauxBase,             setTauxBase]            = useState<number>(25)
  const [creneaux,             setCreneaux]            = useState<Creneau[]>([])
  const [joursInterdits,       setJoursInterdits]      = useState<string[]>([])
  const [notes,                setNotes]               = useState('')

  // Mini-form ajout créneau
  const [showAddCreneau, setShowAddCreneau] = useState(false)
  const [newJours,       setNewJours]       = useState<string[]>([])
  const [newDebut,       setNewDebut]       = useState('08:00')
  const [newFin,         setNewFin]         = useState('12:00')

  // UI
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saved,   setSaved]   = useState(false)

  // Zone dangereuse
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting,          setDeleting]          = useState(false)
  const [deleteErr,         setDeleteErr]         = useState<string | null>(null)
  const [toggling,          setToggling]          = useState(false)
  const [toggleErr,         setToggleErr]         = useState<string | null>(null)

  // ── Fetch détail + agents ───────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch(`/api/residences/${residenceId}/contrats/${contrat.id}`).then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
    ]).then(([detailJson, agentsJson]) => {
      const d: ContratDetail = detailJson
      setDetail(d)
      setLibelle(d.libelle ?? '')
      setTypeContrat(d.type_contrat ?? 'parties_communes')
      setDateDebut(d.date_debut)
      setDateFin(d.date_fin)
      setMontant(d.montant_mensuel != null ? String(d.montant_mensuel) : '')
      setNbInterventions(d.nb_interventions_mois ?? 0)
      setAgentId(d.agent_prefere_id ?? '')
      setCreneaux(d.creneaux_acceptes ?? [])
      setJoursInterdits(d.jours_interdits ?? [])
      setNotes(d.notes_specifiques ?? '')
      setTauxBase(d.tauxBase)
      if (d.taux_horaire_facturation != null) {
        setTauxMode('specifique')
        setTauxSpecifique(String(d.taux_horaire_facturation))
      } else {
        setTauxMode('base')
      }
      setAgents(agentsJson.agents ?? [])
    }).catch(() => setLoadErr('Impossible de charger les détails du contrat.')).finally(() => setLoading(false))
  }, [residenceId, contrat.id])

  // ── Calcul heures vendues ───────────────────────────────────────────────────

  const montantNum    = parseFloat(montant) || 0
  const tauxEffectif  = tauxMode === 'base' ? tauxBase : (parseFloat(tauxSpecifique) || 0)
  const heuresMois    = montantNum > 0 && tauxEffectif > 0 ? Math.round(montantNum / tauxEffectif) : null
  const heuresPassage = heuresMois !== null && nbInterventions > 0
    ? Math.round((heuresMois / nbInterventions) * 10) / 10
    : null

  // ── Actions créneaux ────────────────────────────────────────────────────────

  function addCreneau() {
    if (newJours.length === 0) return
    setCreneaux(prev => [...prev, { jours: [...newJours], heure_debut: newDebut, heure_fin: newFin }])
    setNewJours([])
    setNewDebut('08:00')
    setNewFin('12:00')
    setShowAddCreneau(false)
    setSaved(false)
  }

  // ── Sauvegarde ──────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    setSaveErr(null)
    const res = await fetch(`/api/residences/${residenceId}/contrats/${contrat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        libelle:                  libelle.trim() || null,
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
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setSaveErr(json.error ?? 'Erreur inconnue'); return }
    setSaved(true)
    onSaved()
  }

  // ── Sommeil / Réactivation ──────────────────────────────────────────────────

  async function handleToggleActif() {
    setToggling(true)
    setToggleErr(null)
    const res = await fetch(`/api/residences/${residenceId}/contrats/${contrat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif: !contrat.actif }),
    })
    const json = await res.json()
    setToggling(false)
    if (!res.ok) { setToggleErr(json.error ?? 'Erreur inconnue'); return }
    onSaved()
    onClose()
  }

  // ── Suppression ─────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleting(true)
    setDeleteErr(null)
    const res = await fetch(`/api/residences/${residenceId}/contrats/${contrat.id}`, {
      method: 'DELETE',
    })
    const json = await res.json()
    setDeleting(false)
    if (!res.ok) { setDeleteErr(json.error ?? 'Erreur inconnue'); return }
    onDeleted()
    onClose()
  }

  // ── Render ──────────────────────────────────────────────────────────────────

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
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-lg">Gérer le contrat</h3>
              <p className="text-sm text-slate-500 mt-0.5 truncate">
                {contrat.libelle ?? 'Contrat sans libellé'}
              </p>
            </div>
            {saved && (
              <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs rounded-full font-semibold shrink-0 ml-2">
                ✓ Enregistré
              </span>
            )}
          </div>
          {saveErr && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{saveErr}</div>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse"/>
              ))}
            </div>
          ) : loadErr ? (
            <p className="text-sm text-red-500">{loadErr}</p>
          ) : (
            <div className="space-y-5">

              {/* Libellé */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Libellé <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={libelle}
                  onChange={e => { setLibelle(e.target.value); setSaved(false) }}
                  placeholder="ex. Bâtiment B…"
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
                  onChange={e => { setTypeContrat(e.target.value); setSaved(false) }}
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
                    Début contrat
                  </label>
                  <input type="date" value={dateDebut}
                    onChange={e => { setDateDebut(e.target.value); setSaved(false) }}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Fin contrat
                  </label>
                  <input type="date" value={dateFin}
                    onChange={e => { setDateFin(e.target.value); setSaved(false) }}
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
                    onChange={e => { setMontant(e.target.value); setSaved(false) }}
                    placeholder="ex : 350"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Interventions / mois
                  </label>
                  <input type="number" value={nbInterventions} min={0}
                    onChange={e => { setNbInterventions(Math.max(0, Number(e.target.value))); setSaved(false) }}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                </div>
              </div>

              {/* Agent */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Agent attitré
                </label>
                <select
                  value={agentId}
                  onChange={e => { setAgentId(e.target.value); setSaved(false) }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"
                >
                  <option value="">— Aucun agent attitré —</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>
                  ))}
                </select>
              </div>

              {/* Taux horaire */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Taux horaire facturé (€/h)
                </label>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => { setTauxMode('base'); setSaved(false) }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      tauxMode === 'base'
                        ? 'bg-[#0A2E5A] text-white border-[#0A2E5A]'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}>
                    Taux Base société
                  </button>
                  <button type="button" onClick={() => { setTauxMode('specifique'); setSaved(false) }}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      tauxMode === 'specifique'
                        ? 'bg-[#0BBFBF] text-white border-[#0BBFBF]'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}>
                    Taux spécifique
                  </button>
                </div>
                {tauxMode === 'base' ? (
                  <div className="w-full px-3 py-2.5 border border-slate-100 bg-slate-50 rounded-xl text-sm text-slate-500 flex items-center justify-between">
                    <span>Taux Base société</span>
                    <span className="font-semibold text-slate-700">{tauxBase} €/h</span>
                  </div>
                ) : (
                  <input type="number" min={1} step={0.5} value={tauxSpecifique}
                    onChange={e => { setTauxSpecifique(e.target.value); setSaved(false) }}
                    placeholder={`Ex : ${tauxBase}`}
                    className="w-full px-3 py-2.5 border border-[#0BBFBF]/40 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                )}
              </div>

              {/* Heures vendues */}
              {heuresMois !== null && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1.5">Heures vendues</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-blue-700">{heuresMois} h</span>
                    <span className="text-sm text-blue-500">/ mois</span>
                  </div>
                  {heuresPassage !== null && (
                    <p className="text-xs text-blue-500 mt-0.5">
                      soit <span className="font-semibold">{heuresPassage} h</span> par passage
                      {' '}({nbInterventions} interv. × {tauxEffectif} €/h)
                    </p>
                  )}
                </div>
              )}

              {/* Créneaux acceptés */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Créneaux d&apos;intervention acceptés
                </p>
                {creneaux.length === 0 && !showAddCreneau && (
                  <p className="text-xs text-slate-400 italic mb-2">Aucun créneau — fallback 08:00 à la génération.</p>
                )}
                <div className="space-y-1.5 mb-2">
                  {creneaux.map((c, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 bg-[#0BBFBF]/5 border border-[#0BBFBF]/20 rounded-xl">
                      <span className="text-sm text-slate-700 font-medium">{formatCreneau(c)}</span>
                      <button type="button" onClick={() => { setCreneaux(prev => prev.filter((_, i) => i !== idx)); setSaved(false) }}
                        className="ml-2 w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                {showAddCreneau ? (
                  <div className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-slate-50">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Jours</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {JOURS.map(j => (
                          <button key={j} type="button"
                            onClick={() => setNewJours(prev => toggleItem(j, prev))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                              newJours.includes(j) ? 'bg-[#0BBFBF] text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-[#0BBFBF]/40'
                            }`}>
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
                      <button type="button" onClick={() => setShowAddCreneau(false)}
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
                  <button type="button" onClick={() => setShowAddCreneau(true)}
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
                  {JOURS.map(j => (
                    <button key={j} type="button"
                      onClick={() => { setJoursInterdits(prev => toggleItem(j, prev)); setSaved(false) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        joursInterdits.includes(j) ? 'bg-[#0A2E5A] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {JOURS_LABELS[j]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Notes spécifiques client
                </label>
                <textarea value={notes} onChange={e => { setNotes(e.target.value); setSaved(false) }}
                  rows={3} placeholder="Instructions particulières, accès, codes…"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 resize-none"/>
              </div>

              {/* Zone dangereuse */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 border-t border-slate-100"/>
                  <span className="text-[9px] text-slate-300 uppercase tracking-widest font-medium">Zone dangereuse</span>
                  <div className="flex-1 border-t border-slate-100"/>
                </div>

                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
                  {contrat.nb_interventions === 0 ? (
                    // Pas d'historique → suppression autorisée
                    !showDeleteConfirm ? (
                      <div>
                        <button type="button" onClick={() => setShowDeleteConfirm(true)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border bg-white border-red-300 text-red-700 hover:bg-red-100 transition-all">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                          Supprimer définitivement ce contrat
                        </button>
                        {deleteErr && <p className="text-xs text-red-600 mt-2">{deleteErr}</p>}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-red-800">Supprimer définitivement ?</p>
                        <p className="text-xs text-red-600">
                          Action irréversible. Les zones liées à ce contrat perdront leur référence contrat,
                          mais ne seront pas supprimées.
                        </p>
                        {deleteErr && <p className="text-xs text-red-600 font-semibold">{deleteErr}</p>}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setShowDeleteConfirm(false); setDeleteErr(null) }}
                            disabled={deleting}
                            className="flex-1 py-2 rounded-xl border border-red-200 text-red-700 text-sm font-medium hover:bg-white disabled:opacity-50">
                            Annuler
                          </button>
                          <button type="button" onClick={handleDelete} disabled={deleting}
                            className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-1.5">
                            {deleting
                              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>
                              : 'Confirmer la suppression'
                            }
                          </button>
                        </div>
                      </div>
                    )
                  ) : (
                    // Historique présent → sommeil / réactivation uniquement
                    <div className="space-y-2">
                      <p className="text-xs text-red-700">
                        Ce contrat a un historique ({contrat.nb_interventions} intervention{contrat.nb_interventions > 1 ? 's' : ''})
                        et ne peut être supprimé. La mise en sommeil le conserve mais il n&apos;impacte plus le planning.
                      </p>
                      {toggleErr && <p className="text-xs text-red-600 font-semibold">{toggleErr}</p>}
                      {contrat.actif ? (
                        <button type="button" onClick={handleToggleActif} disabled={toggling}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border bg-white border-amber-300 text-amber-700 hover:bg-amber-50 transition-all disabled:opacity-50">
                          {toggling
                            ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>
                            : <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 9.563C9 9.252 9.252 9 9.563 9h4.874c.311 0 .563.252.563.563v4.874c0 .311-.252.563-.563.563H9.564A.562.562 0 019 14.437V9.564z"/>
                                </svg>
                                Mettre en sommeil
                              </>
                          }
                        </button>
                      ) : (
                        <button type="button" onClick={handleToggleActif} disabled={toggling}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border bg-white border-green-300 text-green-700 hover:bg-green-50 transition-all disabled:opacity-50">
                          {toggling
                            ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/>
                            : <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/>
                                </svg>
                                Réactiver ce contrat
                              </>
                          }
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
            {saving ? 'Enregistrement…' : (saved ? 'Mettre à jour' : 'Enregistrer')}
          </button>
        </div>

      </div>
    </div>
  )
}
