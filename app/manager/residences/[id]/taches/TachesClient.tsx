'use client'

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import Link from 'next/link'
import type { Residence, ZoneResidence, TacheTemplate, ContratResidence } from '@/lib/types'
import TacheModal from './TacheModal'
import ZoneFormModal from './ZoneFormModal'
import AjoutBatimentModal from './AjoutBatimentModal'
import JoursBulkModal, { type JoursMode } from './JoursBulkModal'
import type { ParametresSociete, StatsReel } from './page'
import { ClipboardList, CalendarX, Building2, ChevronRight } from 'lucide-react'
import { computeProrataZones, volumeHebdoMinutes, nbPassagesHebdo, type ProrataZoneInput, type ProrataZoneResult } from '@/lib/prorata'
import SimulationTauxRentablePanel from './SimulationTauxRentablePanel'

/* ── Constantes ──────────────────────────────── */

const JOURS_ALL = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
// 3 lettres partout (polish3) — puces lisibles au lieu de "L+V".
const JOUR_COURTS: Record<string,string> = {
  lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu', vendredi:'Ven', samedi:'Sam', dimanche:'Dim',
}
const JOUR_NOMS: Record<string,string> = {
  lundi:'Lundi', mardi:'Mardi', mercredi:'Mercredi', jeudi:'Jeudi',
  vendredi:'Vendredi', samedi:'Samedi', dimanche:'Dimanche',
}
const MOIS_COURTS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']
const SEMAINE_LABELS = ['','1ère','2ème','3ème','4ème','Dern.']

// Même formule que AnalyseContratEtape3.tsx:85 (vueParJour) — durée du créneau
// d'un jour, en minutes de présence. Dupliquée volontairement (calcul d'un
// écran de consultation, pas une source de vérité partagée — cf lib/dispatchDuree.ts).
function dureeCreneauMinutes(c: { heure_debut: string; heure_fin: string }): number {
  const [h1, m1] = c.heure_debut.split(':').map(Number)
  const [h2, m2] = c.heure_fin.split(':').map(Number)
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
}

const FREQ_BADGE: Record<string, { bg: string; label: string }> = {
  hebdo:             { bg: 'bg-green-100 text-green-700',   label: 'Hebdo' },
  mensuel:           { bg: 'bg-blue-100 text-blue-700',     label: 'Mensuel' },
  trimestriel:       { bg: 'bg-orange-100 text-orange-700', label: 'Trim.' },
  semestriel:        { bg: 'bg-purple-100 text-purple-700', label: 'Semestr.' },
  annuel:            { bg: 'bg-red-100 text-red-700',       label: 'Annuel' },
  sur_passage:       { bg: 'bg-slate-100 text-slate-600',   label: 'Passage' },
  contrainte_horaire:{ bg: 'bg-amber-100 text-amber-700',   label: 'Horaire' },
}

const FREQ_COL_LABELS: Record<string,string> = {
  mensuel: 'Mensuel', trimestriel: 'Trim.', semestriel: 'Semest.', annuel: 'Annuel', sur_passage: 'Passage',
}

// Découpe la fréquence en texte + jours (§ item 3) : les jours sont rendus en
// puces (JourPuces) plutôt qu'en notation compacte "L+V" dans le texte.
interface FreqParts { before?: string; jours: string[]; after?: string }

function freqParts(t: TacheTemplate): FreqParts {
  const jours   = t.jours_semaine ?? []
  const semaine = SEMAINE_LABELS[t.semaine_du_mois?.[0] ?? 0] ?? ''
  const mois    = (t.mois_de_annee ?? []).map(m => MOIS_COURTS[m-1]).join(' ')

  switch (t.frequence_type) {
    case 'hebdo':             return { jours }
    case 'mensuel':           return { before: semaine, jours, after: '/mois' }
    case 'trimestriel':       return { before: semaine, jours, after: `· ${mois}` }
    case 'semestriel':        return { before: semaine, jours, after: `· ${mois}` }
    case 'annuel':            return { before: semaine, jours, after: `· ${mois}` }
    case 'sur_passage':       return { jours: [], after: 'Sur passage' }
    case 'contrainte_horaire':
      return { jours, after: t.heure_debut && t.heure_fin ? `${t.heure_debut}→${t.heure_fin}` : undefined }
    default: return { jours: [] }
  }
}

// Puces de jours lisibles (polish) : "Lun" "Ven"… triées Lun→Dim, dédupliquées.
// Remplace la notation compacte "L+V". Réutilisé pour l'en-tête bâtiment et
// sous chaque tâche (freqParts).
function JourPuces({ jours }: { jours: string[] }) {
  const sorted = JOURS_ALL.filter(j => jours.includes(j))
  if (!sorted.length) return null
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {sorted.map(j => (
        <span key={j} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
          {JOUR_COURTS[j]}
        </span>
      ))}
    </span>
  )
}

/* ── Toast ───────────────────────────────────── */

function Toast({ message, type, onDone }: { message: string; type: 'success'|'error'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t) }, [onDone])
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-medium flex items-center gap-2 ${
      type === 'success' ? 'bg-[#0A2E5A]' : 'bg-red-500'
    }`}>
      {type === 'success' ? '✓' : '✕'} {message}
    </div>
  )
}

/* ── Inline rename zone ───────────────────────── */

/* ── Durée helpers ────────────────────────────── */

const DUREE_PRESETS = [
  { label: '2min',  value: 2 },
  { label: '5min',  value: 5 },
  { label: '10min', value: 10 },
  { label: '15min', value: 15 },
  { label: '30min', value: 30 },
  { label: '1h',    value: 60 },
]

function formatDuree(minutes: number): string {
  if (minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`
}

// Puces durée ZONE (§4.3) — durée d'UN passage. Distinctes des puces durée
// TÂCHE ci-dessus (DUREE_PRESETS). null = "Auto" → repli sur le prorata.
const ZONE_DUREE_PRESETS: { label: string; value: number }[] = [
  { label: '5min',  value: 5 },
  { label: '10min', value: 10 },
  { label: '15min', value: 15 },
  { label: '20min', value: 20 },
  { label: '30min', value: 30 },
  { label: '45min', value: 45 },
  { label: '1h',    value: 60 },
]

/* ── Props ───────────────────────────────────── */

interface Props {
  residence: Residence
  zones: ZoneResidence[]
  taches: TacheTemplate[]
  contrat?: ContratResidence | null
  parametres?: ParametresSociete | null
  statsReel?: StatsReel | null
  contratId?: string
  contratLibelle?: string
  estBinome?: boolean  // chips par jour (top-down) — binôme de l'agent du contrat
}

/* ── Composant principal ─────────────────────── */

export default function TachesClient({ residence, zones: initialZones, taches: initialTaches, contrat, parametres, statsReel, contratId, contratLibelle, estBinome }: Props) {
  const [zones, setZones]         = useState<ZoneResidence[]>(initialZones)
  const [taches, setTaches]       = useState<TacheTemplate[]>(initialTaches)
  const [view, setView]           = useState<'zone' | 'day'>('zone')
  const [expanded, setExpanded]   = useState<Set<string>>(new Set(initialZones.map(z => z.id)))
  // Repli/dépli des bâtiments (affichage local). Vide = tout replié par défaut.
  const [expandedBatiments, setExpandedBatiments] = useState<Set<string>>(new Set())
  const [modal, setModal]         = useState<{ open: boolean; zoneId?: string }>({ open: false })
  const [editingTache, setEditing]= useState<TacheTemplate | null>(null)
  const [zoneModal, setZoneModal] = useState<{ mode: 'create' } | { mode: 'edit'; zone: ZoneResidence } | null>(null)
  const [showBatimentModal, setShowBatimentModal] = useState(false)
  const [joursBulk, setJoursBulk] = useState<{ label: string; tacheIds: string[]; initialJours: string[] } | null>(null)
  const [joursBulkBusy, setJoursBulkBusy] = useState(false)
  const [toast, setToast]         = useState<{ message: string; type: 'success'|'error' } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'zone'|'tache'; id: string; label: string } | null>(null)
  const [showSimulation, setShowSimulation] = useState(false)

  const showToast = useCallback((message: string, type: 'success'|'error' = 'success') => {
    setToast({ message, type })
  }, [])

  function openModal(zoneId?: string) {
    setEditing(null)
    setModal({ open: true, zoneId })
  }
  function openEdit(t: TacheTemplate) {
    setEditing(t)
    setModal({ open: true })
  }
  function closeModal() { setModal({ open: false }); setEditing(null) }

  /* ── Zone CRUD ── */

  // Bâtiments déjà saisis sur ce contrat (autocomplétion du formulaire de zone)
  const batimentsExistants = useMemo(
    () => [...new Set(zones.map(z => z.batiment).filter((b): b is string => !!b && b.trim() !== ''))].sort(),
    [zones],
  )

  // Regroupement des zones par bâtiment (affichage uniquement, §7.2).
  // - Aucune zone étiquetée → un seul groupe plat, sans en-tête (mono-bâtiment inchangé).
  // - Sinon → un groupe par bâtiment (ordre naturel), puis « Sans bâtiment » en dernier si besoin.
  const zoneGroups = useMemo(() => {
    const hasBatiment = zones.some(z => z.batiment && z.batiment.trim() !== '')
    if (!hasBatiment) {
      return [{ key: '__all__', label: null as string | null, zones }]
    }
    const parBatiment = new Map<string, ZoneResidence[]>()
    const sansBatiment: ZoneResidence[] = []
    for (const z of zones) {
      const b = z.batiment?.trim()
      if (b) {
        const arr = parBatiment.get(b) ?? []
        arr.push(z)
        parBatiment.set(b, arr)
      } else {
        sansBatiment.push(z)
      }
    }
    const keys = [...parBatiment.keys()].sort((a, b) =>
      a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }),
    )
    const groups: { key: string; label: string | null; zones: ZoneResidence[] }[] =
      keys.map(b => ({ key: b, label: b, zones: parBatiment.get(b)! }))
    if (sansBatiment.length > 0) {
      groups.push({ key: '__sans__', label: 'Sans bâtiment', zones: sansBatiment })
    }
    return groups
  }, [zones])

  // Bâtiments repliables : clés des groupes avec en-tête (mono-bâtiment = label null, non repliable)
  const batimentKeys      = zoneGroups.filter(g => g.label !== null).map(g => g.key)
  const hasBatiments      = batimentKeys.length > 0
  const allBatOuverts     = hasBatiments && batimentKeys.every(k => expandedBatiments.has(k))
  function toggleBatiment(key: string) {
    setExpandedBatiments(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function handleAddZone() { setZoneModal({ mode: 'create' }) }

  // Instanciation d'un bâtiment standard (template) → ajoute zones + tâches créées
  function handleBatimentDone(newZones: ZoneResidence[], newTaches: TacheTemplate[]) {
    setZones(zs => [...zs, ...newZones])
    setTaches(ts => [...ts, ...newTaches])
    setExpanded(s => new Set([...s, ...newZones.map(z => z.id)]))
    setShowBatimentModal(false)
    showToast(`Bâtiment ajouté (${newZones.length} zones, ${newTaches.length} tâches)`)
  }

  // Action groupée sur les jours (bâtiment ou zone) — PATCH en boucle sur les
  // tâches ciblées (route existante réutilisée). Mode : remplacer / ajouter.
  async function applyJoursBulk(mode: JoursMode, jours: string[]) {
    if (!joursBulk) return
    setJoursBulkBusy(true)
    const updates = new Map<string, string[]>()
    try {
      for (const id of joursBulk.tacheIds) {
        const t = taches.find(x => x.id === id)
        if (!t) continue
        const current = t.jours_semaine ?? []
        const next = mode === 'replace'
          ? [...jours]
          : [...new Set([...current, ...jours])]
        const res = await fetch('/api/taches-template', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, joursSemaine: next }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? 'Erreur mise à jour')
        }
        updates.set(id, next)
      }
      setTaches(ts => ts.map(t => updates.has(t.id) ? { ...t, jours_semaine: updates.get(t.id)! } : t))
      setJoursBulk(null)
      showToast(`Jours mis à jour (${updates.size} tâche${updates.size > 1 ? 's' : ''})`)
    } catch (e) {
      // Applique quand même les tâches déjà modifiées pour rester cohérent avec la base
      if (updates.size) setTaches(ts => ts.map(t => updates.has(t.id) ? { ...t, jours_semaine: updates.get(t.id)! } : t))
      showToast(e instanceof Error ? e.message : 'Erreur', 'error')
    } finally {
      setJoursBulkBusy(false)
    }
  }

  // Retour du formulaire de zone (création ou édition) → maj de l'état local
  function handleZoneSaved(zone: ZoneResidence) {
    const isNew = !zones.some(z => z.id === zone.id)
    if (isNew) {
      setZones(z => [...z, zone])
      setExpanded(s => new Set([...s, zone.id]))
      showToast('Zone ajoutée')
    } else {
      setZones(zs => zs.map(z => z.id === zone.id ? { ...z, ...zone } : z))
      showToast('Zone modifiée')
    }
    setZoneModal(null)
  }

  async function handleDuplicateZone(zone: ZoneResidence) {
    const res = await fetch('/api/zones/dupliquer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneId: zone.id }),
    })
    const json = await res.json()
    if (!res.ok) { showToast(json.error ?? 'Erreur duplication', 'error'); return }
    const newZone = json.zone as ZoneResidence
    const newTaches = json.taches as TacheTemplate[]
    setZones(zs => [...zs, newZone])
    setTaches(ts => [...ts, ...newTaches])
    setExpanded(s => new Set([...s, newZone.id]))
    showToast(`Zone dupliquée (${newTaches.length} tâche${newTaches.length > 1 ? 's' : ''} copiée${newTaches.length > 1 ? 's' : ''})`)
  }

  async function handleDeleteZone(id: string) {
    const res = await fetch('/api/zones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) { showToast('Erreur suppression', 'error'); return }
    setZones(zs => zs.filter(z => z.id !== id))
    setTaches(ts => ts.filter(t => t.zone_id !== id))
    showToast('Zone supprimée')
  }

  /* ── Tâche CRUD ── */

  async function handleDeleteTache(id: string) {
    const res = await fetch('/api/taches-template', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) { showToast('Erreur suppression', 'error'); return }
    setTaches(ts => ts.filter(t => t.id !== id))
    showToast('Tâche supprimée')
  }

  function onTacheSaved(tache: TacheTemplate, isNew: boolean) {
    setTaches(ts => isNew ? [...ts, tache] : ts.map(t => t.id === tache.id ? tache : t))
    closeModal()
    showToast(isNew ? 'Tâche ajoutée' : 'Tâche modifiée')
  }

  /* ── Durée auto-save ── */

  async function handleDurationChange(tacheId: string, minutes: number) {
    // Optimistic update
    setTaches(ts => ts.map(t => t.id === tacheId ? { ...t, duree_minutes: minutes } : t))
    const res = await fetch('/api/taches-template', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tacheId, dureeMinutes: minutes }),
    })
    if (!res.ok) {
      showToast('Erreur enregistrement durée', 'error')
      return
    }
    showToast('✓ Durée enregistrée')
    // Recalcule et met à jour duree_estimee_min sur la résidence
    setTaches(prev => {
      const total = prev.reduce((s, t) => s + (t.id === tacheId ? minutes : (t.duree_minutes ?? 0)), 0)
      fetch('/api/residences/duree', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceId: residence.id, dureeEstimeeMin: total }),
      }).catch(() => null)
      return prev
    })
  }

  /* ── Durée ZONE (§4.3) — puces cliquables, repli prorata si null ── */

  async function handleZoneDureeChange(zone: ZoneResidence, minutes: number | null) {
    setZones(zs => zs.map(z => z.id === zone.id ? { ...z, duree_minutes: minutes } : z))
    const res = await fetch('/api/zones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: zone.id, nom: zone.nom, dureeMinutes: minutes }),
    })
    if (!res.ok) {
      showToast('Erreur enregistrement durée zone', 'error')
      setZones(zs => zs.map(z => z.id === zone.id ? { ...z, duree_minutes: zone.duree_minutes ?? null } : z))
      return
    }
    showToast(minutes === null ? '✓ Repli sur le prorata' : '✓ Durée zone enregistrée')
  }

  function onZoneCreated(zone: ZoneResidence) {
    setZones(zs => [...zs, zone])
    setExpanded(s => new Set([...s, zone.id]))
  }

  /* ── Confirm dialog ── */

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    if (confirmDelete.type === 'zone') await handleDeleteZone(confirmDelete.id)
    else await handleDeleteTache(confirmDelete.id)
    setConfirmDelete(null)
  }

  /* ── Vue par jour — build columns ── */

  const dayColData = (() => {
    const cols: Record<string, { zone: ZoneResidence; tache: TacheTemplate }[]> = {}
    const allCols = [...JOURS_ALL, 'mensuel','trimestriel','semestriel','annuel','sur_passage','contrainte_horaire']
    allCols.forEach(c => { cols[c] = [] })

    taches.forEach(t => {
      const zone = zones.find(z => z.id === t.zone_id) ?? { id: '', nom: 'Sans zone', ordre: 999, couleur: null, residence_id: '', created_at: '' }
      const ft = t.frequence_type

      if (ft === 'hebdo' || ft === 'contrainte_horaire') {
        ;(t.jours_semaine ?? []).forEach(j => {
          if (cols[j]) cols[j].push({ zone, tache: t })
        })
      } else if (cols[ft]) {
        cols[ft].push({ zone, tache: t })
      }
    })
    return cols
  })()

  /* ── Tâches par zone ── */

  const tachesByZone = (zoneId: string | null) =>
    taches.filter(t => (zoneId === null ? !t.zone_id : t.zone_id === zoneId))

  const unzonedTaches = tachesByZone(null)

  /* ── Totaux durée (base annuelle) ── */

  const dureTotaux = useMemo(() => {
    let annuel = 0
    let incompleteCount = 0

    taches.forEach(t => {
      const d = t.duree_minutes ?? 0
      if (!d) { incompleteCount++; return }
      const ft = t.frequence_type
      const nJours = Math.max((t.jours_semaine ?? []).length, 1)

      switch (ft) {
        case 'hebdo':
        case 'contrainte_horaire':
          annuel += d * 52 * nJours; break
        case 'mensuel':
          annuel += d * 12 * Math.max(t.frequence_valeur || 1, 1); break
        case 'trimestriel':
          annuel += d * 4; break
        case 'semestriel':
          annuel += d * 2; break
        case 'annuel':
          annuel += d; break
        // sur_passage: non comptabilisé
      }
    })

    return {
      annuel,
      mois: annuel / 12,
      semaine: annuel / 52,
      incomplete: incompleteCount > 0,
      incompleteCount,
    }
  }, [taches])

  /* ── Compteur de contrôle (§4) — volume vendu vs réparti ────────────── */

  // Taux effectif : celui du contrat, sinon le défaut société (même règle que
  // /manager/interventions/[id]/rapport et /api/residences/[id]/rentabilite).
  const tauxEffectif = contrat?.taux_horaire_facturation ?? parametres?.taux_horaire_facturation_defaut ?? 25
  const volumeHebdoMin = useMemo(
    () => volumeHebdoMinutes(contrat?.montant_mensuel ?? null, tauxEffectif),
    [contrat?.montant_mensuel, tauxEffectif],
  )

  // Une zone avec duree_minutes saisie fournit sa durée hebdo explicite
  // (durée d'UN passage × nb de passages) à computeProrataZones ; sinon
  // repli sur le prorata pondéré (coef_duree) — cf lib/prorata.ts §4.3.
  const prorataResults = useMemo(() => {
    const inputs: ProrataZoneInput[] = zones.map(z => {
      const zTaches = taches
        .filter(t => t.zone_id === z.id)
        .map(t => ({ frequence_type: t.frequence_type, jours_semaine: t.jours_semaine }))
      const nbPassages = nbPassagesHebdo(zTaches)
      return {
        id: z.id,
        coefDuree: z.coef_duree ?? 1,
        taches: zTaches,
        dureeExpliciteHebdoMin: z.duree_minutes != null ? z.duree_minutes * nbPassages : null,
      }
    })
    return computeProrataZones(volumeHebdoMin, inputs)
  }, [zones, taches, volumeHebdoMin])

  const prorataByZoneId = useMemo(
    () => new Map(prorataResults.map(r => [r.zoneId, r])),
    [prorataResults],
  )

  const totalReparti = useMemo(
    () => prorataResults.reduce((s, r) => s + r.dureeHebdoMin, 0),
    [prorataResults],
  )

  // Réparti par jour, à titre indicatif : pour chaque jour, somme des durées
  // d'UN passage des zones ayant ≥1 tâche hebdo planifiée ce jour-là.
  const repartiParJour = useMemo(() => {
    const map = new Map<string, number>(JOURS_ALL.map(j => [j, 0]))
    for (const z of zones) {
      const r = prorataByZoneId.get(z.id)
      if (!r) continue
      const joursZone = new Set(
        taches.filter(t => t.zone_id === z.id && t.frequence_type === 'hebdo')
          .flatMap(t => t.jours_semaine ?? []),
      )
      joursZone.forEach(j => { if (map.has(j)) map.set(j, (map.get(j) ?? 0) + r.dureePassageMin) })
    }
    return map
  }, [zones, taches, prorataByZoneId])

  // Chips par jour (Lun...Dim du CompteurRepartition) — top-down (22/07) :
  // dérivées DIRECTEMENT des créneaux du contrat (× binôme), jamais du
  // prorata argent (cf audit du 21/07 : repartiParJour divergeait des
  // créneaux réels — GMCO affichait Mar 2h18/Ven 2h41 au lieu de 2h00/3h00).
  // Repli sur repartiParJour UNIQUEMENT si le contrat n'a pas de créneaux
  // structurés (contrats legacy) — n'affecte PAS le bandeau "Réparti X sur Y
  // vendues/semaine" ni computeProrataZones, toujours utilisés tels quels.
  const facteurRessource = estBinome ? 2 : 1
  const parJourChips = useMemo(() => {
    const creneaux = contrat?.creneaux_acceptes
    if (!creneaux || creneaux.length === 0) return repartiParJour
    const map = new Map<string, number>(JOURS_ALL.map(j => [j, 0]))
    for (const j of JOURS_ALL) {
      const creneau = creneaux.find(c => c.jours.includes(j))
      if (creneau) map.set(j, dureeCreneauMinutes(creneau) * facteurRessource)
    }
    return map
  }, [contrat?.creneaux_acceptes, facteurRessource, repartiParJour])

  const compteurPct = volumeHebdoMin > 0 ? (totalReparti / volumeHebdoMin) * 100 : null
  const compteurCouleur: 'gray' | 'green' | 'orange' | 'red' =
    compteurPct === null ? 'gray' : compteurPct <= 100 ? 'green' : compteurPct <= 115 ? 'orange' : 'red'

  // ── Plafond rentable (taux cible société) — même formule que le wizard
  // "Analyse contrat" (AnalyseContratWizard.tsx : plafondRentable/ecartRentable),
  // via volumeHebdoMinutes (lib/prorata.ts) : ne duplique pas la formule.
  const tauxCible       = parametres?.taux_horaire_cible ?? 30
  const plafondRentable = useMemo(
    () => volumeHebdoMinutes(contrat?.montant_mensuel ?? null, tauxCible),
    [contrat?.montant_mensuel, tauxCible],
  )

  /* ── Render ── */

  return (
    <div className="min-h-screen bg-slate-100">

      {/* Header résidence-level (masqué en contexte contrat : ContratHeader coiffe déjà) */}
      {!contratId && (
      <div className="bg-[#0A2E5A] text-white px-4 py-5 md:px-8">
        <Link href="/manager/residences"
          className="inline-flex items-center gap-2 text-blue-300 hover:text-white text-sm mb-3 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
          </svg>
          Retour aux résidences
        </Link>
        <h1 className="text-xl font-bold">{residence.nom}</h1>
        <p className="text-blue-300 text-sm mt-0.5">
          {zones.length} zone{zones.length > 1 ? 's' : ''} · {taches.length} tâche{taches.length > 1 ? 's' : ''} template
        </p>
      </div>
      )}

      {/* Barre contexte contrat (sans fond bleu redondant sous ContratHeader) */}
      {contratId && (
        <div className="px-4 py-2.5 md:px-8 bg-white border-b border-slate-100">
          <p className="text-xs text-slate-500">
            {zones.length} zone{zones.length > 1 ? 's' : ''} · {taches.length} tâche{taches.length > 1 ? 's' : ''} template
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 md:px-8 flex items-center gap-3 flex-wrap">
        <button onClick={handleAddZone}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          Ajouter une zone
        </button>
        <button onClick={() => setShowBatimentModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-[#1A5FA8] rounded-xl text-sm font-medium hover:bg-blue-100 transition-colors">
          <Building2 className="w-4 h-4" />
          Ajouter un bâtiment standard
        </button>
        <button onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium transition-all"
          style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          Ajouter une tâche
        </button>

        <div className="ml-auto flex bg-slate-100 rounded-xl p-1 gap-1">
          {(['zone','day'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                view === v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
              }`}>
              {v === 'zone' ? 'Par zone' : 'Par jour'}
            </button>
          ))}
        </div>
      </div>

      {/* Corps */}
      <div className="p-4 md:p-8 pb-8 space-y-4">

        {/* Compteur de contrôle — volume vendu vs réparti (§4) */}
        <CompteurRepartition
          volumeHebdoMin={volumeHebdoMin}
          totalReparti={totalReparti}
          pct={compteurPct}
          couleur={compteurCouleur}
          parJour={parJourChips}
          tauxCible={tauxCible}
          plafondRentable={plafondRentable}
          onSimuler={contratId ? () => setShowSimulation(true) : undefined}
        />

        {/* ── Vue par zone ── */}
        {view === 'zone' && (
          <>
            {zones.length === 0 && taches.length === 0 && (
              <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-slate-100">
                <ClipboardList className="w-10 h-10 mb-3 mx-auto text-slate-300" />
                <p className="font-medium text-slate-500">Aucune zone ni tâche pour le moment.</p>
                <div className="flex gap-3 justify-center mt-4">
                  <button onClick={handleAddZone} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium">+ Zone</button>
                  <button onClick={() => openModal()} className="px-4 py-2 bg-[#0A2E5A] text-white rounded-xl text-sm font-medium">+ Tâche</button>
                </div>
              </div>
            )}

            {/* Tout déplier / replier — visible uniquement en présence de bâtiments */}
            {hasBatiments && (
              <div className="flex justify-end -mb-1">
                <button
                  onClick={() => setExpandedBatiments(allBatOuverts ? new Set() : new Set(batimentKeys))}
                  className="text-xs font-semibold text-[#1A5FA8] hover:text-[#0A4A8A] transition-colors"
                >
                  {allBatOuverts ? 'Tout replier' : 'Tout déplier'}
                </button>
              </div>
            )}

            {zoneGroups.map(group => {
              const isMono = group.label === null
              const open   = isMono || expandedBatiments.has(group.key)
              const zoneIds = new Set(group.zones.map(z => z.id))
              const groupeTaches = taches.filter(t => t.zone_id && zoneIds.has(t.zone_id))
              const groupeTacheIds = groupeTaches.map(t => t.id)
              // Union des jours_semaine de toutes les tâches du bâtiment (item 1).
              const joursBatiment = [...new Set(groupeTaches.flatMap(t => t.jours_semaine ?? []))]
              return (
              <div key={group.key} className="space-y-3">
                {group.label && (
                  <div
                    onClick={() => toggleBatiment(group.key)}
                    className="flex items-center gap-2 px-1 pt-1 cursor-pointer select-none"
                  >
                    <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                    <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-600 tracking-wide">{group.label}</h3>
                    <span className="text-xs text-slate-400">
                      {group.zones.length} zone{group.zones.length > 1 ? 's' : ''} · {groupeTacheIds.length} tâche{groupeTacheIds.length > 1 ? 's' : ''}
                    </span>
                    <JourPuces jours={joursBatiment} />
                    {groupeTacheIds.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setJoursBulk({ label: group.label!, tacheIds: groupeTacheIds, initialJours: joursBatiment }) }}
                        className="ml-auto flex items-center gap-1 text-xs font-semibold text-[#1A5FA8] hover:text-[#0A4A8A] transition-colors"
                        title="Modifier les jours de toutes les tâches de ce bâtiment"
                      >
                        <CalendarX className="w-3.5 h-3.5" />
                        Modifier les jours
                      </button>
                    )}
                  </div>
                )}
                {open && group.zones.map(zone => {
              const zoneTaches = tachesByZone(zone.id)
              const isOpen = expanded.has(zone.id)
              // Union des jours_semaine des tâches de la zone (item 2 — pré-sélection modal).
              const joursZone = [...new Set(zoneTaches.flatMap(t => t.jours_semaine ?? []))]
              return (
                <div key={zone.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  {/* Zone header */}
                  <div className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
                    onClick={() => setExpanded(s => {
                      const n = new Set(s); if (n.has(zone.id)) n.delete(zone.id); else n.add(zone.id); return n
                    })}>
                    <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                    </svg>

                    {(() => {
                      const zTotal = zoneTaches.reduce((s, t) => s + (t.duree_minutes ?? 0), 0)
                      const zIncomplete = zoneTaches.some(t => !t.duree_minutes)
                      return (
                        <>
                          <h2 className="font-semibold text-slate-800 flex-1">{zone.nom}</h2>
                          <span className="text-xs text-slate-400 shrink-0">
                            {zoneTaches.length} tâche{zoneTaches.length > 1 ? 's' : ''}
                          </span>
                          {zTotal > 0 && (
                            <span className={`text-xs font-semibold shrink-0 flex items-center gap-1 ${zIncomplete ? 'text-amber-500' : 'text-[#0BBFBF]'}`}>
                              ⏱ {zIncomplete ? '~' : ''}{formatDuree(zTotal)}{zIncomplete ? ' (incomplet)' : ''}
                            </span>
                          )}
                        </>
                      )
                    })()}

                    {(
                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        {zoneTaches.length > 0 && (
                          <button onClick={() => setJoursBulk({ label: zone.nom, tacheIds: zoneTaches.map(t => t.id), initialJours: joursZone })}
                            className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors"
                            title="Modifier les jours de toutes les tâches de cette zone">
                            <CalendarX className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => setZoneModal({ mode: 'edit', zone })}
                          className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 transition-colors"
                          title="Modifier la zone (nom, bâtiment)">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                        </button>
                        <button onClick={() => handleDuplicateZone(zone)}
                          className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center hover:bg-teal-100 transition-colors"
                          title="Dupliquer la zone et ses tâches">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"/></svg>
                        </button>
                        <button onClick={() => setConfirmDelete({ type: 'zone', id: zone.id, label: zone.nom })}
                          className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors"
                          title="Supprimer">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                        </button>
                        <button onClick={() => openModal(zone.id)}
                          className="w-7 h-7 rounded-lg bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 transition-colors"
                          title="Ajouter une tâche">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Durée ZONE (§4.3) — puces cliquables, repli prorata si Auto */}
                  <ZoneDureeChips
                    zone={zone}
                    prorata={prorataByZoneId.get(zone.id)}
                    onChange={minutes => handleZoneDureeChange(zone, minutes)}
                  />

                  {/* Tâches */}
                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {zoneTaches.length === 0 ? (
                        <div className="px-5 py-5 text-center text-slate-400 text-sm">
                          Aucune tâche dans cette zone.{' '}
                          <button onClick={() => openModal(zone.id)} className="text-[#1A5FA8] hover:underline font-medium">+ Ajouter</button>
                        </div>
                      ) : (
                        zoneTaches.map(t => <TacheRow key={t.id} tache={t} onEdit={() => openEdit(t)} onDelete={() => setConfirmDelete({ type: 'tache', id: t.id, label: t.libelle })} onDurationChange={handleDurationChange}/>)
                      )}
                    </div>
                  )}
                </div>
              )
                })}
              </div>
              )
            })}

            {/* Tâches sans zone */}
            {unzonedTaches.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4">
                  <span className="text-slate-400 text-sm italic flex-1">Sans zone ({unzonedTaches.length})</span>
                </div>
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {unzonedTaches.map(t => <TacheRow key={t.id} tache={t} onEdit={() => openEdit(t)} onDelete={() => setConfirmDelete({ type: 'tache', id: t.id, label: t.libelle })} onDurationChange={handleDurationChange}/>)}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Vue par jour ── */}
        {view === 'day' && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 w-32 shrink-0">Zone</th>
                    {JOURS_ALL.map(j => (
                      <th key={j} className="px-2 py-3 text-xs font-semibold text-slate-500 text-center">{JOUR_NOMS[j].slice(0,3)}</th>
                    ))}
                    {Object.entries(FREQ_COL_LABELS).map(([k,v]) => (
                      <th key={k} className="px-2 py-3 text-xs font-semibold text-slate-400 text-center whitespace-nowrap">{v}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const nbCols = 1 + JOURS_ALL.length + Object.keys(FREQ_COL_LABELS).length
                    const FREQ_CLR: Record<string,string> = {
                      mensuel:'bg-blue-50 text-blue-700', trimestriel:'bg-orange-50 text-orange-700',
                      semestriel:'bg-purple-50 text-purple-700', annuel:'bg-red-50 text-red-700',
                      sur_passage:'bg-slate-100 text-slate-600',
                    }
                    // Ligne d'une zone (réutilisée pour chaque groupe bâtiment et pour "Sans zone").
                    const renderZoneRow = (zone: { id: string | null; nom: string }) => {
                      const zoneTachesForDay = taches.filter(t => (zone.id ? t.zone_id === zone.id : !t.zone_id))
                      if (zoneTachesForDay.length === 0) return null
                      return (
                        <tr key={zone.id ?? 'none'} className="border-b border-slate-100 hover:bg-slate-50 transition-colors align-top">
                          <td className="px-4 py-3 font-medium text-slate-700 text-xs">{zone.nom}</td>
                          {JOURS_ALL.map(j => {
                            const cell = dayColData[j]?.filter(e => (zone.id ? e.zone.id === zone.id : !e.zone.id)) ?? []
                            return (
                              <td key={j} className="px-2 py-3 text-center align-top">
                                {cell.map(({ tache: t }) => (
                                  <div key={t.id} className="text-[10px] bg-green-50 text-green-700 rounded px-1.5 py-1 mb-1 text-left leading-tight">
                                    {t.libelle}
                                    {t.frequence_type === 'contrainte_horaire' && t.heure_debut && (
                                      <span className="block text-amber-600">{t.heure_debut}→{t.heure_fin}</span>
                                    )}
                                  </div>
                                ))}
                              </td>
                            )
                          })}
                          {Object.keys(FREQ_COL_LABELS).map(ft => {
                            const cell = dayColData[ft]?.filter(e => (zone.id ? e.zone.id === zone.id : !e.zone.id)) ?? []
                            return (
                              <td key={ft} className="px-2 py-3 text-center align-top">
                                {cell.map(({ tache: t }) => (
                                  <div key={t.id} className={`text-[10px] rounded px-1.5 py-1 mb-1 text-left leading-tight ${FREQ_CLR[ft] ?? ''}`}>
                                    {t.libelle}
                                  </div>
                                ))}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    }

                    return (
                      <>
                        {/* Groupé par bâtiment (réutilise zoneGroups — cohérent avec la vue Par zone).
                            Mono-bâtiment : group.label est null, aucun en-tête, affichage inchangé. */}
                        {zoneGroups.map(group => (
                          <Fragment key={group.key}>
                            {group.label && (
                              <tr className="bg-slate-50">
                                <td colSpan={nbCols} className="px-4 py-1.5">
                                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 tracking-wide">
                                    <Building2 className="w-3 h-3 shrink-0" />
                                    {group.label}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {group.zones.map(zone => renderZoneRow(zone))}
                          </Fragment>
                        ))}
                        {/* Tâches sans zone — hors regroupement bâtiment */}
                        {renderZoneRow({ id: null, nom: 'Sans zone' })}
                      </>
                    )
                  })()}
                </tbody>
              </table>
              {taches.length === 0 && (
                <div className="p-10 text-center text-slate-400">
                  <CalendarX className="w-8 h-8 mb-2 mx-auto text-slate-300" />
                  <p>Aucune tâche à afficher.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>


      {/* Modal tâche */}
      {modal.open && (
        <TacheModal
          residenceId={residence.id}
          contratId={contratId ?? ''}
          zones={zones}
          taches={taches}
          editingTache={editingTache}
          initialZoneId={modal.zoneId}
          onClose={closeModal}
          onSaved={onTacheSaved}
          onZoneCreated={onZoneCreated}
        />
      )}

      {/* Modal zone (création / édition — nom + bâtiment) */}
      {zoneModal && (
        <ZoneFormModal
          residenceId={residence.id}
          contratId={contratId ?? ''}
          ordre={zones.length + 1}
          zone={zoneModal.mode === 'edit' ? zoneModal.zone : null}
          batimentsExistants={batimentsExistants}
          onClose={() => setZoneModal(null)}
          onSaved={handleZoneSaved}
        />
      )}

      {/* Modal bâtiment standard (instancie le template) */}
      {showBatimentModal && (
        <AjoutBatimentModal
          residenceId={residence.id}
          contratId={contratId ?? ''}
          ordreBase={zones.length + 1}
          onClose={() => setShowBatimentModal(false)}
          onDone={handleBatimentDone}
        />
      )}

      {/* Action groupée jours (bâtiment ou zone) */}
      {joursBulk && (
        <JoursBulkModal
          label={joursBulk.label}
          nbTaches={joursBulk.tacheIds.length}
          initialJours={joursBulk.initialJours}
          busy={joursBulkBusy}
          onClose={() => setJoursBulk(null)}
          onApply={applyJoursBulk}
        />
      )}

      {/* Confirmation suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-slate-800">
                Supprimer {confirmDelete.type === 'zone' ? 'la zone' : 'la tâche'} ?
              </h2>
            </div>
            <p className="text-sm text-slate-600 mb-1 font-semibold">{confirmDelete.label}</p>
            {confirmDelete.type === 'zone' && (
              <p className="text-sm text-slate-500 mb-5">Les tâches de cette zone ne seront pas supprimées mais dissociées.</p>
            )}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50">
                Annuler
              </button>
              <button onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)}/>}

      {/* Simulation "au taux rentable" — comparaison dispatch actuel vs proposé */}
      {showSimulation && contratId && (
        <SimulationTauxRentablePanel
          open={showSimulation}
          onClose={() => setShowSimulation(false)}
          residenceId={residence.id}
          contratId={contratId}
          joursRamassageContainers={contrat?.jours_ramassage_containers ?? []}
          plafondRentableMin={plafondRentable}
          tauxCible={tauxCible}
        />
      )}
    </div>
  )
}

/* ── TacheRow ─────────────────────────────────── */

function TacheRow({
  tache: t, onEdit, onDelete, onDurationChange,
}: {
  tache: TacheTemplate
  onEdit: () => void
  onDelete: () => void
  onDurationChange: (id: string, minutes: number) => void
}) {
  const badge = FREQ_BADGE[t.frequence_type]
  const [showCustom, setShowCustom] = useState(false)
  const [customVal, setCustomVal]   = useState('')
  const current = t.duree_minutes ?? 0
  const isPreset = DUREE_PRESETS.some(p => p.value === current)

  function commitCustom() {
    const n = parseInt(customVal, 10)
    if (!isNaN(n) && n > 0) onDurationChange(t.id, n)
    setShowCustom(false)
    setCustomVal('')
  }

  const parts = freqParts(t)

  return (
    <div className="px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800 font-medium truncate">{t.libelle}</p>
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {parts.before && <span className="text-[11px] text-slate-400">{parts.before}</span>}
            {parts.jours.length > 0 && <JourPuces jours={parts.jours} />}
            {parts.after && <span className="text-[11px] text-slate-400">{parts.after}</span>}
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${badge?.bg ?? 'bg-slate-100 text-slate-600'}`}>
          {badge?.label ?? t.frequence_type}
        </span>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit}
            className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center hover:bg-blue-100 transition-colors"
            title="Modifier">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
          </button>
          <button onClick={onDelete}
            className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors"
            title="Supprimer">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
          </button>
        </div>
      </div>

      {/* Pastilles durée */}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {DUREE_PRESETS.map(p => (
          <button
            key={p.value}
            onClick={() => onDurationChange(t.id, p.value)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              current === p.value
                ? 'bg-[#0A2E5A] text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {p.label}
          </button>
        ))}
        {/* Valeur perso non-preset */}
        {current > 0 && !isPreset && (
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#0A2E5A] text-white">
            {formatDuree(current)}
          </span>
        )}
        {showCustom ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus type="number" min="1" max="480" value={customVal}
              onChange={e => setCustomVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitCustom(); if (e.key === 'Escape') setShowCustom(false) }}
              className="w-16 px-2 py-1 rounded-lg border border-[#0BBFBF] text-[11px] focus:outline-none focus:ring-1 focus:ring-[#0BBFBF]"
              placeholder="min"
            />
            <button onClick={commitCustom} className="px-2 py-1 bg-[#0BBFBF] text-white rounded-lg text-[11px] font-semibold">✓</button>
            <button onClick={() => setShowCustom(false)} className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[11px]">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}

/* ── ZoneDureeChips — durée d'UN passage de la zone (§4.3) ───────────── */

function ZoneDureeChips({
  zone, prorata, onChange,
}: {
  zone: ZoneResidence
  prorata: ProrataZoneResult | undefined
  onChange: (minutes: number | null) => void
}) {
  const current = zone.duree_minutes ?? null

  return (
    <div className="px-5 pb-3 -mt-1 flex items-center gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
      <span className="text-[11px] text-slate-400 font-medium mr-0.5">Durée zone :</span>
      {ZONE_DUREE_PRESETS.map(p => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
            current === p.value
              ? 'bg-[#0A2E5A] text-white'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => onChange(null)}
        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
          current === null
            ? 'bg-[#0BBFBF] text-white'
            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
        }`}
        title="Repli automatique sur le prorata pondéré"
      >
        Auto
      </button>
      {current === null && prorata && prorata.nbPassages > 0 && (
        <span className="text-[11px] text-slate-400 italic">
          ≈ {formatDuree(Math.round(prorata.dureePassageMin))}/passage (prorata)
        </span>
      )}
    </div>
  )
}

/* ── CompteurRepartition — volume vendu vs réparti (§4, non bloquant) ─── */

const COULEUR_STYLES: Record<'gray'|'green'|'orange'|'red', { bar: string; text: string; bg: string }> = {
  gray:   { bar: 'bg-slate-300',  text: 'text-slate-500',  bg: 'bg-slate-50' },
  green:  { bar: 'bg-[#0BBFBF]',  text: 'text-[#0A8A8A]',  bg: 'bg-teal-50' },
  orange: { bar: 'bg-amber-500',  text: 'text-amber-600',  bg: 'bg-amber-50' },
  red:    { bar: 'bg-red-500',    text: 'text-red-600',    bg: 'bg-red-50' },
}

function CompteurRepartition({
  volumeHebdoMin, totalReparti, pct, couleur, parJour, tauxCible, plafondRentable, onSimuler,
}: {
  volumeHebdoMin: number
  totalReparti: number
  pct: number | null
  couleur: 'gray' | 'green' | 'orange' | 'red'
  parJour: Map<string, number>
  tauxCible: number
  plafondRentable: number
  onSimuler?: () => void
}) {
  const style = COULEUR_STYLES[couleur]
  const ecartRentableMin = totalReparti - plafondRentable
  const auTauxCibleOk    = ecartRentableMin <= 0

  return (
    <div className={`rounded-2xl border border-slate-100 p-4 md:p-5 ${style.bg}`}>
      {volumeHebdoMin <= 0 ? (
        <p className="text-sm text-slate-400">
          Montant du contrat non renseigné — compteur de contrôle indisponible.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className={`text-sm font-semibold ${style.text}`}>
              Réparti : {formatDuree(Math.round(totalReparti))} sur {formatDuree(Math.round(volumeHebdoMin))} vendues/semaine
            </p>
            {pct !== null && (
              <span className={`text-xs font-bold ${style.text}`}>{Math.round(pct)}%</span>
            )}
          </div>
          <div className="h-2 rounded-full bg-white/70 overflow-hidden mt-2">
            <div
              className={`h-full rounded-full ${style.bar} transition-all`}
              style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
            />
          </div>
          {pct !== null && pct > 100 && (
            <p className={`text-xs font-semibold mt-1.5 ${style.text}`}>
              ⚠ Dépassement de {formatDuree(Math.round(totalReparti - volumeHebdoMin))}
            </p>
          )}

          {/* Au taux cible société (item 1, chantier "simulation taux rentable") */}
          <div className="flex items-center justify-between gap-3 flex-wrap mt-2.5 pt-2.5 border-t border-white/60">
            <p className={`text-xs font-medium ${auTauxCibleOk ? 'text-teal-700' : 'text-amber-600'}`}>
              Au taux cible ({tauxCible} €/h) : <span className="font-semibold">{(plafondRentable / 60).toFixed(1)} h</span>/semaine
              {' '}— écart {ecartRentableMin >= 0 ? '+' : ''}{Math.round(ecartRentableMin)} min
            </p>
            {onSimuler && (
              <button type="button" onClick={onSimuler}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/80 text-[#0A2E5A] hover:bg-white transition-colors border border-slate-200">
                Simuler au taux rentable
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {JOURS_ALL.map(j => {
              const min = parJour.get(j) ?? 0
              return (
                <div key={j} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/70 text-[11px]">
                  <span className="font-semibold text-slate-500">{JOUR_COURTS[j]}</span>
                  <span className={min > 0 ? 'text-slate-600' : 'text-slate-300'}>
                    {min > 0 ? formatDuree(Math.round(min)) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
