'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import dynamic from 'next/dynamic'

const MiniMapMarqueur = dynamic(
  () => import('@/components/manager/MiniMapMarqueur'),
  {
    ssr:     false,
    loading: () => (
      <div className="h-[200px] bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">
        Chargement de la carte…
      </div>
    ),
  }
)

interface PropositionClient {
  nom:                string
  adresse_normalisee?: string
  adresse?:           string
  lat?:               number
  lng?:               number
  erreur?:            string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: ActionsPayload | null
  applyState?: 'idle' | 'applying' | 'done' | 'error'
  propositionClient?: PropositionClient | null
  createState?: 'idle' | 'creating' | 'done' | 'error'
}

interface ActionReassigner {
  type: 'reassigner_intervention'
  intervention_id: string
  nouvel_agent_id: string
  raison: string
}

interface ActionModifierHoraire {
  type: 'modifier_horaire'
  intervention_id: string
  nouvelle_heure_debut: string
  nouvelle_heure_fin: string
  raison: string
}

type Action = ActionReassigner | ActionModifierHoraire

interface ActionsPayload {
  // Format unifié : { actions: [...] }
  actions?: Action[]
  // Ancien format de compatibilité : { type, interventions: [...] }
  type?: string
  interventions?: Array<{ intervention_id: string; nouvel_agent_id: string; raison: string }>
}

const RACCOURCIS = [
  'Conflits cette semaine',
  'Agents sous-chargés',
  'Optimiser un agent',
  'Résoudre une absence',
]

const MESSAGE_ACCUEIL: Message = {
  id: 'accueil',
  role: 'assistant',
  content: 'Bonjour ! Je suis votre copilote planning. Je peux analyser les conflits, identifier les agents sous-chargés, proposer des réorganisations et les appliquer directement. Comment puis-je vous aider ?',
}

function genId() {
  return Math.random().toString(36).slice(2)
}

interface Props {
  open: boolean
  onClose: () => void
  semaine?: string | null
}

export default function CopilotePanel({ open, onClose, semaine }: Props) {
  const router                  = useRouter()
  const [messages, setMessages] = useState<Message[]>([MESSAGE_ACCUEIL])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const buildHistorique = useCallback((msgs: Message[]) =>
    msgs
      .filter(m => m.id !== 'accueil')
      .map(m => ({ role: m.role, content: m.content })),
  [])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')

    const userMsg: Message = { id: genId(), role: 'user', content: trimmed }
    setMessages(prev => {
      const next = [...prev, userMsg]
      sendToApi(trimmed, buildHistorique(next.slice(0, -1)))
      return next
    })
  }

  async function sendToApi(text: string, historique: { role: string; content: string }[]) {
    setLoading(true)
    try {
      const res  = await fetch('/api/ia/copilote', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: text, historique, semaine: semaine ?? null }),
      })
      const data = await res.json()
      const assistantMsg: Message = {
        id:               genId(),
        role:             'assistant',
        content:          res.ok ? data.reponse : (data.error ?? 'Erreur inconnue'),
        actions:          res.ok ? data.actions : null,
        applyState:       'idle',
        propositionClient: res.ok ? (data.propositionClient ?? null) : null,
        createState:      'idle',
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: 'Erreur de connexion au copilote.' }])
    } finally {
      setLoading(false)
    }
  }

  async function applyActions(msgId: string, payload: ActionsPayload) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, applyState: 'applying' } : m))

    // Normaliser : nouveau format { actions: [...] } ou ancien { type, interventions: [...] }
    const actions: Action[] = payload.actions ?? (
      payload.interventions?.map(i => ({
        type:            'reassigner_intervention' as const,
        intervention_id: i.intervention_id,
        nouvel_agent_id: i.nouvel_agent_id,
        raison:          i.raison,
      })) ?? []
    )

    const errors: string[] = []

    await Promise.allSettled(
      actions.map(async a => {
        let body: Record<string, string>
        if (a.type === 'reassigner_intervention') {
          body = { agentId: a.nouvel_agent_id }
          console.log('PATCH intervention', a.intervention_id, 'nouvel agent:', a.nouvel_agent_id)
        } else {
          body = { heureDebut: a.nouvelle_heure_debut, heureFin: a.nouvelle_heure_fin }
          console.log('PATCH intervention', a.intervention_id, 'horaire:', a.nouvelle_heure_debut, '→', a.nouvelle_heure_fin)
        }

        const res = await fetch(`/api/interventions/${a.intervention_id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })
        console.log('  status:', res.status)

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          errors.push(`${a.type} ${a.intervention_id} : ${data.error ?? res.statusText}`)
        }
      })
    )

    if (errors.length > 0) {
      setMessages(prev => [
        ...prev.map(m => m.id === msgId ? { ...m, applyState: 'error' as const } : m),
        {
          id:      genId(),
          role:    'assistant' as const,
          content: `⚠️ ${errors.length} action(s) ont échoué :\n${errors.join('\n')}`,
        },
      ])
    } else {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, applyState: 'done' as const } : m))
      router.refresh()
    }
  }

  async function applyCreation(msgId: string, pc: PropositionClient) {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, createState: 'creating' as const } : m))
    const res = await fetch('/api/residences/creer-rapide', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        nom:                pc.nom,
        adresse:            pc.adresse_normalisee ?? pc.adresse,
        adresse_normalisee: pc.adresse_normalisee,
        lat:                pc.lat ?? null,
        lng:                pc.lng ?? null,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setMessages(prev => [
        ...prev.map(m => m.id === msgId ? { ...m, createState: 'error' as const } : m),
        { id: genId(), role: 'assistant' as const, content: `⚠️ Erreur création client : ${data.error ?? res.statusText}` },
      ])
    } else {
      const residence = await res.json()
      setMessages(prev => [
        ...prev.map(m => m.id === msgId ? { ...m, createState: 'done' as const } : m),
        {
          id: genId(), role: 'assistant' as const,
          content: `✅ Client **${pc.nom}** créé (ID : \`${residence.id}\`). Rendez-vous sur la page Résidences pour configurer le contrat et affecter un agent.`,
        },
      ])
      router.refresh()
    }
  }

  function handleMarkerMove(msgId: string, lat: number, lng: number) {
    setMessages(prev => prev.map(m =>
      m.id === msgId && m.propositionClient
        ? { ...m, propositionClient: { ...m.propositionClient, lat, lng } }
        : m
    ))
  }

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Panneau */}
      <div
        className={`fixed top-0 right-0 h-full z-50 flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out
          w-full md:w-[420px]
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* En-tête */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-100" style={{ background: '#0A2E5A' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#0BBFBF' }}>
                <span className="text-white text-lg">🤖</span>
              </div>
              <div>
                <p className="text-white font-bold text-sm">Copilote planning</p>
                <p className="text-slate-300 text-xs">Analyse le planning en temps réel</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-white/10 transition-colors text-lg"
            >
              ×
            </button>
          </div>
        </div>

        {/* Raccourcis */}
        <div className="shrink-0 px-4 py-3 border-b border-slate-100 flex gap-2 overflow-x-auto">
          {RACCOURCIS.map(r => (
            <button
              key={r}
              onClick={() => sendMessage(r)}
              disabled={loading}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 text-slate-600 hover:border-[#0BBFBF] hover:text-[#0BBFBF] transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {r}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] flex flex-col gap-2`}>
                {/* Bulle */}
                <div
                  className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'text-white rounded-br-sm whitespace-pre-wrap'
                      : 'text-slate-800 bg-slate-100 rounded-bl-sm prose prose-sm prose-slate max-w-none'
                  }`}
                  style={msg.role === 'user' ? { background: '#1A5FA8' } : undefined}
                >
                  {msg.role === 'user'
                    ? msg.content
                    : <ReactMarkdown>{msg.content}</ReactMarkdown>
                  }
                </div>

                {/* Carte proposition client */}
                {msg.role === 'assistant' && msg.propositionClient && (() => {
                  const pc = msg.propositionClient
                  return (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                      <div className="px-4 py-3 border-b border-slate-100" style={{ background: '#F0FBFB' }}>
                        <p className="text-xs font-bold text-[#0A6060] flex items-center gap-1.5">
                          <span>🏢</span> Nouveau client à créer
                        </p>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        {pc.erreur ? (
                          <p className="text-xs text-red-600">{pc.erreur}</p>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-slate-800">{pc.nom}</p>
                            <p className="text-xs text-slate-500">{pc.adresse_normalisee}</p>
                            {pc.lat != null && pc.lng != null && (
                              <>
                                <MiniMapMarqueur
                                  lat={pc.lat}
                                  lng={pc.lng}
                                  onMove={(lat, lng) => handleMarkerMove(msg.id, lat, lng)}
                                />
                                <p className="text-[10px] text-slate-400 text-center">
                                  Déplacez le marqueur pour corriger la position
                                </p>
                                <p className="text-[10px] text-slate-500 text-center font-mono">
                                  {pc.lat.toFixed(5)}, {pc.lng.toFixed(5)}
                                </p>
                              </>
                            )}
                          </>
                        )}
                      </div>
                      {!pc.erreur && msg.createState !== 'done' && (
                        <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
                          <button
                            onClick={() => applyCreation(msg.id, pc)}
                            disabled={msg.createState === 'creating'}
                            className="flex-1 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60 transition-opacity"
                            style={{ background: '#0BBFBF' }}
                          >
                            {msg.createState === 'creating' ? 'Création…' : '✓ Créer ce client'}
                          </button>
                          <button
                            onClick={() => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, propositionClient: null } : m))}
                            disabled={msg.createState === 'creating'}
                            className="px-3 py-2 rounded-xl text-xs font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-60"
                          >
                            Annuler
                          </button>
                        </div>
                      )}
                      {msg.createState === 'done' && (
                        <div className="px-4 py-3 border-t border-slate-100">
                          <p className="text-xs font-semibold text-[#0A6060]">✓ Client créé</p>
                        </div>
                      )}
                      {msg.createState === 'error' && (
                        <div className="px-4 py-3 border-t border-slate-100">
                          <p className="text-xs font-semibold text-red-600">⚠ Erreur lors de la création</p>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Carte actions */}
                {msg.role === 'assistant' && (msg.actions?.actions?.length || msg.actions?.interventions?.length) ? (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                    <div className="px-4 py-3 border-b border-slate-100" style={{ background: '#F0FBFB' }}>
                      <p className="text-xs font-bold text-[#0A6060] flex items-center gap-1.5">
                        <span>⚡</span> Actions proposées
                      </p>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {(msg.actions.actions ?? msg.actions.interventions ?? []).map((a, i) => (
                        <p key={i} className="text-xs text-slate-600 leading-relaxed">
                          {'type' in a && a.type === 'modifier_horaire'
                            ? `• 🕐 ${a.raison}`
                            : `• 🔄 ${a.raison}`}
                        </p>
                      ))}
                    </div>
                    {msg.applyState !== 'done' && (
                      <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
                        <button
                          onClick={() => applyActions(msg.id, msg.actions!)}
                          disabled={msg.applyState === 'applying'}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60 transition-opacity flex items-center justify-center gap-1.5"
                          style={{ background: '#0BBFBF' }}
                        >
                          {msg.applyState === 'applying' ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                              </svg>
                              Application…
                            </>
                          ) : '✓ Appliquer tout'}
                        </button>
                        <button
                          onClick={() => setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, actions: null } : m))}
                          disabled={msg.applyState === 'applying'}
                          className="px-3 py-2 rounded-xl text-xs font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-60"
                        >
                          Annuler
                        </button>
                      </div>
                    )}
                    {msg.applyState === 'done' && (
                      <div className="px-4 py-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-[#0A6060]">✓ Actions appliquées avec succès</p>
                      </div>
                    )}
                    {msg.applyState === 'error' && (
                      <div className="px-4 py-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-red-600">⚠ Certaines actions ont échoué</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-slate-100 flex gap-1 items-center">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Zone de saisie */}
        <div className="shrink-0 px-4 py-4 border-t border-slate-100">
          <form
            onSubmit={e => { e.preventDefault(); sendMessage(input) }}
            className="flex gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ex : Optimise le planning d'Awa…"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#0BBFBF] transition-colors disabled:opacity-60 placeholder-slate-400"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white disabled:opacity-50 transition-opacity shrink-0"
              style={{ background: '#0BBFBF' }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5"/>
              </svg>
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
