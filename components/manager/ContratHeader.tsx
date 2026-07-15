import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase-server'
import { Building2, Trash2, Leaf, ChevronRight } from 'lucide-react'
import ContratHeaderQR from './ContratHeaderQR'

export type ContratTab = 'planning' | 'taches' | 'rapports' | 'parametres'

interface Props {
  residenceId: string
  contratId: string
  activeTab: ContratTab
}

const TYPE_CFG: Record<string, { label: string; icon: React.ReactNode }> = {
  parties_communes: { label: 'Parties communes', icon: <Building2 className="w-3 h-3" /> },
  containers:       { label: 'Containers',       icon: <Trash2 className="w-3 h-3" /> },
  espaces_verts:    { label: 'Espaces verts',    icon: <Leaf className="w-3 h-3" /> },
}

const STATUT_CFG: Record<string, { label: string; cls: string }> = {
  actif:   { label: 'Actif',      cls: 'bg-green-500/20 text-green-200' },
  futur:   { label: 'Futur',      cls: 'bg-blue-500/20 text-blue-200' },
  sommeil: { label: 'En sommeil', cls: 'bg-white/15 text-white/70' },
  termine: { label: 'Terminé',    cls: 'bg-white/15 text-white/60' },
}

function calcStatut(actif: boolean, dateDebut: string, dateFin: string, today: string) {
  if (dateFin < today)   return 'termine'
  if (dateDebut > today)  return actif ? 'futur' : 'sommeil'
  if (!actif)             return 'sommeil'
  return 'actif'
}

// En-tête partagé des pages scopées à un contrat (page contrat + planning/tâches/rapports
// appelés avec ?contratId=). Fil d'Ariane + badges + barre d'onglets + QR.
// Se charge lui-même de ses données (une requête résidence + une requête contrat).
export default async function ContratHeader({ residenceId, contratId, activeTab }: Props) {
  const admin = await createAdminClient()
  const [{ data: res }, { data: c }] = await Promise.all([
    admin.from('residences').select('nom').eq('id', residenceId).single(),
    admin.from('contrats_residences')
      .select('libelle, type_contrat, actif, date_debut, date_fin, qr_code_token')
      .eq('id', contratId).single(),
  ])

  const nom = res?.nom ?? 'Résidence'
  const libelle = c?.libelle ?? 'Contrat'
  const typeCfg = c?.type_contrat ? TYPE_CFG[c.type_contrat] : null

  const todayStr = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const statut = c ? calcStatut(c.actif ?? false, c.date_debut, c.date_fin, todayStr) : 'sommeil'
  const statutCfg = STATUT_CFG[statut]

  const base = `/manager/residences/${residenceId}`
  const tabs: { key: ContratTab; label: string; href: string }[] = [
    { key: 'planning',   label: 'Planning',   href: `${base}/planning?contratId=${contratId}` },
    { key: 'taches',     label: 'Tâches',     href: `${base}/taches?contratId=${contratId}` },
    { key: 'rapports',   label: 'Rapports',   href: `${base}/rapports?contratId=${contratId}` },
    { key: 'parametres', label: 'Paramètres', href: `${base}/contrats/${contratId}` },
  ]

  return (
    <div className="bg-[#0A2E5A] text-white px-6 py-5 md:px-8">
      {/* Fil d'Ariane */}
      <nav className="flex items-center gap-1.5 text-sm text-blue-300 mb-3 flex-wrap">
        <Link href="/manager/residences" className="hover:text-white transition-colors">Résidences</Link>
        <ChevronRight className="w-3.5 h-3.5 text-blue-400/60" />
        <Link href={base} className="hover:text-white transition-colors truncate max-w-[40vw]">{nom}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-blue-400/60" />
        <span className="text-white font-medium truncate max-w-[30vw]">{libelle}</span>
      </nav>

      {/* Titre + badges + QR */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-snug truncate">{libelle}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statutCfg.cls}`}>
              {statutCfg.label}
            </span>
            {typeCfg && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/80">
                {typeCfg.icon} {typeCfg.label}
              </span>
            )}
          </div>
        </div>
        {c?.qr_code_token && (
          <ContratHeaderQR residenceNom={nom} libelle={c.libelle} token={c.qr_code_token} />
        )}
      </div>

      {/* Barre d'onglets */}
      <div className="flex gap-1 mt-4 -mb-5 overflow-x-auto">
        {tabs.map(t => {
          const active = t.key === activeTab
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                active
                  ? 'bg-slate-100 text-[#0A2E5A]'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
