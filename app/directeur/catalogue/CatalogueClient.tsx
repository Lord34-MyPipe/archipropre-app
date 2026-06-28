'use client'

import { useRef, useState } from 'react'
import type { Produit } from './page'

// ── Types ───────────────────────────────────────────────────────────────────

type Categorie = 'produit' | 'consommable' | 'materiel'
type OngletFiltreType = 'tous' | Categorie

interface ModalState {
  open: boolean
  mode: 'creation' | 'edition'
  produit: Produit | null
}

interface ToastMsg {
  id: number
  type: 'success' | 'error'
  msg: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const CAT_LABEL: Record<Categorie, string> = {
  produit:      'Produit',
  consommable:  'Consommable',
  materiel:     'Matériel',
}

const CAT_EMOJI: Record<Categorie, string> = {
  produit:     '🧴',
  consommable: '🧻',
  materiel:    '🪣',
}

const CAT_BADGE: Record<Categorie, string> = {
  produit:     'bg-teal-50 text-teal-700 border-teal-100',
  consommable: 'bg-blue-50 text-blue-700 border-blue-100',
  materiel:    'bg-slate-100 text-slate-600 border-slate-200',
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function CatalogueClient({ initialProduits }: { initialProduits: Produit[] }) {
  const [produits,     setProduits]     = useState<Produit[]>(initialProduits)
  const [onglet,       setOnglet]       = useState<OngletFiltreType>('tous')
  const [modal,        setModal]        = useState<ModalState>({ open: false, mode: 'creation', produit: null })
  const [toasts,       setToasts]       = useState<ToastMsg[]>([])
  const [uploadingId,  setUploadingId]  = useState<string | null>(null)
  const [confirmDel,   setConfirmDel]   = useState<string | null>(null)

  const photoInputsRef = useRef<Record<string, HTMLInputElement | null>>({})
  let toastSeq = useRef(0)

  function toast(msg: string, type: 'success' | 'error' = 'success') {
    const id = ++toastSeq.current
    setToasts(prev => [...prev, { id, type, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  // ── Filtre ────────────────────────────────────────────────────────────────
  const affichés = onglet === 'tous' ? produits : produits.filter(p => p.categorie === onglet)
  const nbActifs = produits.filter(p => p.actif).length

  // ── CRUD actions ──────────────────────────────────────────────────────────

  async function handleCreate(nom: string, categorie: Categorie, ordre?: number) {
    const r = await fetch('/api/directeur/produits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, categorie, ordre }),
    })
    const json = await r.json()
    if (!r.ok) { toast(json.error ?? 'Erreur création', 'error'); return }
    setProduits(prev => [...prev, json.produit].sort((a, b) => a.ordre - b.ordre))
    toast(`"${json.produit.nom}" ajouté`)
    setModal({ open: false, mode: 'creation', produit: null })
  }

  async function handleEdit(id: string, fields: Partial<Pick<Produit, 'nom' | 'categorie' | 'ordre'>>) {
    const r = await fetch(`/api/directeur/produits/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    const json = await r.json()
    if (!r.ok) { toast(json.error ?? 'Erreur modification', 'error'); return }
    setProduits(prev => prev.map(p => p.id === id ? json.produit : p).sort((a, b) => a.ordre - b.ordre))
    toast(`"${json.produit.nom}" modifié`)
    setModal({ open: false, mode: 'creation', produit: null })
  }

  async function handleToggleActif(p: Produit) {
    const r = await fetch(`/api/directeur/produits/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actif: !p.actif }),
    })
    const json = await r.json()
    if (!r.ok) { toast(json.error ?? 'Erreur', 'error'); return }
    setProduits(prev => prev.map(x => x.id === p.id ? json.produit : x))
    toast(`"${p.nom}" ${json.produit.actif ? 'activé' : 'désactivé'}`)
  }

  async function handleDelete(id: string) {
    const r = await fetch(`/api/directeur/produits/${id}`, { method: 'DELETE' })
    const json = await r.json()
    if (r.status === 409) {
      toast(json.error, 'error')
      setConfirmDel(null)
      // Proposer désactivation
      const nom = produits.find(p => p.id === id)?.nom ?? ''
      setTimeout(() => {
        if (window.confirm(`"${nom}" est utilisé dans des commandes.\nVoulez-vous le désactiver à la place ?`)) {
          handleToggleActif(produits.find(p => p.id === id)!)
        }
      }, 100)
      return
    }
    if (!r.ok) { toast(json.error ?? 'Erreur suppression', 'error'); return }
    setProduits(prev => prev.filter(p => p.id !== id))
    toast('Produit supprimé')
    setConfirmDel(null)
  }

  async function handlePhotoUpload(id: string, file: File) {
    setUploadingId(id)
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch(`/api/directeur/produits/${id}/photo`, { method: 'POST', body: fd })
    const json = await r.json()
    setUploadingId(null)
    if (!r.ok) { toast(json.error ?? 'Erreur upload', 'error'); return }
    setProduits(prev => prev.map(p => p.id === id ? { ...p, photo_url: json.photo_url } : p))
    toast('Photo mise à jour')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const ONGLETS: { key: OngletFiltreType; label: string }[] = [
    { key: 'tous',        label: 'Tous' },
    { key: 'produit',     label: 'Produits' },
    { key: 'consommable', label: 'Consommables' },
    { key: 'materiel',    label: 'Matériel' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-8 py-6">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Catalogue produits</h1>
            <p className="text-sm text-slate-400 mt-0.5">{nbActifs} produit{nbActifs > 1 ? 's' : ''} actif{nbActifs > 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setModal({ open: true, mode: 'creation', produit: null })}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Ajouter un produit
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-6">
        {/* Onglets filtre */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-6">
          {ONGLETS.map(o => (
            <button
              key={o.key}
              onClick={() => setOnglet(o.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                onglet === o.key
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {o.label}
              <span className="ml-1.5 text-xs text-slate-400">
                {o.key === 'tous'
                  ? produits.length
                  : produits.filter(p => p.categorie === o.key).length}
              </span>
            </button>
          ))}
        </div>

        {/* Tableau produits */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
          {affichés.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-sm">Aucun produit dans cette catégorie</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Photo</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Nom</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Catégorie</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Ordre</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Statut</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {affichés.map(p => (
                  <tr key={p.id} className={`group hover:bg-slate-50/60 transition-colors ${!p.actif ? 'opacity-50' : ''}`}>
                    {/* Photo */}
                    <td className="py-3 px-4">
                      <div className="relative w-12 h-12">
                        {p.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.photo_url}
                            alt={p.nom}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-100"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-xl">
                            {CAT_EMOJI[p.categorie]}
                          </div>
                        )}
                        {uploadingId === p.id && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
                            <div className="w-4 h-4 border-2 border-[#1A5FA8] border-t-transparent rounded-full animate-spin"/>
                          </div>
                        )}
                        {/* Bouton upload superposé au hover */}
                        <button
                          onClick={() => photoInputsRef.current[p.id]?.click()}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Changer la photo"
                        >
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                          </svg>
                        </button>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          ref={el => { photoInputsRef.current[p.id] = el }}
                          onChange={e => {
                            const f = e.target.files?.[0]
                            if (f) handlePhotoUpload(p.id, f)
                            e.target.value = ''
                          }}
                        />
                      </div>
                    </td>

                    {/* Nom */}
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-800 text-sm">{p.nom}</p>
                    </td>

                    {/* Catégorie */}
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${CAT_BADGE[p.categorie]}`}>
                        {CAT_EMOJI[p.categorie]} {CAT_LABEL[p.categorie]}
                      </span>
                    </td>

                    {/* Ordre */}
                    <td className="py-3 px-4 text-center">
                      <span className="text-sm text-slate-500 tabular-nums">{p.ordre}</span>
                    </td>

                    {/* Toggle actif */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggleActif(p)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                          p.actif
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${p.actif ? 'bg-emerald-500' : 'bg-slate-400'}`}/>
                        {p.actif ? 'Actif' : 'Inactif'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Modifier */}
                        <button
                          onClick={() => setModal({ open: true, mode: 'edition', produit: p })}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#1A5FA8] hover:bg-blue-50 transition-colors"
                          title="Modifier"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>

                        {/* Supprimer */}
                        {confirmDel === p.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600"
                            >
                              Confirmer
                            </button>
                            <button
                              onClick={() => setConfirmDel(null)}
                              className="px-2 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDel(p.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Supprimer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal création / édition */}
      {modal.open && (
        <ProduitModal
          mode={modal.mode}
          produit={modal.produit}
          onClose={() => setModal({ open: false, mode: 'creation', produit: null })}
          onCreate={handleCreate}
          onEdit={handleEdit}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
              t.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-500 text-white'
            }`}
          >
            {t.type === 'success'
              ? <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              : <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            }
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Modal création / édition ─────────────────────────────────────────────────

function ProduitModal({
  mode,
  produit,
  onClose,
  onCreate,
  onEdit,
}: {
  mode: 'creation' | 'edition'
  produit: Produit | null
  onClose: () => void
  onCreate: (nom: string, cat: Categorie, ordre?: number) => Promise<void>
  onEdit: (id: string, fields: Partial<Pick<Produit, 'nom' | 'categorie' | 'ordre'>>) => Promise<void>
}) {
  const [nom,      setNom]      = useState(produit?.nom ?? '')
  const [cat,      setCat]      = useState<Categorie>(produit?.categorie ?? 'produit')
  const [ordre,    setOrdre]    = useState<string>(produit?.ordre?.toString() ?? '')
  const [saving,   setSaving]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return
    setSaving(true)
    if (mode === 'creation') {
      await onCreate(nom.trim(), cat, ordre ? Number(ordre) : undefined)
    } else if (produit) {
      await onEdit(produit.id, {
        nom: nom.trim(),
        categorie: cat,
        ordre: ordre ? Number(ordre) : undefined,
      })
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800">
            {mode === 'creation' ? 'Ajouter un produit' : 'Modifier le produit'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Nom <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="ex : Sol 3D désinfectant"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1A5FA8] focus:ring-1 focus:ring-[#1A5FA8]/20"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Catégorie</label>
            <select
              value={cat}
              onChange={e => setCat(e.target.value as Categorie)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1A5FA8] bg-white"
            >
              <option value="produit">🧴 Produit</option>
              <option value="consommable">🧻 Consommable</option>
              <option value="materiel">🪣 Matériel</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Ordre d&apos;affichage <span className="text-slate-400 font-normal">(optionnel)</span>
            </label>
            <input
              type="number"
              value={ordre}
              onChange={e => setOrdre(e.target.value)}
              placeholder="Laissez vide pour ajouter à la fin"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1A5FA8] focus:ring-1 focus:ring-[#1A5FA8]/20"
              min={0}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !nom.trim()}
              className="flex-1 h-11 rounded-xl text-white text-sm font-bold disabled:opacity-50 transition-all"
              style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
            >
              {saving
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                    Enregistrement…
                  </span>
                : 'Enregistrer'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
