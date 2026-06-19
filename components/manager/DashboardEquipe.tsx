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

const ORDRE: StatutAgent[] = ['en_retard', 'pas_scanne', 'en_cours', 'terminee', 'absent', 'disponible']

const GROUPES: Record<StatutAgent, { label: string; couleur: string; bg: string; avatarBg: string }> = {
  en_retard:  { label: 'En retard',          couleur: '#A32D2D', bg: '#FCEBEB', avatarBg: '#DC2626' },
  pas_scanne: { label: 'Pas encore scanné',  couleur: '#854F0B', bg: '#FAEEDA', avatarBg: '#D97706' },
  en_cours:   { label: 'En cours',           couleur: '#185FA5', bg: '#E6F1FB', avatarBg: '#1A5FA8' },
  terminee:   { label: 'Terminé',            couleur: '#3B6D11', bg: '#EAF3DE', avatarBg: '#16A34A' },
  absent:     { label: 'Absent',             couleur: '#5F5E5A', bg: '#F1EFE8', avatarBg: '#78716C' },
  disponible: { label: 'Disponible',         couleur: '#888780', bg: '#F1EFE8', avatarBg: '#A8A29E' },
}

function contexteAgent(agent: AgentStatut): string {
  if (agent.statut === 'absent') return 'Absent aujourd\'hui'
  if (agent.statut === 'disponible') return 'Aucune intervention'
  const enCours = agent.interventions.find(i => i.statut === 'en_cours')
  if (enCours) return enCours.residences?.nom ?? '—'
  const derniereTerminee = [...agent.interventions].reverse().find(i => i.statut === 'terminee')
  if (derniereTerminee && agent.statut === 'terminee') {
    const heure = derniereTerminee.heure_fin_prevue?.slice(0, 5) ?? '—'
    return `${agent.nbTerminees} interv. · fin ${heure}`
  }
  const prochaine = agent.interventions.find(i => i.statut === 'planifiee')
  if (prochaine) return `${agent.nbTotal} interv. · ${prochaine.heure_debut_prevue?.slice(0, 5) ?? '—'}`
  return `${agent.nbTotal} intervention${agent.nbTotal > 1 ? 's' : ''}`
}

export default function DashboardEquipe({ agents }: { agents: AgentStatut[] }) {
  const parGroupe = ORDRE.map(statut => ({
    statut,
    cfg: GROUPES[statut],
    membres: agents.filter(a => a.statut === statut),
  })).filter(g => g.membres.length > 0)

  if (!agents.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center text-slate-400 text-sm">
        Aucun agent.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="font-semibold text-slate-800 text-sm">Équipe aujourd'hui</h2>
      </div>
      <div className="divide-y divide-slate-50">
        {parGroupe.map(({ statut, cfg, membres }) => (
          <div key={statut}>
            {/* Titre de groupe */}
            <div className="px-5 py-2" style={{ background: cfg.bg }}>
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: cfg.couleur }}>
                {cfg.label} ({membres.length})
              </p>
            </div>
            {/* Agents du groupe */}
            {membres.map(agent => (
              <div key={agent.id} className="flex items-center gap-3 px-5 py-2.5 border-t border-slate-50">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                  style={{ background: cfg.avatarBg }}
                >
                  {agent.prenom[0]}{agent.nom[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 leading-tight">
                    {agent.prenom} {agent.nom}
                  </p>
                  <p className="text-xs text-slate-400 truncate leading-tight">{contexteAgent(agent)}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
