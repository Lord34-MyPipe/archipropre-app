'use client'

import { useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import PlanifierModal from './PlanifierModal'
import CommandeDetailDrawer from './CommandeDetailDrawer'
import type { LigneCommande } from './CommandeDetailDrawer'

interface Commande {
  id: string
  statut: string
  created_at: string
  residence_id: string
  agent_id: string
  contrat_id: string | null
  residences: { nom: string } | { nom: string }[] | null
  contrats_residences: { libelle: string } | { libelle: string }[] | null
  profiles:
    | { prenom: string; nom: string; mode_deplacement: string }
    | { prenom: string; nom: string; mode_deplacement: string }[]
    | null
  lignes_commande: LigneCommande[]
}

function getResidence(c: Commande): { nom: string } | null {
  const r = c.residences
  return Array.isArray(r) ? (r[0] ?? null) : r
}

function getAgent(c: Commande): { prenom: string; nom: string; mode_deplacement: string } | null {
  const p = c.profiles
  return Array.isArray(p) ? (p[0] ?? null) : p
}

function dateRelative(isoStr: string): string {
  const now  = new Date()
  const date = new Date(isoStr)
  const diffJ = Math.floor((now.getTime() - date.getTime()) / 86_400_000)
  if (diffJ === 0) return "Aujourd'hui"
  if (diffJ === 1) return 'Hier'
  if (diffJ < 7)  return `Il y a ${diffJ} jours`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
}

export default function CommandesBloc({ managerNom }: { managerNom: string }) {
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [loading, setLoading]     = useState(true)
  const [detail, setDetail]       = useState<Commande | null>(null)
  const [planifier, setPlanifier] = useState<Commande | null>(null)

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

  function handleStatusChange(id: string, statut: string) {
    setCommandes(prev => prev.map(c => c.id === id ? { ...c, statut } : c))
  }

  if (loading || commandes.length === 0) return null

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-800">
            Commandes produits ({commandes.length})
          </p>
        </div>
        <div className="divide-y divide-slate-50">
          {commandes.map(cmd => {
            const residence = getResidence(cmd)
            const agent     = getAgent(cmd)
            const sanVoiture = agent?.mode_deplacement !== 'voiture'
            const isEnAttente = cmd.statut === 'en_attente'

            return (
              <div key={cmd.id} className="px-4 py-3 space-y-2">
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
                      {' · '}
                      {dateRelative(cmd.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {!isEnAttente && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        Commande prête
                      </span>
                    )}
                  </div>
                </div>

                {/* Boutons */}
                {isEnAttente ? (
                  <button
                    onClick={() => setDetail(cmd)}
                    className="w-full h-9 rounded-xl text-white font-semibold text-xs active:opacity-80 transition-opacity"
                    style={{ background: 'linear-gradient(135deg,#0BBFBF,#1A5FA8)' }}
                  >
                    Voir la commande →
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPlanifier(cmd)}
                      className="flex-1 h-9 rounded-xl text-white font-semibold text-xs active:opacity-80 transition-opacity"
                      style={{ background: 'linear-gradient(135deg,#0BBFBF,#1A5FA8)' }}
                    >
                      Planifier un retrait →
                    </button>
                    {sanVoiture && (
                      <button
                        onClick={() => setPlanifier({ ...cmd, _livraison: true } as unknown as Commande)}
                        className="flex-1 h-9 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 active:bg-slate-50 transition-colors"
                      >
                        Je livre moi-même
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Drawer détail */}
      <CommandeDetailDrawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        commande={detail}
        managerNom={managerNom}
        onStatusChange={handleStatusChange}
      />

      {/* Modal planifier */}
      {planifier && (
        <PlanifierModal
          commande={planifier}
          estLivraisonManagerDefaut={(planifier as unknown as Record<string, unknown>)._livraison === true}
          onClose={() => setPlanifier(null)}
          onSaved={() => { setPlanifier(null); charger() }}
        />
      )}
    </>
  )
}
