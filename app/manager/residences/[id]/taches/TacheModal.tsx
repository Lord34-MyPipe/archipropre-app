'use client'

import { useState, useMemo } from 'react'
import type { ZoneResidence, TacheTemplate, FrequenceType } from '@/lib/types'

/* ── Constantes ──────────────────────────────── */

const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'] as const
const JOUR_COURTS: Record<string,string> = {
  lundi:'Lun', mardi:'Mar', mercredi:'Mer', jeudi:'Jeu',
  vendredi:'Ven', samedi:'Sam', dimanche:'Dim',
}
const MOIS_NOMS = ['Janvier','Février','Mars','Avril','Mai','Juin',
                   'Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const MOIS_COURTS = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc']

const DUREE_PRESETS = [
  { label: '2min',  value: 2 },
  { label: '5min',  value: 5 },
  { label: '10min', value: 10 },
  { label: '15min', value: 15 },
  { label: '30min', value: 30 },
  { label: '1h',    value: 60 },
]

const TRIMESTRE_MOIS: Record<number, number[]> = {
  0: [1,4,7,10],
  1: [2,5,8,11],
  2: [3,6,9,12],
}
const SEMESTRE_MOIS: Record<number, number[]> = {
  0: [1,7], 1: [2,8], 2: [3,9], 3: [4,10], 4: [5,11], 5: [6,12],
}
const SEMAINE_LABELS = ['','1ère','2ème','3ème','4ème','Dernière']

const FREQ_OPTIONS: { value: FrequenceType; label: string }[] = [
  { value: 'hebdo',             label: 'Hebdomadaire' },
  { value: 'mensuel',           label: 'Mensuelle' },
  { value: 'trimestriel',       label: 'Trimestrielle (4×/an)' },
  { value: 'semestriel',        label: 'Semestrielle (2×/an)' },
  { value: 'annuel',            label: 'Annuelle (1×/an)' },
  { value: 'sur_passage',       label: 'Sur passage externe' },
  { value: 'contrainte_horaire',label: 'Contrainte horaire fixe' },
]

/* ── Form state ──────────────────────────────── */

interface FormState {
  zoneId: string
  newZoneName: string
  libelle: string
  frequenceType: FrequenceType
  joursSemaine: string[]        // hebdo + contrainte_horaire
  jourSemaineMensuel: string    // jour fixe pour mensuel/trim/sem/annuel
  semaineDuMois: number         // 1-5
  trimestreOffset: number       // 0/1/2
  semestreOffset: number        // 0-5
  moisAnnuel: number            // 1-12
  heureDebut: string
  heureFin: string
  contrainteExterne: string
  tacheLieeId: string
  dureeMinutes: number
}

function defaultForm(initialZoneId = '', tache?: TacheTemplate | null): FormState {
  if (!tache) return {
    zoneId: initialZoneId, newZoneName: '',
    libelle: '', frequenceType: 'hebdo',
    joursSemaine: [], jourSemaineMensuel: 'lundi',
    semaineDuMois: 1, trimestreOffset: 0, semestreOffset: 0, moisAnnuel: 1,
    heureDebut: '', heureFin: '', contrainteExterne: '', tacheLieeId: '', dureeMinutes: 0,
  }

  // Reverse-engineer from tache
  const ft = tache.frequence_type
  let trimestreOffset = 0
  let semestreOffset  = 0
  let moisAnnuel = 1

  if (ft === 'trimestriel' && tache.mois_de_annee?.length) {
    const first = tache.mois_de_annee[0]
    trimestreOffset = ((first - 1) % 3)
  }
  if (ft === 'semestriel' && tache.mois_de_annee?.length) {
    const first = tache.mois_de_annee[0]
    for (const [k, v] of Object.entries(SEMESTRE_MOIS)) {
      if (v[0] === first) { semestreOffset = Number(k); break }
    }
  }
  if (ft === 'annuel' && tache.mois_de_annee?.length) {
    moisAnnuel = tache.mois_de_annee[0]
  }

  const isMonthly = ['mensuel','trimestriel','semestriel','annuel'].includes(ft)

  return {
    zoneId: tache.zone_id ?? '',
    newZoneName: '',
    libelle: tache.libelle,
    frequenceType: ft,
    joursSemaine: isMonthly ? [] : (tache.jours_semaine ?? []),
    jourSemaineMensuel: isMonthly ? (tache.jours_semaine?.[0] ?? 'lundi') : 'lundi',
    semaineDuMois: tache.semaine_du_mois?.[0] ?? 1,
    trimestreOffset,
    semestreOffset,
    moisAnnuel,
    heureDebut: tache.heure_debut ?? '',
    heureFin:   tache.heure_fin ?? '',
    contrainteExterne: tache.contrainte_externe ?? '',
    tacheLieeId: tache.tache_liee_id ?? '',
    dureeMinutes: tache.duree_minutes ?? 0,
  }
}

function buildPayload(f: FormState, residenceId: string) {
  const isMonthly = ['mensuel','trimestriel','semestriel','annuel'].includes(f.frequenceType)

  let moisDeAnnee: number[] | null = null
  let frequenceValeur = 1

  if (f.frequenceType === 'trimestriel') {
    moisDeAnnee = TRIMESTRE_MOIS[f.trimestreOffset]
    frequenceValeur = 4
  } else if (f.frequenceType === 'semestriel') {
    moisDeAnnee = SEMESTRE_MOIS[f.semestreOffset]
    frequenceValeur = 2
  } else if (f.frequenceType === 'annuel') {
    moisDeAnnee = [f.moisAnnuel]
    frequenceValeur = 1
  }

  return {
    residenceId,
    zoneId:             f.zoneId === '__new__' ? null : (f.zoneId || null),
    libelle:            f.libelle,
    frequenceType:      f.frequenceType,
    frequenceValeur,
    joursSemaine:       isMonthly ? [f.jourSemaineMensuel] : f.joursSemaine,
    semaineDuMois:      isMonthly ? [f.semaineDuMois] : null,
    moisDeAnnee,
    heureDebut:         f.frequenceType === 'contrainte_horaire' ? f.heureDebut : null,
    heureFin:           f.frequenceType === 'contrainte_horaire' ? f.heureFin   : null,
    contrainteExterne:  f.frequenceType === 'contrainte_horaire' ? f.contrainteExterne : null,
    tacheLieeId:        f.tacheLieeId || null,
    dureeMinutes:       f.dureeMinutes || 0,
  }
}

/* ── Props ───────────────────────────────────── */

interface Props {
  residenceId: string
  contratId: string
  zones: ZoneResidence[]
  taches: TacheTemplate[]
  editingTache: TacheTemplate | null
  initialZoneId?: string
  onClose: () => void
  onSaved: (tache: TacheTemplate, isNew: boolean) => void
  onZoneCreated: (zone: ZoneResidence) => void
}

/* ── Composant ───────────────────────────────── */

export default function TacheModal({
  residenceId, contratId, zones, taches, editingTache, initialZoneId, onClose, onSaved, onZoneCreated,
}: Props) {
  const [form, setForm] = useState<FormState>(() =>
    defaultForm(initialZoneId ?? '', editingTache)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Quand on change la fréquence, reset les champs dépendants
  function setFreq(ft: FrequenceType) {
    setForm(f => ({ ...f, frequenceType: ft, joursSemaine: [], jourSemaineMensuel: 'lundi', semaineDuMois: 1 }))
  }

  function toggleJour(jour: string) {
    setForm(f => ({
      ...f,
      joursSemaine: f.joursSemaine.includes(jour)
        ? f.joursSemaine.filter(j => j !== jour)
        : [...f.joursSemaine, jour],
    }))
  }

  /* ── Résumé dynamique ── */
  const summary = useMemo(() => {
    const semaine = SEMAINE_LABELS[form.semaineDuMois] ?? ''
    const jour    = JOUR_COURTS[form.jourSemaineMensuel] ?? ''
    switch (form.frequenceType) {
      case 'hebdo':
        if (!form.joursSemaine.length) return null
        return `Planifiée le ${form.joursSemaine.map(j => JOUR_COURTS[j]).join(' + ')} de chaque semaine`
      case 'mensuel':
        return `Planifiée le ${semaine} ${jour} de chaque mois`
      case 'trimestriel': {
        const mois = TRIMESTRE_MOIS[form.trimestreOffset].map(m => MOIS_COURTS[m-1]).join(', ')
        return `Planifiée le ${semaine} ${jour} de ${mois}`
      }
      case 'semestriel': {
        const mois = SEMESTRE_MOIS[form.semestreOffset].map(m => MOIS_COURTS[m-1]).join(' et ')
        return `Planifiée le ${semaine} ${jour} de ${mois}`
      }
      case 'annuel':
        return `Planifiée le ${semaine} ${jour} de ${MOIS_NOMS[form.moisAnnuel - 1]}`
      case 'sur_passage':
        return 'Planifiée sur passage du prestataire externe'
      case 'contrainte_horaire':
        if (!form.joursSemaine.length) return null
        return `${form.joursSemaine.map(j => JOUR_COURTS[j]).join('+')} de ${form.heureDebut || '?'}h à ${form.heureFin || '?'}h`
      default: return null
    }
  }, [form])

  async function handleSave() {
    if (!form.libelle.trim()) { setError('Le libellé est obligatoire'); return }
    if (form.frequenceType === 'hebdo' && !form.joursSemaine.length)
      { setError('Sélectionnez au moins un jour'); return }
    if (form.frequenceType === 'contrainte_horaire' && !form.joursSemaine.length)
      { setError('Sélectionnez au moins un jour'); return }

    setSaving(true); setError('')

    let zoneId = form.zoneId === '__new__' ? null : (form.zoneId || null)

    // Créer la zone si demandé
    if (form.zoneId === '__new__') {
      if (!form.newZoneName.trim()) { setError('Nom de zone obligatoire'); setSaving(false); return }
      const zRes = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residenceId, nom: form.newZoneName.trim(), ordre: zones.length + 1, contratId }),
      })
      const zData = await zRes.json()
      if (!zRes.ok) { setError(zData.error ?? 'Erreur création zone'); setSaving(false); return }
      onZoneCreated(zData.data as ZoneResidence)
      zoneId = zData.data.id
    }

    const payload = { ...buildPayload(form, residenceId), zoneId }

    const method = editingTache ? 'PATCH' : 'POST'
    const body   = editingTache
      ? { id: editingTache.id, ...payload }
      : payload

    const res  = await fetch('/api/taches-template', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Erreur'); return }

    if (editingTache) {
      // payload uses camelCase; TacheTemplate uses snake_case — map explicitly
      onSaved({
        ...editingTache,
        zone_id:            zoneId,
        libelle:            payload.libelle,
        frequence_type:     payload.frequenceType as TacheTemplate['frequence_type'],
        frequence_valeur:   payload.frequenceValeur,
        jours_semaine:      payload.joursSemaine,
        semaine_du_mois:    payload.semaineDuMois,
        mois_de_annee:      payload.moisDeAnnee,
        heure_debut:        payload.heureDebut,
        heure_fin:          payload.heureFin,
        contrainte_externe: payload.contrainteExterne,
        tache_liee_id:      payload.tacheLieeId,
        duree_minutes:      payload.dureeMinutes,
      } as TacheTemplate, false)
    } else {
      onSaved(json.data as TacheTemplate, true)
    }
  }

  const isMonthly = ['mensuel','trimestriel','semestriel','annuel'].includes(form.frequenceType)

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-slate-800 text-lg">
            {editingTache ? 'Modifier la tâche' : 'Ajouter une tâche'}
          </h3>
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Zone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Zone</label>
            <select value={form.zoneId} onChange={e => setForm(f => ({ ...f, zoneId: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]">
              <option value="">Sans zone</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.nom}</option>)}
              <option value="__new__">+ Créer une nouvelle zone</option>
            </select>
            {form.zoneId === '__new__' && (
              <input
                type="text" value={form.newZoneName} onChange={e => setForm(f => ({ ...f, newZoneName: e.target.value }))}
                placeholder="Nom de la nouvelle zone…"
                className="mt-2 w-full px-3.5 py-2.5 rounded-xl border border-[#0BBFBF] text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"/>
            )}
          </div>

          {/* Libellé */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Libellé *</label>
            <input type="text" value={form.libelle} onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))}
              placeholder="ex : Aspiration et lavage humide des sols"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"/>
          </div>

          {/* Type de fréquence */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Fréquence *</label>
            <div className="space-y-2">
              {FREQ_OPTIONS.map(opt => (
                <label key={opt.value} className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                  form.frequenceType === opt.value
                    ? 'border-[#0BBFBF] bg-[#0BBFBF]/5'
                    : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input type="radio" name="freq" value={opt.value}
                    checked={form.frequenceType === opt.value}
                    onChange={() => setFreq(opt.value)}
                    className="accent-[#0BBFBF]"/>
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Jours — hebdo */}
          {form.frequenceType === 'hebdo' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Jours de la semaine *</label>
              <div className="flex gap-2 flex-wrap">
                {JOURS.map(j => (
                  <button key={j} type="button" onClick={() => toggleJour(j)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      form.joursSemaine.includes(j)
                        ? 'bg-[#0A2E5A] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {JOUR_COURTS[j]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Jours + horaires — contrainte_horaire */}
          {form.frequenceType === 'contrainte_horaire' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jour(s) concerné(s) *</label>
                <div className="flex gap-2 flex-wrap">
                  {JOURS.map(j => (
                    <button key={j} type="button" onClick={() => toggleJour(j)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        form.joursSemaine.includes(j)
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}>
                      {JOUR_COURTS[j]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Heure début</label>
                  <input type="time" value={form.heureDebut} onChange={e => setForm(f => ({ ...f, heureDebut: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Heure fin</label>
                  <input type="time" value={form.heureFin} onChange={e => setForm(f => ({ ...f, heureFin: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"/>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description de la contrainte</label>
                <input type="text" value={form.contrainteExterne}
                  onChange={e => setForm(f => ({ ...f, contrainteExterne: e.target.value }))}
                  placeholder="ex : Sortie encombrants selon passage collecte mairie"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"/>
              </div>
            </>
          )}

          {/* Trimestriel — choix de l'offset */}
          {form.frequenceType === 'trimestriel' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Mois de début du trimestre</label>
              {[0,1,2].map(i => (
                <label key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors mb-2 ${
                  form.trimestreOffset === i ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input type="radio" name="trimestre" value={i}
                    checked={form.trimestreOffset === i}
                    onChange={() => setForm(f => ({ ...f, trimestreOffset: i }))}
                    className="accent-orange-500"/>
                  <span className="text-sm text-slate-700">
                    {MOIS_NOMS[i]} → ({TRIMESTRE_MOIS[i].map(m => MOIS_COURTS[m-1]).join(', ')})
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Semestriel — choix de la paire */}
          {form.frequenceType === 'semestriel' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Mois concernés</label>
              <div className="grid grid-cols-2 gap-2">
                {[0,1,2,3,4,5].map(i => (
                  <label key={i} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                    form.semestreOffset === i ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input type="radio" name="semestre" value={i}
                      checked={form.semestreOffset === i}
                      onChange={() => setForm(f => ({ ...f, semestreOffset: i }))}
                      className="accent-purple-500"/>
                    <span className="text-xs text-slate-700">
                      {SEMESTRE_MOIS[i].map(m => MOIS_COURTS[m-1]).join(' + ')}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Annuel — choix du mois */}
          {form.frequenceType === 'annuel' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mois de l'intervention</label>
              <select value={form.moisAnnuel} onChange={e => setForm(f => ({ ...f, moisAnnuel: Number(e.target.value) }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]">
                {MOIS_NOMS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}

          {/* Semaine du mois — pour mensuel/trim/sem/annuel */}
          {isMonthly && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Semaine du mois</label>
              <div className="flex gap-2 flex-wrap">
                {[1,2,3,4,5].map(s => (
                  <button key={s} type="button" onClick={() => setForm(f => ({ ...f, semaineDuMois: s }))}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      form.semaineDuMois === s
                        ? 'bg-[#1A5FA8] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {SEMAINE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Jour de la semaine — pour mensuel/trim/sem/annuel */}
          {isMonthly && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Jour de la semaine</label>
              <div className="flex gap-2 flex-wrap">
                {JOURS.map(j => (
                  <button key={j} type="button"
                    onClick={() => setForm(f => ({ ...f, jourSemaineMensuel: j }))}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                      form.jourSemaineMensuel === j
                        ? 'bg-[#0A2E5A] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {JOUR_COURTS[j]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Résumé */}
          {summary && (
            <div className="bg-[#0BBFBF]/10 border border-[#0BBFBF]/30 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-[#0A2E5A] mb-0.5">Résumé</p>
              <p className="text-sm text-[#0A2E5A]">→ {summary}</p>
            </div>
          )}

          {/* Durée estimée */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Durée estimée</label>
            <div className="flex flex-wrap gap-2 items-center">
              {DUREE_PRESETS.map(p => (
                <button key={p.value} type="button"
                  onClick={() => setForm(f => ({ ...f, dureeMinutes: p.value }))}
                  className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                    form.dureeMinutes === p.value
                      ? 'bg-[#0A2E5A] text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min="1" max="480"
                  value={form.dureeMinutes > 0 && !DUREE_PRESETS.some(p => p.value === form.dureeMinutes) ? form.dureeMinutes : ''}
                  onChange={e => setForm(f => ({ ...f, dureeMinutes: parseInt(e.target.value) || 0 }))}
                  placeholder="min"
                  className="w-16 px-2.5 py-1.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"
                />
                {form.dureeMinutes > 0 && (
                  <span className="text-xs text-[#0BBFBF] font-semibold">
                    {form.dureeMinutes < 60 ? `${form.dureeMinutes}min` : `${Math.floor(form.dureeMinutes/60)}h${form.dureeMinutes%60>0?String(form.dureeMinutes%60).padStart(2,'0'):''}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tâche liée */}
          {taches.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Tâche liée <span className="text-slate-400 font-normal">(optionnel)</span>
              </label>
              <select value={form.tacheLieeId} onChange={e => setForm(f => ({ ...f, tacheLieeId: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]">
                <option value="">Aucune</option>
                {taches.filter(t => t.id !== editingTache?.id).map(t => (
                  <option key={t.id} value={t.id}>{t.libelle}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3 rounded-xl text-white text-sm font-semibold disabled:opacity-60 transition-all"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            {saving ? 'Enregistrement…' : editingTache ? 'Enregistrer' : 'Ajouter la tâche'}
          </button>
        </div>
      </div>
    </div>
  )
}
