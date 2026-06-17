'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import type { Profile } from '@/lib/types'

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const
const JOURS_LABELS: Record<string, string> = {
  lundi: 'Lun', mardi: 'Mar', mercredi: 'Mer',
  jeudi: 'Jeu', vendredi: 'Ven', samedi: 'Sam', dimanche: 'Dim',
}

function genPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const MODE_DEPLACEMENT_OPTIONS = [
  { value: 'tramway', label: '🚊 Tramway uniquement' },
  { value: 'voiture', label: '🚗 Voiture' },
  { value: 'velo',    label: '🛵 Vélo / Scooter' },
] as const

interface FormState {
  nom: string
  prenom: string
  email: string
  telephone: string
  password: string
  vehicule: boolean
  zones_geo: string[]
  competences: string[]
  contrat_heures_hebdo: number
  disponibilites: Record<string, boolean>
  mode_deplacement: string
  secteur_libelle: string
  seuil_cible_pct: number
  binome_agent_id: string
  facteur_binome: number
}

function defaultForm(agent?: Profile | null): FormState {
  const dispo: Record<string, boolean> = {}
  JOURS.forEach(j => {
    dispo[j] = agent ? (agent.disponibilites as Record<string, boolean>)?.[j] ?? false : j !== 'samedi' && j !== 'dimanche'
  })
  return {
    nom: agent?.nom ?? '',
    prenom: agent?.prenom ?? '',
    email: agent?.email ?? '',
    telephone: agent?.telephone ?? '',
    password: genPassword(),
    vehicule: agent?.vehicule ?? false,
    zones_geo: agent?.zones_geo ?? [],
    competences: agent?.competences ?? [],
    contrat_heures_hebdo: agent?.contrat_heures_hebdo ?? 35,
    disponibilites: dispo,
    mode_deplacement: (agent as unknown as Record<string, string>)?.mode_deplacement ?? 'voiture',
    secteur_libelle: (agent as unknown as Record<string, string>)?.secteur_libelle ?? '',
    seuil_cible_pct: (agent as unknown as Record<string, number>)?.seuil_cible_pct ?? 80,
    binome_agent_id: (agent as unknown as Record<string, string>)?.binome_agent_id ?? '',
    facteur_binome: (agent as unknown as Record<string, number>)?.facteur_binome ?? 0.60,
  }
}

interface Props {
  agent?: Profile | null
  agents?: Profile[]
  onClose: () => void
  onSaved: () => void
}

function TagsInput({ tags, setTags, placeholder }: {
  tags: string[]
  setTags: (t: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addTag(value: string) {
    const v = value.trim()
    if (v && !tags.includes(v)) setTags([...tags, v])
    setInput('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      setTags(tags.slice(0, -1))
    }
  }

  return (
    <div
      className="min-h-[42px] flex flex-wrap gap-1.5 px-3 py-2 rounded-xl border border-slate-200 cursor-text focus-within:ring-2 focus-within:ring-[#0BBFBF] focus-within:border-transparent transition"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map(t => (
        <span key={t} className="flex items-center gap-1 px-2 py-0.5 bg-[#1A5FA8]/10 text-[#1A5FA8] text-xs rounded-full font-medium">
          {t}
          <button type="button" onClick={() => setTags(tags.filter(x => x !== t))}
            className="hover:text-red-500 transition-colors ml-0.5 leading-none">×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => input.trim() && addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] text-sm outline-none bg-transparent text-slate-800 placeholder:text-slate-400"
      />
    </div>
  )
}

export default function AgentFormModal({ agent, agents = [], onClose, onSaved }: Props) {
  const isEdit = !!agent
  const [form, setForm] = useState<FormState>(() => defaultForm(agent))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => { setForm(defaultForm(agent)) }, [agent])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleJour(j: string) {
    set('disponibilites', { ...form.disponibilites, [j]: !form.disponibilites[j] })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const payload = {
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      email: form.email.trim(),
      telephone: form.telephone.trim(),
      vehicule: form.vehicule,
      zones_geo: form.zones_geo,
      competences: form.competences,
      contrat_heures_hebdo: Number(form.contrat_heures_hebdo),
      disponibilites: form.disponibilites,
      mode_deplacement: form.mode_deplacement,
      secteur_libelle: form.secteur_libelle.trim() || null,
      seuil_cible_pct: Number(form.seuil_cible_pct),
      binome_agent_id: form.binome_agent_id || null,
      facteur_binome: Number(form.facteur_binome),
      ...(isEdit ? { id: agent!.id } : { password: form.password }),
    }

    const res = await fetch('/api/agents', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? 'Erreur inconnue'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>

      {/* Modal */}
      <div className="relative bg-white w-full md:max-w-lg md:rounded-3xl rounded-t-3xl max-h-[92dvh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? "Modifier l'agent" : 'Ajouter un agent'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Scroll body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
              </svg>
              {error}
            </div>
          )}

          {/* Identité */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Prénom *</label>
              <input required value={form.prenom} onChange={e => set('prenom', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition"
                placeholder="Marie"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nom *</label>
              <input required value={form.nom} onChange={e => set('nom', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition"
                placeholder="Dupont"/>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email *</label>
            <input required type="email" value={form.email} onChange={e => set('email', e.target.value)}
              disabled={isEdit}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition disabled:bg-slate-50 disabled:text-slate-400"
              placeholder="marie.dupont@email.com"/>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Téléphone</label>
            <input type="tel" value={form.telephone} onChange={e => set('telephone', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition"
              placeholder="06 00 00 00 00"/>
          </div>

          {/* Mot de passe (création uniquement) */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mot de passe temporaire *</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition pr-10"/>
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPassword
                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    }
                  </button>
                </div>
                <button type="button" onClick={() => set('password', genPassword())}
                  className="px-3 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-200 transition-colors whitespace-nowrap">
                  Générer
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">À communiquer à l'agent. Il devra le changer à la première connexion.</p>
            </div>
          )}

          {/* Véhicule */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div>
              <p className="font-medium text-slate-800 text-sm">Véhicule personnel</p>
              <p className="text-xs text-slate-500 mt-0.5">L'agent peut accéder aux résidences qui le requièrent</p>
            </div>
            <button type="button" onClick={() => set('vehicule', !form.vehicule)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.vehicule ? 'bg-[#0BBFBF]' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.vehicule ? 'translate-x-5' : ''}`}/>
            </button>
          </div>

          {/* Zones géo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Zones géographiques
              <span className="text-slate-400 font-normal ml-1">(code postal, Entrée pour ajouter)</span>
            </label>
            <TagsInput tags={form.zones_geo} setTags={t => set('zones_geo', t)} placeholder="34000, 34170…"/>
          </div>

          {/* Compétences */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Compétences
              <span className="text-slate-400 font-normal ml-1">(Entrée pour ajouter)</span>
            </label>
            <TagsInput tags={form.competences} setTags={t => set('competences', t)} placeholder="nettoyage vitres, produits spéciaux…"/>
          </div>

          {/* Disponibilités */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Disponibilités</label>
            <div className="flex gap-2 flex-wrap">
              {JOURS.map(j => (
                <button key={j} type="button" onClick={() => toggleJour(j)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    form.disponibilites[j]
                      ? 'bg-[#1A5FA8] text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {JOURS_LABELS[j]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Capacité & déplacement ── */}
          <div className="border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#0BBFBF]/10 flex items-center justify-center text-[#0BBFBF] text-xs">⚡</span>
              Capacité &amp; déplacement
            </h3>

            {/* Contrat horaire hebdo */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Contrat horaire hebdomadaire
                <span className="text-slate-400 font-normal ml-1">(h/semaine)</span>
              </label>
              <input type="number" min={0} max={50} value={form.contrat_heures_hebdo}
                onChange={e => set('contrat_heures_hebdo', Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition"/>
            </div>

            {/* Mode déplacement */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Mode de déplacement</label>
              <select value={form.mode_deplacement}
                onChange={e => set('mode_deplacement', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition">
                {MODE_DEPLACEMENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Secteur principal */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Secteur principal</label>
              <input type="text" value={form.secteur_libelle}
                onChange={e => set('secteur_libelle', e.target.value)}
                placeholder="Ligne 1, Centre, Mobilité totale…"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition"/>
            </div>

            {/* Seuil cible */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-700">Seuil cible de charge</label>
                <span className="text-sm font-bold text-[#0A2E5A]">{form.seuil_cible_pct}%</span>
              </div>
              <input type="range" min={50} max={100} step={5}
                value={form.seuil_cible_pct}
                onChange={e => set('seuil_cible_pct', Number(e.target.value))}
                className="w-full accent-[#0BBFBF]"/>
              <p className="text-xs text-slate-400 mt-1">
                Au-delà de ce seuil, l&apos;agent est considéré comme optimisé
              </p>
            </div>
          </div>

          {/* ── Binôme ── */}
          {isEdit && (
            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[#0BBFBF]/10 flex items-center justify-center text-[#0BBFBF] text-xs">👥</span>
                Binôme
              </h3>

              {/* Select agent binôme */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Agent binôme</label>
                <select
                  value={form.binome_agent_id}
                  onChange={e => set('binome_agent_id', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#0BBFBF] focus:border-transparent transition">
                  <option value="">Aucun (travaille seul)</option>
                  {agents.filter(a => a.id !== agent?.id).map(a => (
                    <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>
                  ))}
                </select>
              </div>

              {/* Info symétrique */}
              {form.binome_agent_id && (() => {
                const binome = agents.find(a => a.id === form.binome_agent_id)
                return binome ? (
                  <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                    <span className="shrink-0">⚠️</span>
                    <span>
                      {agent?.prenom} sera automatiquement affecté·e avec {binome.prenom} {binome.nom} sur toutes ses résidences
                    </span>
                  </div>
                ) : null
              })()}

              {/* Facteur vitesse */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-slate-700">Facteur de vitesse en binôme</label>
                  <span className="text-sm font-bold text-[#0BBFBF]">{Number(form.facteur_binome).toFixed(2)}</span>
                </div>
                <input type="range" min={0.4} max={1.0} step={0.05}
                  value={form.facteur_binome}
                  onChange={e => set('facteur_binome', Number(e.target.value))}
                  className="w-full accent-[#0BBFBF]"/>
                <p className="text-xs text-slate-400 mt-1">
                  {Number(form.facteur_binome).toFixed(2)} = {Math.round((1 - Number(form.facteur_binome)) * 100)}% plus rapide à deux
                  {Number(form.facteur_binome) === 1.0 && ' (aucun gain)'}
                </p>
              </div>
            </div>
          )}

          <div className="h-2"/>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={loading}
            className="flex-2 flex-[2] py-3 rounded-xl text-white font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
            {loading ? 'Enregistrement…' : isEdit ? 'Enregistrer' : "Créer l'agent"}
          </button>
        </div>
      </div>
    </div>
  )
}
