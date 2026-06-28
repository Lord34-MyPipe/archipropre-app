'use client'

import { useEffect, useState } from 'react'
import PlanifierModal from './PlanifierModal'

interface LigneCommande {
  id: string
  type_ligne: string
  produit_id: string | null
  quantite: number
  localisation: string | null
  photo_avant_path: string | null
  produits: { nom: string } | null
}

interface Commande {
  id: string
  statut: string
  created_at: string
  residence_id: string
  agent_id: string
  contrat_id: string | null
  residences: { nom: string } | { nom: string }[] | null
  contrats_residences: { libelle: string } | { libelle: string }[] | null
  profiles: { prenom: string; nom: string; mode_deplacement: string } | { prenom: string; nom: string; mode_deplacement: string }[] | null
  lignes_commande: LigneCommande[]
}

function getResidence(c: Commande): { nom: string } | null {
  const r = c.residences
  return Array.isArray(r) ? (r[0] ?? null) : r
}

function getAgent(c: Commande): { prenom: string; nom: string } | null {
  const p = c.profiles
  return Array.isArray(p) ? (p[0] ?? null) : p
}

export default function CommandesBloc() {
  const [commandes, setCommandes]             = useState<Commande[]>([])
  const [loading, setLoading]                 = useState(true)
  const [planifier, setPlanifier]             = useState<Commande | null>(null)

  async function charger() {
    try {
      const res = await fetch('/api/manager/commandes')
      if (res.ok) {
        const data = await res.json()
        setCommandes(data.commandes ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
    const timer = setInterval(charger, 120_000)
    return () => clearInterval(timer)
  }, [])

  if (loading || commandes.length === 0) return null

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <span className="text-lg">📦</span>
          <p className="text-sm font-semibold text-slate-800">
            Commandes produits ({commandes.length})
          </p>
        </div>
        <div className="divide-y divide-slate-50">
          {commandes.map(cmd => {
            const residence = getResidence(cmd)
            const agent     = getAgent(cmd)
            return (
              <div key={cmd.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {residence?.nom ?? '—'}
                    </p>
                    {agent && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {agent.prenom} {agent.nom}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {cmd.lignes_commande.length} article{cmd.lignes_commande.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      cmd.statut === 'commande'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {cmd.statut === 'commande' ? 'Planifiée' : 'En attente'}
                    </span>
                    {cmd.statut === 'en_attente' && (
                      <button
                        onClick={() => setPlanifier(cmd)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-xl text-white active:opacity-80 transition-opacity"
                        style={{ background: 'linear-gradient(135deg,#0BBFBF,#1A5FA8)' }}
                      >
                        Planifier →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {planifier && (
        <PlanifierModal
          commande={planifier}
          onClose={() => setPlanifier(null)}
          onSaved={() => { setPlanifier(null); charger() }}
        />
      )}
    </>
  )
}
