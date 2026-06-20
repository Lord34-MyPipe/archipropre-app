'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Segment {
  intervention_id: string
  residence_nom: string
  heure_debut: string | null
  heure_fin: string | null
  duree_minutes: number | null
  trajet_apres_minutes: number | null
  statut: string
}

interface JourneeData {
  agent: { id: string; prenom: string; nom: string }
  segments: Segment[]
  totalTerrain: number
  totalTrajets: number
  totalJournee: number
  journeeValidee: {
    id: string
    validee_at: string
    total_minutes_terrain: number
    total_minutes_trajets: number
    notes: string | null
  } | null
}

function formatDuree(min: number): string {
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h${min % 60 > 0 ? ` ${min % 60}min` : ''}`
}

function fmtHeure(ts: string | null): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function formatDateLong(isoDate: string): string {
  return new Date(isoDate + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/Paris',
  })
}

interface Props {
  open: boolean
  onClose: () => void
  agentId: string
  agentNom: string
  date: string
}

export default function JourneeAgentPanel({ open, onClose, agentId, agentNom, date }: Props) {
  const router = useRouter()
  const [data, setData]       = useState<JourneeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [notes, setNotes]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState(false)

  useEffect(() => {
    if (!open) return
    setData(null)
    setNotes('')
    setLoading(true)
    fetch(`/api/agents/${agentId}/journee?date=${date}`)
      .then(r => r.json())
      .then((d: JourneeData) => {
        setData(d)
        setNotes(d.journeeValidee?.notes ?? '')
      })
      .finally(() => setLoading(false))
  }, [open, agentId, date])

  async function handleValider() {
    if (!data) return
    setSaving(true)
    const res = await fetch(`/api/agents/${agentId}/journee/valider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        total_minutes_terrain: data.totalTerrain,
        total_minutes_trajets: data.totalTrajets,
        notes: notes || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setToast(true)
      setTimeout(() => {
        setToast(false)
        onClose()
        router.refresh()
      }, 1200)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panneau */}
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl"
        style={{ width: 420, maxWidth: '100vw' }}>

        {/* Header */}
        <div className="px-6 py-5 flex items-start justify-between" style={{ background: '#0A2E5A' }}>
          <div>
            <h2 className="text-white font-bold text-lg leading-tight">Journée de {agentNom}</h2>
            <p className="text-blue-300 text-sm mt-0.5 capitalize">{formatDateLong(date)}</p>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white mt-0.5 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Chargement…
            </div>
          )}

          {!loading && data && (
            <>
              {/* Segments */}
              <div className="px-5 py-4">
                {data.segments.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">Aucune intervention terminée ce jour.</p>
                ) : (
                  <div className="space-y-0">
                    {data.segments.map((seg, i) => (
                      <div key={seg.intervention_id}>
                        {/* Intervention */}
                        <div className="flex items-center gap-3 py-3 border-b border-slate-50">
                          <div className="w-1 self-stretch rounded-full shrink-0"
                            style={{ background: seg.statut === 'validee' ? '#16A34A' : '#1A5FA8', minHeight: 36 }}/>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{seg.residence_nom}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {fmtHeure(seg.heure_debut)} → {fmtHeure(seg.heure_fin)}
                            </p>
                          </div>
                          <span className="text-sm font-bold text-slate-700 tabular-nums shrink-0">
                            {seg.duree_minutes !== null ? formatDuree(seg.duree_minutes) : '—'}
                          </span>
                        </div>

                        {/* Trajet inter-chantier */}
                        {seg.trajet_apres_minutes !== null && (
                          <div className="flex items-center gap-3 py-2 pl-4 text-xs text-slate-400">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"/>
                            </svg>
                            <span>Trajet vers chantier {i + 2}</span>
                            <span className="ml-auto font-semibold text-slate-500 tabular-nums">
                              {formatDuree(seg.trajet_apres_minutes)}
                            </span>
                          </div>
                        )}

                        {/* Fin de journée après le dernier */}
                        {i === data.segments.length - 1 && (
                          <p className="text-xs text-slate-300 pl-4 py-2">Fin de journée</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totaux */}
              {data.segments.length > 0 && (
                <div className="mx-5 mb-4 rounded-xl border border-slate-100 overflow-hidden">
                  {[
                    { label: 'Total nettoyage', value: data.totalTerrain, color: '#1A5FA8' },
                    { label: 'Total trajets',   value: data.totalTrajets, color: '#854F0B' },
                    { label: 'Total journée',   value: data.totalJournee, color: '#0A2E5A', bold: true },
                  ].map(row => (
                    <div key={row.label} className={`flex items-center justify-between px-4 py-2.5 border-b border-slate-50 last:border-0 ${row.bold ? 'bg-slate-50' : ''}`}>
                      <span className={`text-sm ${row.bold ? 'font-bold text-slate-800' : 'text-slate-600'}`}>{row.label}</span>
                      <span className="text-sm font-bold tabular-nums" style={{ color: row.color }}>
                        {formatDuree(row.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              {!data.journeeValidee && data.segments.length > 0 && (
                <div className="px-5 mb-4">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Notes optionnelles…"
                    rows={2}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 placeholder-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              )}

              {/* Badge validée */}
              {data.journeeValidee && (
                <div className="mx-5 mb-4 flex items-center gap-2 px-4 py-3 rounded-xl"
                  style={{ background: '#EAF3DE' }}>
                  <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: '#3B6D11' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#3B6D11' }}>Journée validée</p>
                    <p className="text-xs" style={{ color: '#5A8F2A' }}>
                      {new Date(data.journeeValidee.validee_at).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'long', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                        timeZone: 'Europe/Paris',
                      })}
                    </p>
                    {data.journeeValidee.notes && (
                      <p className="text-xs text-slate-500 mt-1 italic">{data.journeeValidee.notes}</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer sticky */}
        {data && !data.journeeValidee && data.segments.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-100 bg-white">
            <button
              onClick={handleValider}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-60"
              style={{ background: '#1A5FA8' }}
            >
              {saving ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                </svg>
              )}
              Valider la journée — {formatDuree(data.totalJournee)}
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl text-white text-sm font-medium shadow-lg"
          style={{ background: '#1A5FA8' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
          </svg>
          Journée validée ✓
        </div>
      )}
    </>
  )
}
