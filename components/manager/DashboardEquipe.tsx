'use client'

type StatutAgent = 'disponible' | 'en_cours' | 'terminee' | 'pas_scanne' | 'en_retard' | 'absent'

interface AgentStatut {
  id: string
  prenom: string
  nom: string
  statut: StatutAgent
  nbTotal: number
  nbTerminees: number
  nbEnCours: number
  interventions: Array<{
    id: string
    statut: string
    heure_debut_prevue: string | null
    heure_fin_prevue: string | null
    residences: { nom: string } | null
  }>
}

const STATUT_CONFIG: Record<StatutAgent, { label: string; dotBg: string; badgeBg: string; badgeText: string; avatarBg: string; priorite: number }> = {
  en_retard:   { label: 'En retard',   dotBg: 'bg-red-500',    badgeBg: 'bg-red-100',    badgeText: 'text-red-700',    avatarBg: 'bg-red-500',    priorite: 0 },
  pas_scanne:  { label: 'Pas scanné',  dotBg: 'bg-amber-400',  badgeBg: 'bg-amber-100',  badgeText: 'text-amber-700',  avatarBg: 'bg-amber-500',  priorite: 1 },
  en_cours:    { label: 'En cours',    dotBg: 'bg-blue-400',   badgeBg: 'bg-blue-100',   badgeText: 'text-blue-700',   avatarBg: 'bg-[#1A5FA8]',  priorite: 2 },
  terminee:    { label: 'Terminée',    dotBg: 'bg-green-400',  badgeBg: 'bg-green-100',  badgeText: 'text-green-700',  avatarBg: 'bg-green-600',  priorite: 3 },
  disponible:  { label: 'Disponible',  dotBg: 'bg-slate-300',  badgeBg: 'bg-slate-100',  badgeText: 'text-slate-500',  avatarBg: 'bg-slate-400',  priorite: 4 },
  absent:      { label: 'Absent',      dotBg: 'bg-slate-400',  badgeBg: 'bg-slate-200',  badgeText: 'text-slate-600',  avatarBg: 'bg-slate-400',  priorite: 5 },
}

function contexteAgent(agent: AgentStatut): string {
  if (agent.statut === 'absent') return 'Absent aujourd\'hui'
  if (agent.statut === 'disponible') return 'Aucune intervention'
  const enCours = agent.interventions.find(i => i.statut === 'en_cours')
  if (enCours) return `En cours · ${enCours.residences?.nom ?? '—'}`
  const derniereTerminee = [...agent.interventions].reverse().find(i => i.statut === 'terminee')
  if (derniereTerminee && agent.statut === 'terminee') {
    const heure = derniereTerminee.heure_fin_prevue?.slice(0, 5) ?? '—'
    return `${agent.nbTerminees} intervention${agent.nbTerminees > 1 ? 's' : ''} · fin ${heure}`
  }
  const prochaine = agent.interventions.find(i => i.statut === 'planifiee')
  if (prochaine) return `${agent.nbTotal} intervention${agent.nbTotal > 1 ? 's' : ''} · ${prochaine.heure_debut_prevue?.slice(0, 5) ?? '—'}`
  return `${agent.nbTotal} intervention${agent.nbTotal > 1 ? 's' : ''}`
}

export default function DashboardEquipe({ agents }: { agents: AgentStatut[] }) {
  const sorted = [...agents].sort((a, b) =>
    STATUT_CONFIG[a.statut].priorite - STATUT_CONFIG[b.statut].priorite
  )

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800">Équipe aujourd'hui</h2>
      </div>
      {!sorted.length ? (
        <div className="px-5 py-8 text-center text-slate-400 text-sm">Aucun agent.</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {sorted.map(agent => {
            const cfg = STATUT_CONFIG[agent.statut]
            return (
              <div key={agent.id} className="flex items-center gap-3 px-5 py-3">
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${cfg.avatarBg}`}>
                    {agent.prenom[0]}{agent.nom[0]}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${cfg.dotBg}`}/>
                </div>
                {/* Nom + contexte */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{agent.prenom} {agent.nom}</p>
                  <p className="text-xs text-slate-400 truncate">{contexteAgent(agent)}</p>
                </div>
                {/* Badge */}
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.badgeBg} ${cfg.badgeText}`}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
