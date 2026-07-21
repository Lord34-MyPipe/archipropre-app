'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ORDRE_JOURS, type DispatchJour } from '@/lib/dispatchSemaine'

const JOURS: { value: string; label: string }[] = [
  { value: 'lundi',    label: 'Lun' },
  { value: 'mardi',    label: 'Mar' },
  { value: 'mercredi', label: 'Mer' },
  { value: 'jeudi',    label: 'Jeu' },
  { value: 'vendredi', label: 'Ven' },
  { value: 'samedi',   label: 'Sam' },
  { value: 'dimanche', label: 'Dim' },
]

interface Creneau {
  jours: string[]
  heure_debut: string
  heure_fin: string
}
interface BatimentInfo {
  nom: string
  zones: string[]
}
interface AssignationBatiment { nom: string; jour: string }
interface TourneeLocale { id: string; libelle: string; zones: string[]; jour: string }

interface Props {
  residenceId: string
  contratId: string
  batiments: BatimentInfo[]
  joursPassage: string[]
  creneaux: Creneau[]
  initialJoursRamassage: string[]
  initialDispatch: DispatchJour[]
  onClose: () => void
}

function toggleItem(item: string, list: string[]): string[] {
  return list.includes(item) ? list.filter(j => j !== item) : [...list, item]
}

export default function RepartitionSemainePanel({
  residenceId, contratId, batiments, joursPassage, creneaux, initialJoursRamassage, initialDispatch, onClose,
}: Props) {
  const router = useRouter()
  const idRef = useRef(0)
  const nextId = () => `t${idRef.current++}`

  const joursTries = useMemo(
    () => [...joursPassage].sort((a, b) => ORDRE_JOURS.indexOf(a) - ORDRE_JOURS.indexOf(b)),
    [joursPassage],
  )
  const nomsBatiments = useMemo(() => batiments.map(b => b.nom), [batiments])

  const [joursRamassage, setJoursRamassage] = useState<string[]>(initialJoursRamassage)
  const [assignations, setAssignations] = useState<AssignationBatiment[]>(() => {
    const out: AssignationBatiment[] = []
    for (const j of initialDispatch) for (const nom of j.batiments_complets) out.push({ nom, jour: j.jour })
    for (const nom of nomsBatiments) if (!out.some(a => a.nom === nom)) out.push({ nom, jour: '' })
    return out
  })
  const [tournees, setTournees] = useState<TourneeLocale[]>(() =>
    initialDispatch.flatMap(j => j.tournees_transverses.map(t => ({ id: nextId(), libelle: t.libelle, zones: t.zones, jour: j.jour }))),
  )
  const [containersParJour, setContainersParJour] = useState<Record<string, 'sortie' | 'rentree' | ''>>(() => {
    const out: Record<string, 'sortie' | 'rentree' | ''> = {}
    for (const j of initialDispatch) if (j.containers) out[j.jour] = j.containers
    return out
  })
  const [dureesRef, setDureesRef] = useState<DispatchJour[]>(initialDispatch) // sert uniquement au calcul de durée moyenne (récap live)

  const [alertesIA, setAlertesIA] = useState<string[]>([])
  // Garde-fou déterministe (ne fait jamais confiance au texte de l'IA) sur la
  // proposition BRUTE reçue — purement informatif ici : contrairement au
  // panneau de simulation, "Enregistrer" envoie l'état édité par l'utilisateur
  // (assignations/tournées/containers), pas la proposition brute, donc rien à
  // désactiver en fonction de ce résultat — seulement à signaler.
  const [violationsIA, setViolationsIA] = useState<string[]>([])
  const [proposing, setProposing] = useState(false)
  const [proposeErr, setProposeErr] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  const [regenerating, setRegenerating] = useState(false)
  const [regenerateMsg, setRegenerateMsg] = useState<string | null>(null)
  const [regenerateErr, setRegenerateErr] = useState<string | null>(null)

  function setAssignationJour(nom: string, jour: string) {
    setAssignations(prev => [...prev.filter(a => a.nom !== nom), { nom, jour }])
  }
  function setTourneeJour(id: string, jour: string) {
    setTournees(prev => prev.map(t => t.id === id ? { ...t, jour } : t))
  }
  function setTourneeLibelle(id: string, libelle: string) {
    setTournees(prev => prev.map(t => t.id === id ? { ...t, libelle } : t))
  }
  function deleteTournee(id: string) {
    setTournees(prev => prev.filter(t => t.id !== id))
  }
  function addTournee() {
    setTournees(prev => [...prev, { id: nextId(), libelle: '', zones: [], jour: joursTries[0] ?? '' }])
  }
  function setContainersJour(jour: string, val: 'sortie' | 'rentree' | '') {
    setContainersParJour(prev => ({ ...prev, [jour]: val }))
  }

  const { dureeMoyBatiment, dureeMoyTournee, dureeContainers } = useMemo(() => {
    let sumBat = 0, nBat = 0, sumTour = 0, nTour = 0, sumCont = 0, nCont = 0
    for (const j of dureesRef) {
      const nbUnites = j.batiments_complets.length + j.tournees_transverses.length + (j.containers ? 1 : 0)
      if (nbUnites === 0) continue
      const part = j.duree_totale_estimee_minutes / nbUnites
      sumBat += part * j.batiments_complets.length; nBat += j.batiments_complets.length
      sumTour += part * j.tournees_transverses.length; nTour += j.tournees_transverses.length
      if (j.containers) { sumCont += part; nCont++ }
    }
    return {
      dureeMoyBatiment: nBat > 0 ? sumBat / nBat : 20,
      dureeMoyTournee:  nTour > 0 ? sumTour / nTour : 10,
      dureeContainers:  nCont > 0 ? sumCont / nCont : 5,
    }
  }, [dureesRef])

  // duree_totale_estimee_minutes PERSISTÉ (buildDispatch, champ informatif du
  // dispatch_semaine sauvegardé) — inchangé par ce fix, laissé tel quel.
  function dureeJour(jour: string): number {
    const nbBat = assignations.filter(a => a.jour === jour).length
    const nbTour = tournees.filter(t => t.jour === jour).length
    const hasContainers = !!containersParJour[jour]
    return Math.round(nbBat * dureeMoyBatiment + nbTour * dureeMoyTournee + (hasContainers ? dureeContainers : 0))
  }
  function creneauMaxMinutes(jour: string): number | null {
    const c = creneaux.find(c => c.jours.includes(jour))
    if (!c) return null
    const [h1, m1] = c.heure_debut.split(':').map(Number)
    const [h2, m2] = c.heure_fin.split(':').map(Number)
    return (h2 * 60 + m2) - (h1 * 60 + m1)
  }
  // Durée AFFICHÉE dans le récap (fix 21/07, audit GMCO) : lecture directe du
  // créneau du jour plutôt que la moyenne lissée ci-dessus (dureeJour), qui
  // provient d'une estimation IA jamais recalée sur les créneaux réels et
  // faussée par un lissage inter-jours (ex. GMCO : 148/78 min affichés au
  // lieu de 60/90). Changement d'affichage pur — dureeJour (persisté via
  // buildDispatch) n'est pas modifiée.
  function dureeAfficheeJour(jour: string): number {
    const nbBat = assignations.filter(a => a.jour === jour).length
    const nbTour = tournees.filter(t => t.jour === jour).length
    const hasContainers = !!containersParJour[jour]
    if (nbBat === 0 && nbTour === 0 && !hasContainers) return 0
    return creneauMaxMinutes(jour) ?? 0
  }

  const nomsUniques = useMemo(() => [...new Set(assignations.map(a => a.nom))], [assignations])
  const joursByNom = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of assignations) {
      if (!m.has(a.nom)) m.set(a.nom, new Set())
      if (a.jour) m.get(a.nom)!.add(a.jour)
    }
    return m
  }, [assignations])

  function buildDispatch(): DispatchJour[] {
    return joursTries
      .map((jour): DispatchJour | null => {
        const bats = assignations.filter(a => a.jour === jour).map(a => a.nom)
        const tours = tournees.filter(t => t.jour === jour).map(t => ({ libelle: t.libelle || 'Tournée transverse', zones: t.zones }))
        const containers = containersParJour[jour] || null
        if (bats.length === 0 && tours.length === 0 && !containers) return null
        return { jour, batiments_complets: bats, tournees_transverses: tours, containers, duree_totale_estimee_minutes: dureeJour(jour) }
      })
      .filter((x): x is DispatchJour => x !== null)
  }

  async function handleProposer() {
    setProposing(true)
    setProposeErr(null)
    try {
      const res = await fetch(`/api/residences/${residenceId}/contrats/${contratId}/dispatch/proposer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joursRamassageContainers: joursRamassage }),
      })
      const json = await res.json()
      if (!res.ok) { setProposeErr(json.error ?? 'Erreur inconnue.'); setProposing(false); return }
      const dispatch = json.dispatch_semaine as DispatchJour[]
      setDureesRef(dispatch)
      const newAssignations: AssignationBatiment[] = []
      for (const j of dispatch) for (const nom of j.batiments_complets) newAssignations.push({ nom, jour: j.jour })
      for (const nom of nomsBatiments) if (!newAssignations.some(a => a.nom === nom)) newAssignations.push({ nom, jour: '' })
      setAssignations(newAssignations)
      setTournees(dispatch.flatMap(j => j.tournees_transverses.map(t => ({ id: nextId(), libelle: t.libelle, zones: t.zones, jour: j.jour }))))
      const newContainers: Record<string, 'sortie' | 'rentree' | ''> = {}
      for (const j of dispatch) if (j.containers) newContainers[j.jour] = j.containers
      setContainersParJour(newContainers)
      setAlertesIA(json.alertes ?? [])
      setViolationsIA(json.verification?.violations ?? [])
    } catch {
      setProposeErr('Impossible de contacter le serveur.')
    } finally {
      setProposing(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveErr(null)
    setSavedOk(false)
    try {
      const res = await fetch(`/api/residences/${residenceId}/contrats/${contratId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jours_ramassage_containers: joursRamassage,
          dispatch_semaine: buildDispatch(),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setSaveErr(json.error ?? 'Erreur inconnue.'); setSaving(false); return }
      setSavedOk(true)
      router.refresh()
    } catch {
      setSaveErr('Impossible de contacter le serveur.')
    } finally {
      setSaving(false)
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
      router.refresh()
    } catch {
      setRegenerateErr('Impossible de contacter le serveur.')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center">
      <div className="relative bg-white w-full md:max-w-2xl md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[93vh]">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-700">Répartition de la semaine</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors" aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Jours de ramassage containers */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Jours de ramassage containers (agglo) — laisser vide si non concerné
            </label>
            <div className="flex flex-wrap gap-1.5">
              {JOURS.map(j => (
                <button key={j.value} type="button"
                  onClick={() => setJoursRamassage(prev => toggleItem(j.value, prev))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    joursRamassage.includes(j.value) ? 'bg-[#0A2E5A] text-white border-[#0A2E5A]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}>
                  {j.label}
                </button>
              ))}
            </div>
          </div>

          {/* Proposition IA */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleProposer} disabled={proposing}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
              style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
              {proposing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Proposition en cours…
                </>
              ) : 'Proposer une répartition (IA)'}
            </button>
          </div>
          {proposeErr && <p className="text-xs text-red-600">{proposeErr}</p>}

          {/* Garde-fou déterministe sur la proposition brute reçue — purement
              informatif (l'édition manuelle ci-dessous peut déjà avoir corrigé
              le souci ; "Enregistrer" envoie l'état édité, pas cette proposition). */}
          {violationsIA.length > 0 && (
            <div className="border border-red-300 bg-red-50 rounded-2xl p-4 space-y-1.5">
              <p className="text-sm font-bold text-red-700">
                ⚠ La proposition IA ne respectait pas les règles de répartition
              </p>
              <ul className="space-y-1">
                {violationsIA.map((v, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                    <span className="shrink-0 mt-0.5">✕</span><span>{v}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-600 pt-1">
                Vérifiez/corrigez l&apos;assignation ci-dessous avant d&apos;enregistrer.
              </p>
            </div>
          )}

          {alertesIA.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-1.5">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Alertes de la proposition IA</p>
              <ul className="space-y-1">
                {alertesIA.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                    <span className="shrink-0 mt-0.5">⚠</span><span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Assignation des bâtiments */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Bâtiments — un jour complet par bâtiment</p>
            {nomsUniques.length === 0 && <p className="text-xs text-slate-400 italic">Aucun bâtiment configuré pour ce contrat.</p>}
            {nomsUniques.map(nom => {
              const joursAssignes = [...(joursByNom.get(nom) ?? [])]
              const warn = joursAssignes.length !== 1
              const jourActuel = assignations.find(a => a.nom === nom)?.jour ?? ''
              return (
                <div key={nom} className="flex items-center gap-2">
                  {warn && <span className="shrink-0 text-red-500" title="Bâtiment absent ou dupliqué sur plusieurs jours">⚠</span>}
                  <span className={`flex-1 min-w-0 truncate text-sm ${warn ? 'text-red-600 font-medium' : 'text-slate-700'}`}>{nom}</span>
                  <select
                    value={jourActuel}
                    onChange={e => setAssignationJour(nom, e.target.value)}
                    className={`shrink-0 px-2 py-1.5 border rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40 ${warn ? 'border-red-300' : 'border-slate-200'}`}
                  >
                    <option value="">— non assigné —</option>
                    {joursTries.map(j => <option key={j} value={j}>{JOURS.find(x => x.value === j)?.label ?? j}</option>)}
                  </select>
                </div>
              )
            })}
          </div>

          {/* Tournées transverses */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">Tournées transverses (ex. 2e passage halls)</p>
            {tournees.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <input
                  type="text" value={t.libelle} onChange={e => setTourneeLibelle(t.id, e.target.value)}
                  placeholder="Libellé (ex. Halls Bât 5-8, 2e passage)"
                  className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"
                />
                <select
                  value={t.jour} onChange={e => setTourneeJour(t.id, e.target.value)}
                  className="shrink-0 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"
                >
                  <option value="">— non assigné —</option>
                  {joursTries.map(j => <option key={j} value={j}>{JOURS.find(x => x.value === j)?.label ?? j}</option>)}
                </select>
                <button type="button" onClick={() => deleteTournee(t.id)}
                  className="shrink-0 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Supprimer la tournée">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" onClick={addTournee}
              className="text-xs font-semibold text-[#0BBFBF] hover:text-[#0BBFBF]/80 transition-colors">
              + tournée
            </button>
          </div>

          {/* Containers par jour */}
          {joursRamassage.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500">Containers</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {joursTries.map(j => (
                  <div key={j} className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-xs text-slate-500">{JOURS.find(x => x.value === j)?.label ?? j}</span>
                    <select
                      value={containersParJour[j] ?? ''}
                      onChange={e => setContainersJour(j, e.target.value as 'sortie' | 'rentree' | '')}
                      className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]/40"
                    >
                      <option value="">—</option>
                      <option value="sortie">Sortie</option>
                      <option value="rentree">Rentrée</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Récap jour par jour (lecture seule) */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase tracking-wider">
                  <th className="py-1.5 pr-2 font-semibold">Jour</th>
                  <th className="py-1.5 pr-2 font-semibold">Bâtiments complets</th>
                  <th className="py-1.5 pr-2 font-semibold">Tournées</th>
                  <th className="py-1.5 pr-2 font-semibold">Containers</th>
                  <th className="py-1.5 pr-2 font-semibold">Durée est.</th>
                </tr>
              </thead>
              <tbody>
                {joursTries.map(j => {
                  const bats = assignations.filter(a => a.jour === j).map(a => a.nom)
                  const tours = tournees.filter(t => t.jour === j)
                  const cont = containersParJour[j]
                  const duree = dureeAfficheeJour(j)
                  const max = creneauMaxMinutes(j)
                  const overflow = max !== null && duree > max
                  return (
                    <tr key={j} className="border-t border-slate-100 align-top">
                      <td className="py-1.5 pr-2 font-medium text-slate-700 whitespace-nowrap">{JOURS.find(x => x.value === j)?.label ?? j}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{bats.join(', ') || '—'}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{tours.map(t => t.libelle || 'Tournée').join(', ') || '—'}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{cont === 'sortie' ? 'Sortie' : cont === 'rentree' ? 'Rentrée' : '—'}</td>
                      <td className={`py-1.5 pr-2 whitespace-nowrap ${overflow ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                        {duree} min{overflow && ` ⚠ > ${max} min`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {saveErr && <p className="text-xs text-red-600">{saveErr}</p>}
          {regenerateMsg && <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800 text-center">{regenerateMsg}</div>}
          {regenerateErr && <p className="text-xs text-red-600">{regenerateErr}</p>}
        </div>

        <div className="shrink-0 flex gap-3 px-5 py-4 border-t border-slate-100">
          <button type="button" onClick={handleSave} disabled={saving}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            {saving ? 'Enregistrement…' : savedOk ? '✓ Enregistré' : 'Enregistrer'}
          </button>
          <button type="button" onClick={handleRegenerer} disabled={regenerating || !savedOk}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title={!savedOk ? 'Enregistrez la répartition avant de régénérer le planning' : undefined}>
            {regenerating ? 'Génération…' : 'Régénérer le planning'}
          </button>
        </div>
      </div>
    </div>
  )
}
