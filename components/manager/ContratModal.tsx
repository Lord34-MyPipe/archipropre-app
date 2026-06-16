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

interface Props {
  residence: Residence
  onClose: () => void
  onSaved?: () => void
}

export default function ContratModal({ residence, onClose, onSaved }: Props) {
  // Contrat fields
  const [contratId, setContratId]       = useState<string | null>(null)
  const [dateDebut, setDateDebut]       = useState(todayStr())
  const [dateFin, setDateFin]           = useState(in12Months())
  const [montant, setMontant]           = useState('')
  const [nbInters, setNbInters]         = useState('4')
  const [joursInterdits, setJoursInterdits] = useState<string[]>([])
  const [heureMin, setHeureMin]         = useState('07:00')
  const [heureMax, setHeureMax]         = useState('18:00')
  const [notes, setNotes]               = useState('')

  // UI
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    fetch(`/api/contrats?residenceId=${residence.id}`)
      .then(r => r.json())
      .then(json => {
        const contrat = json.data
        if (contrat) {
          setContratId(contrat.id)
          setDateDebut(contrat.date_debut)
          setDateFin(contrat.date_fin)
          setMontant(contrat.montant_mensuel != null ? String(contrat.montant_mensuel) : '')
          setNbInters(String(contrat.nb_interventions_mois))
          setJoursInterdits(contrat.jours_interdits ?? [])
          setHeureMin(contrat.heure_debut_min ?? '07:00')
          setHeureMax(contrat.heure_fin_max ?? '18:00')
          setNotes(contrat.notes_specifiques ?? '')
          setSaved(true)
        }
        setLoading(false)
      })
  }, [residence.id])

  function toggleJour(jour: string, list: string[], setter: (v: string[]) => void) {
    setter(list.includes(jour) ? list.filter(j => j !== jour) : [...list, jour])
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
        montantMensuel: montant || null,
        nbInterventionsMois: nbInters,
        joursInterdits,
        heureDebutMin: heureMin,
        heureFinnMax: heureMax,
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

  const JourCheckboxes = ({
    label, value, setter, blocked,
  }: { label: string; value: string[]; setter: (v: string[]) => void; blocked?: string[] }) => (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {JOURS.map(j => {
          const isBlocked = (blocked ?? []).includes(j)
          const isChecked = value.includes(j)
          return (
            <button
              key={j}
              type="button"
              disabled={isBlocked}
              onClick={() => { if (!isBlocked) toggleJour(j, value, setter) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isBlocked
                  ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                  : isChecked
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
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[93vh]">

        <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
          <div className="w-10 h-1 bg-slate-200 rounded-full"/>
        </div>

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

              {/* Montant + nb interventions */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Montant mensuel HT (€)
                  </label>
                  <input type="number" value={montant} onChange={e => setMontant(e.target.value)}
                    placeholder="Ex : 350"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Interventions / mois
                  </label>
                  <input type="number" min="1" max="31" value={nbInters} onChange={e => setNbInters(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                </div>
              </div>

              {/* Horaires */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Heure de début min
                  </label>
                  <input type="time" value={heureMin} onChange={e => setHeureMin(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Heure de fin max
                  </label>
                  <input type="time" value={heureMax} onChange={e => setHeureMax(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]/40"/>
                </div>
              </div>

              {/* Jours interdits (les jours d'intervention sont déduits des tâches template) */}
              <JourCheckboxes
                label="Jours interdits (client)"
                value={joursInterdits}
                setter={setJoursInterdits}
              />

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

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            {saved ? 'Fermer' : 'Annuler'}
          </button>
          {!saved && (
            <button onClick={handleSave} disabled={saving || loading}
              className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
              {saving ? 'Enregistrement…' : 'Enregistrer le contrat'}
            </button>
          )}
          {saved && (
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
              {saving ? 'Mise à jour…' : 'Mettre à jour'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
