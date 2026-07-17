export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2, Clock, ChevronRight, Send } from 'lucide-react'

// Écran niveau 1 (étape 9b, §7.3) — liste des bâtiments à faire aujourd'hui sur
// cette résidence. N'existe QUE pour les résidences multi-bâtiments : le scan
// route ici uniquement quand il y a plusieurs interventions le même jour.
// Le clic sur une carte va vers l'écran niveau 2 (zones, existant, inchangé).

interface Props {
  params: Promise<{ contratId: string }>
}

interface MissionIntervention {
  id: string
  batiment: string | null
  statut: string
  heure_debut_prevue: string | null
  heure_fin_prevue: string | null
  heure_scan: string | null
  residences: { nom: string } | null
}

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  planifiee: { label: 'À faire',  bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' },
  en_cours:  { label: 'En cours', bg: 'bg-amber-50',  text: 'text-amber-700', dot: 'bg-amber-400' },
  terminee:  { label: 'Terminé',  bg: 'bg-green-50',  text: 'text-green-700', dot: 'bg-green-400' },
  validee:   { label: 'Terminé',  bg: 'bg-green-50',  text: 'text-green-700', dot: 'bg-green-400' },
}

export default async function MissionPage({ params }: Props) {
  const { contratId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Date du jour en Europe/Paris (même pattern que agent/scan/page.tsx)
  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' })

  const { data: intersRaw } = await supabase
    .from('interventions')
    .select('id, batiment, statut, heure_debut_prevue, heure_fin_prevue, heure_scan, residences(nom)')
    .eq('agent_id', user.id)
    .eq('contrat_id', contratId)
    .eq('date_prevue', today)
    .neq('statut', 'annulee')
    .order('heure_debut_prevue') as { data: MissionIntervention[] | null }

  const interventions = intersRaw ?? []

  // Garde-fou : cet écran n'a de sens qu'à 2+ bâtiments. Si la situation a changé
  // depuis le scan (ex. un bâtiment annulé entre-temps), on retombe sur le
  // comportement direct plutôt que d'afficher un écran de choix inutile.
  if (interventions.length === 0) redirect('/agent/dashboard')
  if (interventions.length === 1) redirect(`/agent/intervention/${interventions[0].id}`)

  // Nb de zones par bâtiment — décompte simple pour l'instant (pas encore
  // "X/N validées" : le scan n'est pas encore scopé par bâtiment, cf. audit
  // 9c — un compteur de progression serait donc faux à ce stade. Raffiné en 9g.
  const { data: zonesRaw } = await supabase
    .from('zones_residence')
    .select('batiment')
    .eq('contrat_id', contratId)
  const zonesParBatiment = new Map<string, number>()
  for (const z of zonesRaw ?? []) {
    const b = (z.batiment as string | null) ?? ''
    zonesParBatiment.set(b, (zonesParBatiment.get(b) ?? 0) + 1)
  }

  const residenceNom = interventions[0].residences?.nom ?? '—'
  const heureScanIso = interventions.find(i => i.heure_scan)?.heure_scan ?? null
  const heureScanLabel = heureScanIso
    ? new Date(heureScanIso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
    : null
  const tousTermines = interventions.every(i => i.statut === 'terminee' || i.statut === 'validee')

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Header */}
      <div className="px-5 pt-10 pb-6" style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}>
        <h1 className="text-xl font-bold text-white truncate">{residenceNom}</h1>
        {heureScanLabel && (
          <p className="text-blue-200 text-sm font-medium mt-1.5 flex items-center gap-1.5">
            <Clock className="w-4 h-4 shrink-0" />
            Démarré à {heureScanLabel} · {tousTermines ? 'terminé' : 'en cours'}
          </p>
        )}
        <p className="text-blue-300 text-sm mt-1">
          {interventions.length} bâtiments à faire aujourd&apos;hui
        </p>
      </div>

      {/* Cartes bâtiments */}
      <div className="px-5 py-5 space-y-3">
        {interventions.map(inter => {
          const statutCfg = STATUT_CONFIG[inter.statut] ?? STATUT_CONFIG.planifiee
          const nbZones = zonesParBatiment.get(inter.batiment ?? '') ?? 0
          return (
            <Link key={inter.id} href={`/agent/intervention/${inter.id}`}>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4 active:bg-slate-50 transition-colors">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#EFF6FF' }}>
                  <Building2 className="w-6 h-6 text-[#1A5FA8]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 truncate">{inter.batiment ?? 'Bâtiment'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {nbZones} zone{nbZones > 1 ? 's' : ''}
                    {inter.heure_debut_prevue ? ` · ${inter.heure_debut_prevue.slice(0, 5)}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statutCfg.bg} ${statutCfg.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statutCfg.dot}`} />
                    {statutCfg.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Bouton envoyer rapport — grisé pour l'instant (CTA final généralisé = étape 9g) */}
      <div className="fixed bottom-20 left-0 right-0 max-w-lg mx-auto px-5 z-20">
        <button
          disabled
          title="Bientôt disponible"
          className="w-full h-14 rounded-2xl text-white font-bold text-base shadow-xl flex items-center justify-center gap-2 cursor-not-allowed opacity-50"
          style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
        >
          <Send className="w-5 h-5" />
          Envoyer le rapport
        </button>
      </div>
    </div>
  )
}
