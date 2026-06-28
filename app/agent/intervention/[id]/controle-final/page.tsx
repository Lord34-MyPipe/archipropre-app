'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Produit {
  id: string
  nom: string
  categorie: 'produit' | 'consommable' | 'materiel'
  ordre: number
}

interface LigneSelection {
  produit_id: string | null
  type_ligne: 'produit' | 'ampoule'
  quantite: number
  localisation: string
  photo_avant_path: string | null
  photo_apres_path: string | null
  // local preview
  _nom: string
  _photoAvantFile: File | null
  _photoApresFile: File | null
  _uploading: boolean
}

export default function ControleFinaPage() {
  const params   = useParams<{ id: string }>()
  const router   = useRouter()

  const [produits,       setProduits]       = useState<Produit[]>([])
  const [lignes,         setLignes]         = useState<LigneSelection[]>([])
  const [chariotFile,    setChariotFile]    = useState<File | null>(null)
  const [chariotUrl,     setChariotUrl]     = useState<string | null>(null)
  const [chariotUploading, setChariotUploading] = useState(false)

  // Drawer ampoule
  const [drawerOpen,     setDrawerOpen]     = useState(false)
  const [drawerLoc,      setDrawerLoc]      = useState('')
  const [drawerAvant,    setDrawerAvant]    = useState<File | null>(null)
  const [drawerApres,    setDrawerApres]    = useState<File | null>(null)

  const [submitting,     setSubmitting]     = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const chariotInputRef   = useRef<HTMLInputElement>(null)
  const drawerAvantRef    = useRef<HTMLInputElement>(null)
  const drawerApresRef    = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/produits')
      .then(r => r.json())
      .then(({ produits: p }) => setProduits(p ?? []))
  }, [])

  // ── Toggle produit dans la sélection ─────────────────────────────────────────
  function toggleProduit(p: Produit) {
    setLignes(prev => {
      const idx = prev.findIndex(l => l.produit_id === p.id && l.type_ligne === 'produit')
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      return [...prev, {
        produit_id: p.id,
        type_ligne: 'produit',
        quantite: 1,
        localisation: '',
        photo_avant_path: null,
        photo_apres_path: null,
        _nom: p.nom,
        _photoAvantFile: null,
        _photoApresFile: null,
        _uploading: false,
      }]
    })
  }

  function changeLigneQty(produitId: string, delta: number) {
    setLignes(prev => prev.map(l =>
      l.produit_id === produitId && l.type_ligne === 'produit'
        ? { ...l, quantite: Math.max(1, l.quantite + delta) }
        : l
    ))
  }

  // ── Photo chariot ─────────────────────────────────────────────────────────────
  async function handleChariotPhoto(file: File) {
    setChariotFile(file)
    setChariotUrl(URL.createObjectURL(file))
    setChariotUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    await fetch(`/api/interventions/${params.id}/chariot`, { method: 'POST', body: fd })
    setChariotUploading(false)
  }

  // ── Ajout ampoule depuis drawer ───────────────────────────────────────────────
  async function confirmerAmpoule() {
    if (!drawerAvant) {
      setError('La photo avant est requise pour une ampoule.')
      return
    }
    setError(null)
    // Upload photo avant
    const fdAvant = new FormData()
    fdAvant.append('file', drawerAvant)
    fdAvant.append('side', 'avant')
    const rAvant = await fetch(`/api/interventions/${params.id}/chariot-ampoule`, { method: 'POST', body: fdAvant })
    const { storage_path: pathAvant } = await rAvant.json()

    let pathApres: string | null = null
    if (drawerApres) {
      const fdApres = new FormData()
      fdApres.append('file', drawerApres)
      fdApres.append('side', 'apres')
      const rApres = await fetch(`/api/interventions/${params.id}/chariot-ampoule`, { method: 'POST', body: fdApres })
      const { storage_path } = await rApres.json()
      pathApres = storage_path
    }

    setLignes(prev => [...prev, {
      produit_id: null,
      type_ligne: 'ampoule',
      quantite: 1,
      localisation: drawerLoc,
      photo_avant_path: pathAvant,
      photo_apres_path: pathApres ?? null,
      _nom: `Ampoule${drawerLoc ? ' — ' + drawerLoc : ''}`,
      _photoAvantFile: drawerAvant,
      _photoApresFile: drawerApres,
      _uploading: false,
    }])

    // Reset drawer
    setDrawerOpen(false)
    setDrawerLoc('')
    setDrawerAvant(null)
    setDrawerApres(null)
  }

  // ── Envoi final ───────────────────────────────────────────────────────────────
  async function handleEnvoyer() {
    if (submitting) return
    setSubmitting(true)
    setError(null)

    if (lignes.length > 0) {
      const body = {
        lignes: lignes.map(l => ({
          produit_id: l.produit_id,
          type_ligne: l.type_ligne,
          quantite: l.quantite,
          localisation: l.localisation || null,
          photo_avant_path: l.photo_avant_path,
          photo_apres_path: l.photo_apres_path,
        })),
      }
      const r = await fetch(`/api/interventions/${params.id}/commande`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const { error: msg } = await r.json()
        setError(msg ?? 'Erreur envoi commande')
        setSubmitting(false)
        return
      }
    }

    // Rediriger vers planning agent
    router.push('/agent/planning')
  }

  const nbSignalements = lignes.length

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-bold text-slate-800">Avant de partir</h1>
            <p className="text-xs text-slate-500">Vérification finale</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-5 pt-5">

        {/* Bloc 1 — Photo chariot */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <span className="text-lg">🛒</span> Photo du chariot
          </h2>
          {chariotUrl ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={chariotUrl}
                alt="Chariot"
                className="w-full h-40 object-cover rounded-xl"
              />
              {chariotUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                </div>
              )}
              <button
                onClick={() => { setChariotFile(null); setChariotUrl(null) }}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => chariotInputRef.current?.click()}
              className="w-full h-28 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-slate-300 active:bg-slate-50"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
              <span className="text-xs">Photo du chariot (optionnel)</span>
            </button>
          )}
          <input
            ref={chariotInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleChariotPhoto(f) }}
          />
        </section>

        {/* Bloc 2 — Produits à commander */}
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <span className="text-lg">📦</span> Produits manquants
          </h2>
          <p className="text-xs text-slate-400 mb-4">Sélectionnez ce qui manque — une commande sera envoyée au manager.</p>

          <div className="grid grid-cols-2 gap-2">
            {produits.map(p => {
              const selected = lignes.some(l => l.produit_id === p.id && l.type_ligne === 'produit')
              const ligne = lignes.find(l => l.produit_id === p.id && l.type_ligne === 'produit')
              return (
                <div
                  key={p.id}
                  onClick={() => toggleProduit(p)}
                  className={`relative rounded-xl border-2 p-3 cursor-pointer transition-all select-none ${
                    selected
                      ? 'border-[#1A5FA8] bg-[#EAF2FF]'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-700 leading-tight pr-4">{p.nom}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{p.categorie}</p>

                  {selected && (
                    <>
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#1A5FA8] flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div
                        className="flex items-center gap-2 mt-2"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          onClick={() => changeLigneQty(p.id, -1)}
                          className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold"
                        >−</button>
                        <span className="text-xs font-bold text-slate-700 w-4 text-center">{ligne?.quantite ?? 1}</span>
                        <button
                          onClick={() => changeLigneQty(p.id, +1)}
                          className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold"
                        >+</button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}

            {/* Carte Ampoule */}
            <div
              onClick={() => setDrawerOpen(true)}
              className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3 cursor-pointer hover:bg-amber-100 transition-all"
            >
              <p className="text-xs font-semibold text-amber-700 leading-tight flex items-center gap-1">
                <span>💡</span> Ampoule
              </p>
              <p className="text-[10px] text-amber-500 mt-0.5">Localisation + photo</p>
              {lignes.filter(l => l.type_ligne === 'ampoule').length > 0 && (
                <div className="mt-1 text-[10px] text-amber-600 font-semibold">
                  {lignes.filter(l => l.type_ligne === 'ampoule').length} signalée(s)
                </div>
              )}
            </div>
          </div>

          {/* Liste des lignes sélectionnées */}
          {lignes.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Résumé</p>
              {lignes.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                  <span className="text-slate-700">{l._nom}</span>
                  <div className="flex items-center gap-2">
                    {l.type_ligne === 'produit' && (
                      <span className="text-slate-500">×{l.quantite}</span>
                    )}
                    <button
                      onClick={() => setLignes(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-red-400 hover:text-red-600"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Drawer ampoule */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)}/>
          <div className="relative bg-white rounded-t-3xl p-6 pb-10 space-y-4">
            <h3 className="text-base font-bold text-slate-800">💡 Signaler une ampoule</h3>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Localisation</label>
              <input
                type="text"
                placeholder="ex : Escalier A, palier 2"
                value={drawerLoc}
                onChange={e => setDrawerLoc(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1A5FA8]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Photo avant <span className="text-red-400">*</span></label>
                {drawerAvant ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(drawerAvant)} alt="" className="w-full h-24 object-cover rounded-xl"/>
                ) : (
                  <button
                    onClick={() => drawerAvantRef.current?.click()}
                    className="w-full h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                )}
                <input ref={drawerAvantRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setDrawerAvant(f) }}/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Photo après</label>
                {drawerApres ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(drawerApres)} alt="" className="w-full h-24 object-cover rounded-xl"/>
                ) : (
                  <button
                    onClick={() => drawerApresRef.current?.click()}
                    className="w-full h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-400"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                )}
                <input ref={drawerApresRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setDrawerApres(f) }}/>
              </div>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setDrawerOpen(false); setError(null) }}
                className="flex-1 h-12 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm"
              >
                Annuler
              </button>
              <button
                onClick={confirmerAmpoule}
                className="flex-1 h-12 rounded-2xl text-white font-bold text-sm"
                style={{ background: 'linear-gradient(135deg,#d97706,#f59e0b)' }}
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer sticky */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 pb-safe z-20">
        <div className="max-w-lg mx-auto space-y-2">
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <button
            onClick={handleEnvoyer}
            disabled={submitting}
            className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-xl active:scale-[0.98] transition-all disabled:opacity-60"
            style={{
              background: nbSignalements > 0
                ? 'linear-gradient(135deg,#1A5FA8,#2563eb)'
                : 'linear-gradient(135deg,#059669,#10b981)',
            }}
          >
            {submitting
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                  Envoi…
                </span>
              : nbSignalements > 0
                ? `Envoyer le rapport (${nbSignalements} signalement${nbSignalements > 1 ? 's' : ''})`
                : 'Rien à signaler — passer'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
