'use client'

import { useMemo, useRef, useState } from 'react'
import type { AnalyseIA, AnalyseTacheIA } from './AnalyseContratWizard'

// ── Structure soumise à /api/residences/[id]/contrats/creer-complet (item 3) ──
// Même forme que p_structure de la RPC creer_contrat_complet (migration 031) :
// bâtiments → zones → tâches. Ne contient QUE des tâches hebdo (comme
// AnalyseIA côté serveur) : en mode détaillé, les tâches non-hebdo de l'arbre
// sont exclues à la construction, pas envoyées.
export interface StructureSoumission {
  batiments: {
    nom: string
    zones: {
      nom: string
      taches: { libelle: string; frequence_type: string; jours_semaine: string[]; duree_minutes: number }[]
    }[]
  }[]
}

// ── State local éditable, MODE DÉTAILLÉ (arbre complet du lot 1, inchangé) ──

interface TacheLocale {
  id: string
  libelle: string
  frequence: AnalyseTacheIA['frequence']
  jours: string[]
  duree: number
}
interface ZoneLocale {
  id: string
  nom: string
  taches: TacheLocale[]
}
interface BatimentLocal {
  id: string
  nom: string
  zones: ZoneLocale[]
}

// ── State local éditable, MODE SIMPLIFIÉ (par défaut, lot 2) ──
// 1 "tâche synthétique" par zone : un libellé + des jours, pas de durée
// (duree_minutes=0, cf item 1 RPC) ni de sélecteur de fréquence (toujours hebdo).

interface ZoneSimple {
  id: string
  nom: string
  libelle: string
  jours: string[]
}
interface BatimentSimple {
  id: string
  nom: string
  zones: ZoneSimple[]
}

const JOURS: { value: string; label: string }[] = [
  { value: 'lundi',    label: 'Lun' },
  { value: 'mardi',    label: 'Mar' },
  { value: 'mercredi', label: 'Mer' },
  { value: 'jeudi',    label: 'Jeu' },
  { value: 'vendredi', label: 'Ven' },
  { value: 'samedi',   label: 'Sam' },
  { value: 'dimanche', label: 'Dim' },
]

const FREQ_OPTIONS: { value: AnalyseTacheIA['frequence']; label: string }[] = [
  { value: 'hebdo',       label: 'Hebdomadaire' },
  { value: 'mensuel',     label: 'Mensuelle' },
  { value: 'trimestriel', label: 'Trimestrielle' },
  { value: 'semestriel',  label: 'Semestrielle' },
  { value: 'annuel',      label: 'Annuelle' },
]

interface Props {
  analyse: AnalyseIA
  volumeHebdoMin: number
  joursOrganisationActuelle: string[]  // jours de l'organisation actuelle (étape 1) — défaut des jours en mode simplifié
  minutesHebdoReelles: number
  plafondRentable: number
  ecartRentable: number
  tauxCible: number
  onBack: () => void                              // "Relancer l'analyse" → retour étape 2 (texte conservé au niveau du wizard)
  onContinue: (structure: StructureSoumission) => void  // "Continuer → Validation" → étape 4
}

export default function AnalyseContratEtape3({
  analyse, volumeHebdoMin, joursOrganisationActuelle, minutesHebdoReelles, plafondRentable, ecartRentable, tauxCible,
  onBack, onContinue,
}: Props) {
  const idRef = useRef(0)
  const nextId = () => `l${idRef.current++}`

  const [modeDetaille, setModeDetaille] = useState(false)

  // ── Mode détaillé — arbre complet (lot 1, inchangé) ──

  const [batiments, setBatiments] = useState<BatimentLocal[]>(() =>
    analyse.batiments.map(b => ({
      id: nextId(),
      nom: b.nom,
      zones: b.zones.map(z => ({
        id: nextId(),
        nom: z.nom,
        taches: z.taches.map(t => ({
          id: nextId(), libelle: t.libelle, frequence: t.frequence,
          jours: [...t.jours_proposes], duree: t.duree_minutes_estimee,
        })),
      })),
    })),
  )
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(analyse.batiments.map((_, i) => `b${i}`)), // tout ouvert par défaut — clés recalculées via index, cf toggleBatiment
  )

  // ── Récap live mode détaillé — recalculé à chaque édition ──
  const totalMinutesHebdo = useMemo(() => {
    let total = 0
    for (const b of batiments) {
      for (const z of b.zones) {
        for (const t of z.taches) {
          if (t.frequence === 'hebdo' && t.jours.length > 0) total += t.duree * t.jours.length
        }
      }
    }
    return total
  }, [batiments])

  const pct = volumeHebdoMin > 0 ? (totalMinutesHebdo / volumeHebdoMin) * 100 : null
  const depassement = pct !== null && pct > 100
  const barPct = pct === null ? 0 : Math.min(pct, 100)

  // ── Mutations mode détaillé (immutables, indexées par id local) ──

  function updateTache(bId: string, zId: string, tId: string, patch: Partial<TacheLocale>) {
    setBatiments(bs => bs.map(b => b.id !== bId ? b : {
      ...b,
      zones: b.zones.map(z => z.id !== zId ? z : {
        ...z,
        taches: z.taches.map(t => t.id !== tId ? t : { ...t, ...patch }),
      }),
    }))
  }
  function toggleJourTache(bId: string, zId: string, tId: string, jour: string) {
    setBatiments(bs => bs.map(b => b.id !== bId ? b : {
      ...b,
      zones: b.zones.map(z => z.id !== zId ? z : {
        ...z,
        taches: z.taches.map(t => t.id !== tId ? t : {
          ...t,
          jours: t.jours.includes(jour) ? t.jours.filter(j => j !== jour) : [...t.jours, jour],
        }),
      }),
    }))
  }
  function deleteTache(bId: string, zId: string, tId: string) {
    setBatiments(bs => bs.map(b => b.id !== bId ? b : {
      ...b,
      zones: b.zones.map(z => z.id !== zId ? z : { ...z, taches: z.taches.filter(t => t.id !== tId) }),
    }))
  }
  function addTache(bId: string, zId: string) {
    setBatiments(bs => bs.map(b => b.id !== bId ? b : {
      ...b,
      zones: b.zones.map(z => z.id !== zId ? z : {
        ...z,
        taches: [...z.taches, { id: nextId(), libelle: '', frequence: 'hebdo', jours: [], duree: 5 }],
      }),
    }))
  }
  function setNomZone(bId: string, zId: string, nom: string) {
    setBatiments(bs => bs.map(b => b.id !== bId ? b : {
      ...b,
      zones: b.zones.map(z => z.id !== zId ? z : { ...z, nom }),
    }))
  }
  function deleteZone(bId: string, zId: string) {
    setBatiments(bs => bs.map(b => b.id !== bId ? b : { ...b, zones: b.zones.filter(z => z.id !== zId) }))
  }
  function addZone(bId: string) {
    setBatiments(bs => bs.map(b => b.id !== bId ? b : { ...b, zones: [...b.zones, { id: nextId(), nom: '', taches: [] }] }))
  }
  function setNomBatiment(bId: string, nom: string) {
    setBatiments(bs => bs.map(b => b.id !== bId ? b : { ...b, nom }))
  }
  function deleteBatiment(bId: string) {
    setBatiments(bs => bs.filter(b => b.id !== bId))
  }
  function addBatiment() {
    const b: BatimentLocal = { id: nextId(), nom: '', zones: [] }
    setBatiments(bs => [...bs, b])
    setExpanded(s => new Set(s).add(b.id))
  }
  function toggleExpanded(bId: string) {
    setExpanded(s => {
      const next = new Set(s)
      if (next.has(bId)) next.delete(bId); else next.add(bId)
      return next
    })
  }

  // ── Mode simplifié (par défaut) — 1 tâche synthétique par zone ──

  const [batimentsSimple, setBatimentsSimple] = useState<BatimentSimple[]>(() =>
    analyse.batiments.map(b => ({
      id: nextId(),
      nom: b.nom,
      zones: b.zones.map(z => ({
        id: nextId(),
        nom: z.nom,
        libelle: 'Nettoyage complet',
        jours: [...joursOrganisationActuelle],
      })),
    })),
  )
  const [expandedSimple, setExpandedSimple] = useState<Set<string>>(
    () => new Set(batimentsSimple.map(b => b.id)),
  )

  function setNomZoneSimple(bId: string, zId: string, nom: string) {
    setBatimentsSimple(bs => bs.map(b => b.id !== bId ? b : {
      ...b, zones: b.zones.map(z => z.id !== zId ? z : { ...z, nom }),
    }))
  }
  function setLibelleZoneSimple(bId: string, zId: string, libelle: string) {
    setBatimentsSimple(bs => bs.map(b => b.id !== bId ? b : {
      ...b, zones: b.zones.map(z => z.id !== zId ? z : { ...z, libelle }),
    }))
  }
  function toggleJourZoneSimple(bId: string, zId: string, jour: string) {
    setBatimentsSimple(bs => bs.map(b => b.id !== bId ? b : {
      ...b,
      zones: b.zones.map(z => z.id !== zId ? z : {
        ...z, jours: z.jours.includes(jour) ? z.jours.filter(j => j !== jour) : [...z.jours, jour],
      }),
    }))
  }
  function deleteZoneSimple(bId: string, zId: string) {
    setBatimentsSimple(bs => bs.map(b => b.id !== bId ? b : { ...b, zones: b.zones.filter(z => z.id !== zId) }))
  }
  function addZoneSimple(bId: string) {
    setBatimentsSimple(bs => bs.map(b => b.id !== bId ? b : {
      ...b, zones: [...b.zones, { id: nextId(), nom: '', libelle: 'Nettoyage complet', jours: [...joursOrganisationActuelle] }],
    }))
  }
  function setNomBatimentSimple(bId: string, nom: string) {
    setBatimentsSimple(bs => bs.map(b => b.id !== bId ? b : { ...b, nom }))
  }
  function deleteBatimentSimple(bId: string) {
    setBatimentsSimple(bs => bs.filter(b => b.id !== bId))
  }
  function addBatimentSimple() {
    const b: BatimentSimple = { id: nextId(), nom: '', zones: [] }
    setBatimentsSimple(bs => [...bs, b])
    setExpandedSimple(s => new Set(s).add(b.id))
  }
  function toggleExpandedSimple(bId: string) {
    setExpandedSimple(s => {
      const next = new Set(s)
      if (next.has(bId)) next.delete(bId); else next.add(bId)
      return next
    })
  }

  const nbZonesSimple = useMemo(() => batimentsSimple.reduce((s, b) => s + b.zones.length, 0), [batimentsSimple])

  // ── Construction de la structure soumise, selon le mode actif ──

  function buildStructure(): StructureSoumission {
    if (modeDetaille) {
      return {
        batiments: batiments.map(b => ({
          nom: b.nom,
          zones: b.zones.map(z => ({
            nom: z.nom,
            taches: z.taches
              .filter(t => t.frequence === 'hebdo' && t.jours.length > 0)
              .map(t => ({ libelle: t.libelle, frequence_type: 'hebdo', jours_semaine: t.jours, duree_minutes: t.duree })),
          })),
        })),
      }
    }
    return {
      batiments: batimentsSimple.map(b => ({
        nom: b.nom,
        zones: b.zones.map(z => ({
          nom: z.nom,
          taches: z.jours.length > 0
            ? [{ libelle: z.libelle.trim() || 'Nettoyage complet', frequence_type: 'hebdo', jours_semaine: z.jours, duree_minutes: 0 }]
            : [],
        })),
      })),
    }
  }

  const ecartRentableOk = ecartRentable <= 0

  return (
    <div className="pb-8">

      {/* ── Bandeau récap sticky ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 md:px-8 py-3">
        <div className="max-w-3xl mx-auto">
          {modeDetaille ? (
            <>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-semibold text-slate-700">
                  {Math.round(totalMinutesHebdo)} min/semaine estimées
                  {volumeHebdoMin > 0 && <span className="text-slate-400 font-normal"> / {Math.round(volumeHebdoMin)} vendues</span>}
                </span>
                {pct !== null && (
                  <span className={`font-semibold ${depassement ? 'text-red-600' : 'text-green-600'}`}>
                    {pct.toFixed(0)} %{depassement && ` — dépassement de ${Math.round(totalMinutesHebdo - volumeHebdoMin)} min`}
                  </span>
                )}
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${depassement ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </>
          ) : (
            <div className={`text-sm font-medium ${ecartRentableOk ? 'text-green-700' : 'text-amber-700'}`}>
              Actuel <span className="font-bold">{Math.round(minutesHebdoReelles)} min/sem</span>
              {' '}— Plafond rentable ({tauxCible} €/h) <span className="font-bold">{Math.round(plafondRentable)} min/sem</span>
              {' '}— Écart {ecartRentable >= 0 ? '+' : ''}{Math.round(ecartRentable)} min
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-4">

        {/* ── Toggle structure détaillée ── */}
        <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5">
          <span className="text-sm text-slate-600">
            {modeDetaille ? 'Structure détaillée (zones, tâches, durées, fréquences)' : 'Structure simplifiée (1 tâche par zone)'}
          </span>
          <button type="button" onClick={() => setModeDetaille(m => !m)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${modeDetaille ? 'bg-[#1A5FA8]' : 'bg-slate-300'}`}
            aria-label="Basculer vers la structure détaillée"
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${modeDetaille ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {modeDetaille ? (
          <>
            {/* ── Accordéon bâtiments → zones → tâches (mode détaillé) ── */}
            <div className="space-y-3">
              {batiments.map(b => (
                <div key={b.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5">
                    <button type="button" onClick={() => toggleExpanded(b.id)} className="text-slate-400 hover:text-slate-600 shrink-0">
                      <svg className={`w-4 h-4 transition-transform ${expanded.has(b.id) ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6"/>
                      </svg>
                    </button>
                    <input
                      type="text" value={b.nom} onChange={e => setNomBatiment(b.id, e.target.value)}
                      placeholder="Nom du bâtiment"
                      className="flex-1 bg-transparent text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:px-2 focus:py-1 focus:rounded-lg transition-all"
                    />
                    <span className="text-xs text-slate-400 shrink-0">{b.zones.length} zone{b.zones.length !== 1 ? 's' : ''}</span>
                    <button type="button" onClick={() => deleteBatiment(b.id)}
                      className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Supprimer le bâtiment">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>

                  {expanded.has(b.id) && (
                    <div className="p-3 space-y-3">
                      {b.zones.map(z => (
                        <div key={z.id} className="border border-slate-100 rounded-xl p-3 space-y-2.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="text" value={z.nom} onChange={e => setNomZone(b.id, z.id, e.target.value)}
                              placeholder="Nom de la zone"
                              className="flex-1 bg-transparent text-sm font-semibold text-slate-700 focus:outline-none focus:bg-slate-50 focus:px-2 focus:py-1 focus:rounded-lg transition-all"
                            />
                            <button type="button" onClick={() => deleteZone(b.id, z.id)}
                              className="shrink-0 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Supprimer la zone">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </button>
                          </div>

                          <div className="space-y-2">
                            {z.taches.map(t => (
                              <div key={t.id} className={`rounded-lg border px-2.5 py-2 space-y-2 ${
                                t.frequence !== 'hebdo' ? 'border-slate-100 bg-slate-50/60' : 'border-slate-150 bg-white'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text" value={t.libelle}
                                    onChange={e => updateTache(b.id, z.id, t.id, { libelle: e.target.value })}
                                    placeholder="Libellé de la tâche"
                                    className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"
                                  />
                                  <select
                                    value={t.frequence}
                                    onChange={e => updateTache(b.id, z.id, t.id, { frequence: e.target.value as TacheLocale['frequence'] })}
                                    className="shrink-0 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"
                                  >
                                    {FREQ_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                  </select>
                                  <input
                                    type="number" min={1} value={t.duree}
                                    onChange={e => updateTache(b.id, z.id, t.id, { duree: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="w-16 px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-center focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"
                                  />
                                  <span className="text-xs text-slate-400 shrink-0">min</span>
                                  <button type="button" onClick={() => deleteTache(b.id, z.id, t.id)}
                                    className="shrink-0 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Supprimer la tâche">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                  </button>
                                </div>
                                {t.frequence === 'hebdo' ? (
                                  <div className="flex flex-wrap gap-1">
                                    {JOURS.map(j => (
                                      <button key={j.value} type="button" onClick={() => toggleJourTache(b.id, z.id, t.id, j.value)}
                                        className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                                          t.jours.includes(j.value) ? 'bg-[#0A2E5A] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                        }`}>
                                        {j.label}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-slate-400 italic">
                                    Fréquence non hebdomadaire — ne compte pas dans le planning hebdo ni dans le récap ci-dessus.
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>

                          <button type="button" onClick={() => addTache(b.id, z.id)}
                            className="text-xs font-semibold text-[#0BBFBF] hover:text-[#0BBFBF]/80 transition-colors">
                            + tâche
                          </button>
                        </div>
                      ))}

                      <button type="button" onClick={() => addZone(b.id)}
                        className="w-full border border-dashed border-slate-300 rounded-xl py-2 text-xs font-semibold text-slate-500 hover:text-[#1A5FA8] hover:border-[#1A5FA8] transition-colors">
                        + zone
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button type="button" onClick={addBatiment}
              className="w-full border border-dashed border-slate-300 rounded-xl py-2.5 text-sm font-semibold text-slate-500 hover:text-[#1A5FA8] hover:border-[#1A5FA8] transition-colors">
              + bâtiment
            </button>
          </>
        ) : (
          <>
            {/* ── Accordéon bâtiments → zones (mode simplifié — 1 tâche synthétique/zone) ── */}
            <div className="space-y-3">
              {batimentsSimple.map(b => (
                <div key={b.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5">
                    <button type="button" onClick={() => toggleExpandedSimple(b.id)} className="text-slate-400 hover:text-slate-600 shrink-0">
                      <svg className={`w-4 h-4 transition-transform ${expandedSimple.has(b.id) ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6"/>
                      </svg>
                    </button>
                    <input
                      type="text" value={b.nom} onChange={e => setNomBatimentSimple(b.id, e.target.value)}
                      placeholder="Nom du bâtiment"
                      className="flex-1 bg-transparent text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:px-2 focus:py-1 focus:rounded-lg transition-all"
                    />
                    <span className="text-xs text-slate-400 shrink-0">{b.zones.length} zone{b.zones.length !== 1 ? 's' : ''}</span>
                    <button type="button" onClick={() => deleteBatimentSimple(b.id)}
                      className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Supprimer le bâtiment">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>

                  {expandedSimple.has(b.id) && (
                    <div className="p-3 space-y-2.5">
                      {b.zones.map(z => (
                        <div key={z.id} className="border border-slate-100 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text" value={z.nom} onChange={e => setNomZoneSimple(b.id, z.id, e.target.value)}
                              placeholder="Nom de la zone"
                              className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-700 focus:outline-none focus:bg-slate-50 focus:px-2 focus:py-1 focus:rounded-lg transition-all"
                            />
                            <input
                              type="text" value={z.libelle} onChange={e => setLibelleZoneSimple(b.id, z.id, e.target.value)}
                              placeholder="Nettoyage complet"
                              className="w-40 shrink-0 px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"
                            />
                            <button type="button" onClick={() => deleteZoneSimple(b.id, z.id)}
                              className="shrink-0 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Supprimer la zone">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {JOURS.map(j => (
                              <button key={j.value} type="button" onClick={() => toggleJourZoneSimple(b.id, z.id, j.value)}
                                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                                  z.jours.includes(j.value) ? 'bg-[#0A2E5A] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}>
                                {j.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      <button type="button" onClick={() => addZoneSimple(b.id)}
                        className="w-full border border-dashed border-slate-300 rounded-xl py-2 text-xs font-semibold text-slate-500 hover:text-[#1A5FA8] hover:border-[#1A5FA8] transition-colors">
                        + zone
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button type="button" onClick={addBatimentSimple}
              className="w-full border border-dashed border-slate-300 rounded-xl py-2.5 text-sm font-semibold text-slate-500 hover:text-[#1A5FA8] hover:border-[#1A5FA8] transition-colors">
              + bâtiment
            </button>

            {nbZonesSimple === 0 && (
              <p className="text-xs text-amber-600 text-center">Ajoutez au moins une zone pour continuer.</p>
            )}
          </>
        )}

        {/* ── Hors planning hebdo ── */}
        {analyse.hors_planning_hebdo.length > 0 && (
          <div className="border border-orange-200 bg-orange-50 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider">Hors planning hebdo</p>
            <div className="space-y-1.5">
              {analyse.hors_planning_hebdo.map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-200 text-orange-800 uppercase">
                    {h.frequence}
                  </span>
                  <span className="text-slate-700">
                    <span className="font-medium">{h.libelle}</span>
                    {h.note && <span className="text-slate-500"> — {h.note}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Alertes ── */}
        {analyse.alertes.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Alertes</p>
            <ul className="space-y-1.5">
              {analyse.alertes.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="shrink-0 mt-0.5">⚠</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onBack}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Relancer l&apos;analyse
          </button>
          <button type="button" onClick={() => onContinue(buildStructure())}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            Continuer → Validation
          </button>
        </div>
      </div>
    </div>
  )
}
