'use client'

import { useMemo, useRef, useState } from 'react'
import type { AnalyseIA, AnalyseTacheIA, Creneau } from './AnalyseContratWizard'
import { ORDRE_JOURS, type DispatchJour } from '@/lib/dispatchSemaine'

// ── Structure soumise à /api/residences/[id]/contrats/creer-complet (item 3) ──
// Même forme que p_structure de la RPC creer_contrat_complet (migration 033) :
// bâtiments → zones → tâches. Refonte top-down (21/07) : plus de durée, les
// tâches basse fréquence transportent leur positionnement (semaine_du_mois /
// mois_de_annee), alignées sur taches_template.
export interface StructureSoumission {
  batiments: {
    nom: string
    zones: {
      nom: string
      taches: {
        libelle: string; frequence_type: string; jours_semaine: string[]
        semaine_du_mois: number[] | null; mois_de_annee: number[] | null
      }[]
    }[]
  }[]
}

// ── State local éditable — arbre unique (refonte top-down, 21/07). L'ancien
// double mode "simplifié / détaillé" est retiré : le mode simplifié ignorait
// silencieusement les tâches basse fréquence positionnées par l'IA (constaté à
// l'audit), un seul arbre est plus simple et plus juste. ──

interface TacheLocale {
  id: string
  libelle: string
  frequence: AnalyseTacheIA['frequence_type']
  jours: string[]              // hebdo : 1+ jours. Basse fréquence : exactement 1 jour positionné.
  semaineDuMois: number[] | null
  moisDeAnnee: number[] | null
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

const JOURS: { value: string; label: string }[] = [
  { value: 'lundi',    label: 'Lun' },
  { value: 'mardi',    label: 'Mar' },
  { value: 'mercredi', label: 'Mer' },
  { value: 'jeudi',    label: 'Jeu' },
  { value: 'vendredi', label: 'Ven' },
  { value: 'samedi',   label: 'Sam' },
  { value: 'dimanche', label: 'Dim' },
]
const JOURS_LABELS_LONG: Record<string, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
  jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

const FREQ_OPTIONS: { value: AnalyseTacheIA['frequence_type']; label: string }[] = [
  { value: 'hebdo',       label: 'Hebdomadaire' },
  { value: 'mensuel',     label: 'Mensuelle' },
  { value: 'trimestriel', label: 'Trimestrielle' },
  { value: 'semestriel',  label: 'Semestrielle' },
  { value: 'annuel',      label: 'Annuelle' },
]

function dureeCreneauMinutes(c: Creneau): number {
  const [h1, m1] = c.heure_debut.split(':').map(Number)
  const [h2, m2] = c.heure_fin.split(':').map(Number)
  return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1))
}

interface Props {
  analyse: AnalyseIA
  joursOrganisationActuelle: string[]  // jours de l'organisation actuelle (étape 1)
  creneaux: Creneau[]                  // pour la borne créneau par jour (R5) + vue par jour de passage
  joursRamassageContainers: string[]
  minutesHebdoReelles: number          // main d'œuvre (déjà corrigée binôme, étape 1)
  plafondRentable: number
  ecartRentable: number
  tauxCible: number
  facteurRessource: number             // 1 (pas de binôme) ou 2 (binôme) — présence × facteur = ressource
  onBack: () => void                              // "Relancer l'analyse" → retour étape 2 (texte conservé au niveau du wizard)
  onContinue: (structure: StructureSoumission, dispatch: DispatchJour[]) => void  // "Continuer → Validation" → étape 4
}

export default function AnalyseContratEtape3({
  analyse, joursOrganisationActuelle, creneaux, joursRamassageContainers,
  minutesHebdoReelles, plafondRentable, ecartRentable, tauxCible, facteurRessource,
  onBack, onContinue,
}: Props) {
  const idRef = useRef(0)
  const nextId = () => `l${idRef.current++}`

  // ── Arbre bâtiments → zones → tâches — pré-rempli depuis l'analyse IA ──

  const [batiments, setBatiments] = useState<BatimentLocal[]>(() =>
    analyse.batiments.map(b => ({
      id: nextId(),
      nom: b.nom,
      zones: b.zones.map(z => ({
        id: nextId(),
        nom: z.nom,
        taches: z.taches.map(t => ({
          id: nextId(), libelle: t.libelle, frequence: t.frequence_type,
          jours: [...t.jours_semaine], semaineDuMois: t.semaine_du_mois, moisDeAnnee: t.mois_de_annee,
        })),
      })),
    })),
  )
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(analyse.batiments.map((_, i) => `b${i}`)),
  )

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
        taches: [...z.taches, { id: nextId(), libelle: '', frequence: 'hebdo', jours: [], semaineDuMois: null, moisDeAnnee: null }],
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

  const nbTachesTotal = useMemo(
    () => batiments.reduce((s, b) => s + b.zones.reduce((s2, z) => s2 + z.taches.filter(t => t.jours.length > 0).length, 0), 0),
    [batiments],
  )

  // ── Répartition semaine (chantier "Répartition semaine") — tournées transverses
  // + containers, INCHANGÉS. Le sélecteur bâtiment→jour a été retiré (retour
  // Julien : sans objet, les jours sont déjà imposés par les créneaux de
  // l'étape 1) — "bâtiment complet ce jour" est désormais dérivé directement de
  // l'arbre (au moins une tâche hebdo de ce bâtiment positionnée ce jour-là).

  interface TourneeLocale { id: string; libelle: string; zones: string[]; jour: string }

  const joursTries = useMemo(
    () => [...joursOrganisationActuelle].sort((a, b) => ORDRE_JOURS.indexOf(a) - ORDRE_JOURS.indexOf(b)),
    [joursOrganisationActuelle],
  )

  const [tournees, setTournees] = useState<TourneeLocale[]>(() =>
    analyse.dispatch_semaine.flatMap(j => j.tournees_transverses.map(t => ({ id: nextId(), libelle: t.libelle, zones: t.zones, jour: j.jour }))),
  )
  const [containersParJour, setContainersParJour] = useState<Record<string, 'sortie' | 'rentree' | ''>>(() => {
    const out: Record<string, 'sortie' | 'rentree' | ''> = {}
    for (const j of analyse.dispatch_semaine) if (j.containers) out[j.jour] = j.containers
    return out
  })

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

  function batimentsActifsParJour(jour: string): string[] {
    const noms = new Set<string>()
    for (const b of batiments) {
      if (!b.nom.trim()) continue
      const actif = b.zones.some(z => z.taches.some(t => t.frequence === 'hebdo' && t.jours.includes(jour)))
      if (actif) noms.add(b.nom.trim())
    }
    return [...noms]
  }

  // Durées moyennes observées dans la proposition IA (bâtiment / tournée /
  // containers) — sert uniquement à estimer dispatch_semaine.duree_totale_
  // estimee_minutes (garde-fou R5, INCHANGÉ) ; sans lien avec les tâches
  // détaillées ci-dessus (qui n'ont plus de durée, cf refonte top-down).
  const { dureeMoyBatiment, dureeMoyTournee, dureeContainers } = useMemo(() => {
    let sumBat = 0, nBat = 0, sumTour = 0, nTour = 0, sumCont = 0, nCont = 0
    for (const j of analyse.dispatch_semaine) {
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
  }, [analyse.dispatch_semaine])

  function dureeJour(jour: string): number {
    const nbBat = batimentsActifsParJour(jour).length
    const nbTour = tournees.filter(t => t.jour === jour).length
    const hasContainers = !!containersParJour[jour]
    return Math.round(nbBat * dureeMoyBatiment + nbTour * dureeMoyTournee + (hasContainers ? dureeContainers : 0))
  }

  function buildDispatch(): DispatchJour[] {
    return joursTries
      .map((jour): DispatchJour | null => {
        const bats = batimentsActifsParJour(jour)
        const tours = tournees.filter(t => t.jour === jour).map(t => ({ libelle: t.libelle || 'Tournée transverse', zones: t.zones }))
        const containers = containersParJour[jour] || null
        if (bats.length === 0 && tours.length === 0 && !containers) return null
        return { jour, batiments_complets: bats, tournees_transverses: tours, containers, duree_totale_estimee_minutes: dureeJour(jour) }
      })
      .filter((x): x is DispatchJour => x !== null)
  }

  function buildStructure(): StructureSoumission {
    return {
      batiments: batiments.map(b => ({
        nom: b.nom,
        zones: b.zones.map(z => ({
          nom: z.nom,
          taches: z.taches
            .filter(t => t.jours.length > 0)
            .map(t => ({
              libelle: t.libelle, frequence_type: t.frequence, jours_semaine: t.jours,
              semaine_du_mois: t.semaineDuMois, mois_de_annee: t.moisDeAnnee,
            })),
        })),
      })),
    }
  }

  // ── Vue par jour de passage (maquette validée, 21/07) — passage ordinaire
  // (tâches hebdo positionnées ce jour) + variantes (tâches basse fréquence
  // positionnées ce jour précis). Dérivée en lecture seule de l'arbre édité
  // plus haut : aucun state séparé, ne peut pas diverger.

  const vueParJour = useMemo(() => {
    return joursTries.map(jour => {
      const creneau = creneaux.find(c => c.jours.includes(jour))
      const presenceMin = creneau ? dureeCreneauMinutes(creneau) : 0
      const ressourceMin = presenceMin * facteurRessource

      const ordinaire: { batiment: string; zone: string; taches: string[] }[] = []
      const variantes: { batiment: string; zone: string; libelle: string; frequence: string; semaineDuMois: number[] | null; moisDeAnnee: number[] | null }[] = []
      let nbTachesOrdinaire = 0

      for (const b of batiments) {
        for (const z of b.zones) {
          const hebdoJour = z.taches.filter(t => t.frequence === 'hebdo' && t.jours.includes(jour))
          if (hebdoJour.length > 0) {
            ordinaire.push({ batiment: b.nom || 'Bâtiment', zone: z.nom || 'Zone', taches: hebdoJour.map(t => t.libelle || '(sans libellé)') })
            nbTachesOrdinaire += hebdoJour.length
          }
          for (const t of z.taches) {
            if (t.frequence !== 'hebdo' && t.jours[0] === jour) {
              variantes.push({
                batiment: b.nom || 'Bâtiment', zone: z.nom || 'Zone', libelle: t.libelle || '(sans libellé)',
                frequence: t.frequence, semaineDuMois: t.semaineDuMois, moisDeAnnee: t.moisDeAnnee,
              })
            }
          }
        }
      }
      return { jour, presenceMin, ressourceMin, ordinaire, variantes, nbTachesOrdinaire }
    })
  }, [joursTries, creneaux, batiments, facteurRessource])

  // Indicateur discret de déséquilibre : minutes de présence par tâche ce
  // jour-là, comparé à la MOYENNE des autres jours du même contrat (pas à un
  // objectif absolu — on ne réintroduit aucune estimation de durée par tâche,
  // juste une densité relative tâches/temps). Muet si <2 jours comparables.
  const densiteMoyenne = useMemo(() => {
    const valides = vueParJour.filter(j => j.nbTachesOrdinaire > 0 && j.presenceMin > 0)
    if (valides.length < 2) return null
    const ratios = valides.map(j => j.presenceMin / j.nbTachesOrdinaire)
    return ratios.reduce((s, r) => s + r, 0) / ratios.length
  }, [vueParJour])

  function densiteBadge(j: (typeof vueParJour)[number]) {
    if (densiteMoyenne === null || j.nbTachesOrdinaire === 0 || j.presenceMin === 0) return null
    const ratio = j.presenceMin / j.nbTachesOrdinaire
    if (ratio < densiteMoyenne * 0.6) return { label: 'Plus chargé', cls: 'bg-amber-50 text-amber-600' }
    if (ratio > densiteMoyenne * 1.4) return { label: 'Plus dégagé', cls: 'bg-slate-100 text-slate-500' }
    return null
  }

  const minutesHebdoPresenceTotal = useMemo(
    () => creneaux.reduce((sum, c) => sum + dureeCreneauMinutes(c) * c.jours.length, 0),
    [creneaux],
  )

  const ecartRentableOk = ecartRentable <= 0

  return (
    <div className="pb-8">

      {/* ── Bandeau récap sticky — top-down (21/07) : un seul indicateur
          "Actuel/Plafond rentable", plus de % bottom-up ni de tautologie. ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 md:px-8 py-3">
        <div className="max-w-3xl mx-auto">
          {facteurRessource > 1 && (
            <p className="text-xs text-slate-500 mb-1">
              {Math.round(minutesHebdoPresenceTotal)} min/sem (créneau) × {facteurRessource} agents (binôme) = <span className="font-semibold">{Math.round(minutesHebdoReelles)} min/sem</span> de main d&apos;œuvre
            </p>
          )}
          <div className={`text-sm font-medium ${ecartRentableOk ? 'text-green-700' : 'text-amber-700'}`}>
            Actuel <span className="font-bold">{Math.round(minutesHebdoReelles)} min/sem</span>
            {' '}— Plafond rentable ({tauxCible} €/h) <span className="font-bold">{Math.round(plafondRentable)} min/sem</span>
            {' '}— Écart {ecartRentable >= 0 ? '+' : ''}{Math.round(ecartRentable)} min
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-4">

        {/* ── Vue par jour de passage ── */}
        <div className="space-y-3">
          {vueParJour.map(j => {
            const badge = densiteBadge(j)
            return (
              <div key={j.jour} className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800">
                    {JOURS_LABELS_LONG[j.jour] ?? j.jour}
                    <span className="ml-2 font-normal text-slate-500">
                      {Math.round(j.presenceMin)} min présence
                      {facteurRessource > 1 && <> · {Math.round(j.ressourceMin)} min ressource (binôme ×{facteurRessource})</>}
                    </span>
                  </span>
                  {badge && (
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                  )}
                </div>

                <div className="p-3 space-y-3">
                  {j.ordinaire.length === 0 && j.variantes.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Aucune tâche positionnée ce jour pour l&apos;instant.</p>
                  ) : (
                    <>
                      {j.ordinaire.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Passage ordinaire</p>
                          <div className="space-y-1">
                            {j.ordinaire.map((g, i) => (
                              <p key={i} className="text-sm text-slate-700">
                                <span className="font-medium">{g.batiment} / {g.zone}</span>
                                <span className="text-slate-500"> — {g.taches.join(', ')}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      {j.variantes.length > 0 && (
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-[11px] font-semibold text-[#1A5FA8] uppercase tracking-wider mb-1.5">Variante — occurrence positionnée</p>
                          <div className="space-y-1">
                            {j.variantes.map((v, i) => (
                              <p key={i} className="text-sm text-slate-700">
                                <span className="font-medium">{v.batiment} / {v.zone}</span>
                                <span className="text-slate-500"> — {v.libelle}</span>
                                <span className="text-[#1A5FA8]">
                                  {' '}({FREQ_OPTIONS.find(f => f.value === v.frequence)?.label ?? v.frequence}
                                  {v.semaineDuMois ? `, semaine ${v.semaineDuMois[0]}` : ''}
                                  {v.moisDeAnnee ? `, mois ${v.moisDeAnnee.join('/')}` : ''})
                                </span>
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Détail par bâtiment (édition) ── */}
        <div className="pt-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Détail par bâtiment (édition)</p>
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
                                // Positionnement (semaine du mois / mois de l'année) éditable en détail
                                // à la sous-étape 4 — ici, résumé en lecture seule du positionnement proposé.
                                <p className="text-[11px] text-slate-400 italic">
                                  Basse fréquence — positionnée {t.jours[0] ? `le ${JOURS.find(j => j.value === t.jours[0])?.label ?? t.jours[0]}` : '(jour non déterminé)'}
                                  {t.semaineDuMois ? ` (semaine ${t.semaineDuMois[0]})` : ''}
                                  {t.moisDeAnnee ? ` (mois ${t.moisDeAnnee.join(', ')})` : ''} — détail modifiable à une prochaine étape.
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
            className="w-full border border-dashed border-slate-300 rounded-xl py-2.5 text-sm font-semibold text-slate-500 hover:text-[#1A5FA8] hover:border-[#1A5FA8] transition-colors mt-3">
            + bâtiment
          </button>

          {nbTachesTotal === 0 && (
            <p className="text-xs text-amber-600 text-center mt-2">Ajoutez au moins une tâche positionnée pour continuer.</p>
          )}
        </div>

        {/* ── Répartition de la semaine (tournées + containers) ── */}
        <div className="border border-slate-200 rounded-2xl p-4 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Répartition de la semaine</p>

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
          {joursRamassageContainers.length > 0 && (
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

          {/* Récap jour par jour (lecture seule, dérivé) — plus de colonne durée
              estimée (confuse, basée sur des moyennes AI sans rapport avec le
              budget top-down, cf retour Julien) : ne subsiste que R5 en interne
              (garde-fou, inchangé), non affichée ici. */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 uppercase tracking-wider">
                  <th className="py-1.5 pr-2 font-semibold">Jour</th>
                  <th className="py-1.5 pr-2 font-semibold">Bâtiments complets</th>
                  <th className="py-1.5 pr-2 font-semibold">Tournées</th>
                  <th className="py-1.5 pr-2 font-semibold">Containers</th>
                </tr>
              </thead>
              <tbody>
                {joursTries.map(j => {
                  const bats = batimentsActifsParJour(j)
                  const tours = tournees.filter(t => t.jour === j)
                  const cont = containersParJour[j]
                  return (
                    <tr key={j} className="border-t border-slate-100 align-top">
                      <td className="py-1.5 pr-2 font-medium text-slate-700 whitespace-nowrap">{JOURS.find(x => x.value === j)?.label ?? j}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{bats.join(', ') || '—'}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{tours.map(t => t.libelle || 'Tournée').join(', ') || '—'}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{cont === 'sortie' ? 'Sortie' : cont === 'rentree' ? 'Rentrée' : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Hors planning hebdo — filet défensif résiduel (cf sous-étape 1), rarement peuplé ── */}
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
          <button type="button" onClick={() => onContinue(buildStructure(), buildDispatch())}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            Continuer → Validation
          </button>
        </div>
      </div>
    </div>
  )
}
