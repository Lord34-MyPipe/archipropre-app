'use client'

import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import type { Residence, Profile } from '@/lib/types'
import { Star, CheckCircle2, AlertTriangle, MapPin, Clock, XCircle, Ban, Info, Car } from 'lucide-react'

interface TachePreview {
  id: string
  libelle: string
  zone_nom: string | null
  heure_debut: string | null
}

interface AgentWithScore {
  agent: Profile
  score: number
  reasons: { icon: ReactNode; text: string }[]
  excluded: boolean
  absent: boolean
}

function computeScore(
  agent: Profile,
  residence: Residence,
  todayCount: number,
  isAbsent: boolean,
): AgentWithScore {
  const excluded = (residence.agent_exclu_ids ?? []).includes(agent.id)
  if (excluded) {
    return { agent, score: 0, excluded: true, absent: false,
      reasons: [{ icon: <Ban className="w-3 h-3" />, text: 'Agent exclu de cette résidence' }] }
  }
  if (isAbsent) {
    return { agent, score: 0, excluded: false, absent: true,
      reasons: [{ icon: <XCircle className="w-3 h-3 text-red-500" />, text: 'Absent ou en congé ce jour' }] }
  }

  const reasons: { icon: ReactNode; text: string }[] = []
  let score = 50

  if (agent.id === residence.agent_prefere_id) {
    score += 30
    reasons.push({ icon: <Star className="w-3 h-3 text-amber-400" />, text: 'Agent attitré de cette résidence (+30 pts)' })
  }

  if (residence.vehicule_requis) {
    if (agent.vehicule) {
      score += 20
      reasons.push({ icon: <CheckCircle2 className="w-3 h-3 text-green-500" />, text: 'Véhicule disponible (+20 pts)' })
    } else {
      score -= 20
      reasons.push({ icon: <AlertTriangle className="w-3 h-3 text-amber-500" />, text: 'Véhicule requis — agent non véhiculé (-20 pts)' })
    }
  }

  if ((agent.zones_geo ?? []).length > 0) {
    score += 10
    reasons.push({ icon: <MapPin className="w-3 h-3 text-blue-400" />, text: `Zones couvertes : ${agent.zones_geo.join(', ')} (+10 pts)` })
  }

  if (todayCount > 0) {
    const penalty = Math.min(todayCount * 10, 30)
    score -= penalty
    reasons.push({ icon: <Clock className="w-3 h-3 text-slate-400" />, text: `${todayCount} intervention(s) déjà planifiée(s) ce jour (-${penalty} pts)` })
  }

  if (reasons.length === 0) {
    reasons.push({ icon: <Info className="w-3 h-3 text-blue-400" />, text: 'Disponible' })
  }

  return { agent, score: Math.max(0, Math.min(100, score)), reasons, excluded: false, absent: false }
}

function scoreColor(score: number) {
  if (score >= 70) return '#22c55e'
  if (score >= 40) return '#f59e0b'
  return '#ef4444'
}

function nextDay(n = 1) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function addTwoHours(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + 120
  const fh = Math.floor(total / 60) % 24
  const fm = total % 60
  return `${String(fh).padStart(2,'0')}:${String(fm).padStart(2,'0')}`
}

const RECURRENCE_OPTIONS = [
  { value: 'ponctuelle',  label: 'Ponctuelle',     desc: '1 intervention' },
  { value: 'hebdo',       label: 'Hebdomadaire',   desc: '8 semaines' },
  { value: 'bihebdo',     label: 'Bihebdomadaire', desc: '8 occurrences / 16 semaines' },
  { value: 'mensuelle',   label: 'Mensuelle',      desc: '3 mois' },
]

const DAY_NAMES = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
const FR_DAY   = ['dim.','lun.','mar.','mer.','jeu.','ven.','sam.']

interface Props {
  residence: Residence
  onClose: () => void
  onCreated: (count: number) => void
}

export default function PlanifierInterventionModal({ residence, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1)

  // Step 1
  const [formDate, setFormDate]         = useState(nextDay())
  const [heureDebut, setHeureDebut]     = useState('08:00')
  const [heureFin, setHeureFin]         = useState('10:00')
  const [recurrence, setRecurrence]     = useState('ponctuelle')

  // Step 2
  const [agentsScored, setAgentsScored] = useState<AgentWithScore[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // Step 3
  const [taches, setTaches]             = useState<TachePreview[]>([])
  const [loadingTaches, setLoadingTaches] = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')

  function onHeureDebutChange(val: string) {
    setHeureDebut(val)
    setHeureFin(addTwoHours(val))
  }

  // Charger les agents avec score quand on arrive à l'étape 2
  useEffect(() => {
    if (step !== 2) return
    setLoadingAgents(true)
    setSelectedAgentId(null)

    const supabase = createClient()
    Promise.all([
      supabase.auth.getUser(),
    ]).then(async ([{ data: { user } }]) => {
      if (!user) return

      const [{ data: agentsData }, { data: todayInters }, { data: absData }, { data: congesData }] =
        await Promise.all([
          supabase.from('profiles').select('*')
            .eq('manager_id', user.id).eq('actif', true).eq('role', 'agent').order('nom'),
          supabase.from('interventions').select('agent_id')
            .eq('date_prevue', formDate).neq('statut', 'terminee'),
          supabase.from('absences').select('agent_id')
            .lte('date_debut', formDate).gte('date_fin', formDate).eq('valide', true),
          supabase.from('conges').select('agent_id')
            .lte('date_debut', formDate).gte('date_fin', formDate).eq('statut', 'valide'),
        ])

      const countMap: Record<string, number> = {}
      ;(todayInters ?? []).forEach(i => {
        countMap[i.agent_id] = (countMap[i.agent_id] ?? 0) + 1
      })
      const absentIds = new Set([
        ...(absData ?? []).map(a => a.agent_id),
        ...(congesData ?? []).map(c => c.agent_id),
      ])

      const scored = (agentsData ?? []).map((a: Profile) =>
        computeScore(a, residence, countMap[a.id] ?? 0, absentIds.has(a.id))
      )
      scored.sort((a, b) => {
        if (a.excluded && !b.excluded) return 1
        if (!a.excluded && b.excluded) return -1
        if (a.absent && !b.absent) return 1
        if (!a.absent && b.absent) return -1
        return b.score - a.score
      })
      setAgentsScored(scored)
      setLoadingAgents(false)

      // Pré-sélectionner l'agent attitré si disponible
      const attitré = scored.find(
        s => s.agent.id === residence.agent_prefere_id && !s.excluded && !s.absent
      )
      if (attitré) setSelectedAgentId(attitré.agent.id)
    })
  }, [step, formDate, residence])

  // Charger les tâches du jour pour l'étape 3
  useEffect(() => {
    if (step !== 3) return
    setLoadingTaches(true)
    const dayIdx = new Date(formDate + 'T00:00').getDay()
    const dayName = DAY_NAMES[dayIdx]

    const supabase = createClient()
    supabase.from('taches_template')
      .select('id, libelle, heure_debut, zones_residence(nom)')
      .eq('residence_id', residence.id)
      .contains('jours_semaine', [dayName])
      .order('ordre')
      .then(({ data }) => {
        setTaches((data ?? []).map((t: {
          id: string; libelle: string; heure_debut: string | null;
          zones_residence: { nom: string }[] | null
        }) => ({
          id: t.id,
          libelle: t.libelle,
          heure_debut: t.heure_debut,
          zone_nom: Array.isArray(t.zones_residence)
            ? (t.zones_residence[0]?.nom ?? null)
            : ((t.zones_residence as { nom: string } | null)?.nom ?? null),
        })))
        setLoadingTaches(false)
      })
  }, [step, formDate, residence.id])

  async function handleConfirm() {
    if (!selectedAgentId) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/interventions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residenceId: residence.id,
        agentId: selectedAgentId,
        dateDebut: formDate,
        heureDebut,
        heureFin,
        recurrence,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); return }
    onCreated(json.count ?? 1)
  }

  const selectedAgent = useMemo(
    () => agentsScored.find(s => s.agent.id === selectedAgentId),
    [agentsScored, selectedAgentId]
  )

  const dateFR = new Date(formDate + 'T00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  })
  const dayIdx = new Date(formDate + 'T00:00').getDay()

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full"/>
        </div>

        {/* Header */}
        <div className="px-6 pt-4 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Planifier une intervention</h3>
              <p className="text-sm text-slate-500 mt-0.5 truncate">{residence.nom}</p>
            </div>
            {/* Stepper */}
            <div className="flex items-center gap-1.5 shrink-0">
              {[1,2,3].map(s => (
                <div key={s} className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                  s === step
                    ? 'bg-[#0A2E5A] text-white'
                    : s < step
                      ? 'bg-[#0BBFBF] text-white'
                      : 'bg-slate-100 text-slate-400'
                }`}>
                  {s < step ? '✓' : s}
                </div>
              ))}
            </div>
          </div>
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
          )}
        </div>

        {/* ────── STEP 1 : Date & Créneau ────── */}
        {step === 1 && (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Date de l'intervention
              </label>
              <input
                type="date"
                value={formDate}
                min={nextDay()}
                onChange={e => setFormDate(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 focus:border-[#0BBFBF]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Heure de début
                </label>
                <input
                  type="time"
                  value={heureDebut}
                  onChange={e => onHeureDebutChange(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 focus:border-[#0BBFBF]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Heure de fin
                </label>
                <input
                  type="time"
                  value={heureFin}
                  onChange={e => setHeureFin(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40 focus:border-[#0BBFBF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Récurrence
              </label>
              <div className="grid grid-cols-2 gap-2">
                {RECURRENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setRecurrence(opt.value)}
                    className={`flex flex-col items-start px-4 py-3 rounded-xl border-2 text-left transition-all ${
                      recurrence === opt.value
                        ? 'border-[#0BBFBF] bg-[#0BBFBF]/5'
                        : 'border-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <p className={`text-sm font-semibold ${recurrence === opt.value ? 'text-[#0A6060]' : 'text-slate-700'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600">
              <span className="font-semibold">Récap :</span>{' '}
              {dateFR} · {heureDebut}–{heureFin}
              {recurrence !== 'ponctuelle' && ` · ${RECURRENCE_OPTIONS.find(r => r.value === recurrence)?.label}`}
            </div>
          </div>
        )}

        {/* ────── STEP 2 : Choisir l'agent ────── */}
        {step === 2 && (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Agents compatibles — {dateFR}
            </p>
            {loadingAgents ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse"/>)}
              </div>
            ) : agentsScored.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8">Aucun agent dans votre équipe.</p>
            ) : (
              agentsScored.map(({ agent, score, reasons, excluded, absent }) => {
                const isSelected = selectedAgentId === agent.id
                const disabled   = excluded || absent
                return (
                  <div
                    key={agent.id}
                    onClick={() => { if (!disabled) setSelectedAgentId(agent.id) }}
                    className={`rounded-2xl border-2 p-4 transition-all ${
                      disabled
                        ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'border-[#0BBFBF] bg-[#0BBFBF]/5 cursor-pointer'
                          : 'border-slate-100 hover:border-slate-300 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                        disabled ? 'bg-slate-400' : isSelected ? 'bg-[#0BBFBF]' : 'bg-[#1A5FA8]'
                      }`}>
                        {agent.prenom[0]}{agent.nom[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-800">{agent.prenom} {agent.nom}</p>
                          {isSelected && !disabled && (
                            <span className="px-2 py-0.5 bg-[#0BBFBF]/20 text-[#0A6060] text-xs rounded-full font-semibold">
                              Sélectionné ✓
                            </span>
                          )}
                        </div>
                        {!disabled && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${score}%`, background: scoreColor(score) }}
                              />
                            </div>
                            <span className="text-xs font-bold" style={{ color: scoreColor(score) }}>
                              {score}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {reasons.map((r, ri) => (
                        <p key={ri} className="text-xs text-slate-500 flex items-start gap-1.5">
                          <span className="shrink-0">{r.icon}</span>
                          <span>{r.text}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ────── STEP 3 : Confirmation ────── */}
        {step === 3 && (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
            {/* Résumé */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1A5FA8] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {selectedAgent ? selectedAgent.agent.prenom[0] + selectedAgent.agent.nom[0] : '?'}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">
                    {selectedAgent ? `${selectedAgent.agent.prenom} ${selectedAgent.agent.nom}` : '—'}
                  </p>
                  <p className="text-xs text-slate-500">{dateFR}</p>
                </div>
                {selectedAgent && !selectedAgent.excluded && !selectedAgent.absent && (
                  <div className="ml-auto text-right">
                    <span className="text-lg font-bold" style={{ color: scoreColor(selectedAgent.score) }}>
                      {selectedAgent.score}
                    </span>
                    <p className="text-xs text-slate-400">score</p>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white rounded-xl px-3 py-2.5">
                  <p className="text-xs text-slate-400">Créneau</p>
                  <p className="font-semibold text-slate-800">{heureDebut} – {heureFin}</p>
                </div>
                <div className="bg-white rounded-xl px-3 py-2.5">
                  <p className="text-xs text-slate-400">Récurrence</p>
                  <p className="font-semibold text-slate-800">
                    {RECURRENCE_OPTIONS.find(r => r.value === recurrence)?.label}
                  </p>
                </div>
              </div>
              {recurrence !== 'ponctuelle' && (
                <p className="text-xs text-slate-500 bg-blue-50 rounded-xl px-3 py-2">
                  ℹ️ {RECURRENCE_OPTIONS.find(r => r.value === recurrence)?.desc} seront créées automatiquement.
                </p>
              )}
            </div>

            {/* Tâches du jour */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Tâches prévues le {FR_DAY[dayIdx]}
              </p>
              {loadingTaches ? (
                <div className="space-y-2">
                  {[1,2].map(i => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse"/>)}
                </div>
              ) : taches.length === 0 ? (
                <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-400">
                  Aucune tâche template définie pour ce jour sur cette résidence.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {taches.map(t => (
                    <div key={t.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                      <span className="text-[#0BBFBF] text-sm shrink-0">✓</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 font-medium truncate">{t.libelle}</p>
                        {t.zone_nom && (
                          <p className="text-xs text-slate-400">{t.zone_nom}</p>
                        )}
                      </div>
                      {t.heure_debut && (
                        <span className="text-xs text-slate-400 shrink-0">{t.heure_debut.slice(0,5)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer navigation */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="py-3 px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              ← Retour
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => {
                if (step === 2 && !selectedAgentId) return
                setStep(s => s + 1)
              }}
              disabled={step === 2 && !selectedAgentId}
              className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-40 transition-opacity"
              style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
            >
              {step === 2 && !selectedAgentId ? 'Choisir un agent' : 'Suivant →'}
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="py-3 px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-opacity"
                style={{ background: 'linear-gradient(135deg,#0BBFBF,#0A9A9A)' }}
              >
                {saving ? 'Planification…' : 'Confirmer la planification ✓'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
