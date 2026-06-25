import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import RapportsActions from '@/components/manager/RapportsActions'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ contratId?: string }>
}

function parseMin(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function formatDateFR(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Europe/Paris',
  })
}

export default async function RapportsPage({ params, searchParams }: Props) {
  const { id } = await params
  const { contratId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Ownership check
  const { data: residence } = await supabase.from('residences')
    .select('nom, adresse')
    .eq('id', id)
    .eq('manager_id', user.id)
    .single()
  if (!residence) redirect('/manager/residences')

  const admin = await createAdminClient()

  // Libellé du contrat filtré (si contratId fourni)
  let contratLibelle: string | null = null
  if (contratId) {
    const { data: contrat } = await admin.from('contrats_residences')
      .select('libelle')
      .eq('id', contratId)
      .eq('residence_id', id)
      .maybeSingle()
    contratLibelle = contrat?.libelle ?? null
  }

  const query = admin.from('interventions')
    .select('id, agent_id, contrat_id, date_prevue, heure_scan, heure_fin, statut, validee_at, contrats_residences(libelle), profiles!interventions_agent_id_fkey(prenom, nom)')
    .eq('residence_id', id)
    .in('statut', ['terminee', 'validee'])
    .order('date_prevue', { ascending: false })

  const { data: interventions } = contratId
    ? await query.eq('contrat_id', contratId)
    : await query

  const backHref = contratId
    ? `/manager/residences/${id}`
    : '/manager/residences'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* En-tête */}
        <div className="mb-6">
          <Link href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
            </svg>
            Retour
          </Link>
          <h1 className="text-xl font-bold text-slate-800">
            {contratId ? `Rapports — ${contratLibelle ?? 'Contrat'}` : 'Rapports'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{residence.nom}</p>
        </div>

        {/* Liste */}
        {!interventions || interventions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
              </svg>
            </div>
            <p className="text-sm text-slate-500">Aucun rapport disponible pour cette résidence.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {interventions.map(iv => {
              const agentRaw = (iv as Record<string, unknown>).profiles
              const agent = Array.isArray(agentRaw) ? agentRaw[0] : agentRaw
              const agentPrenom = agent ? (agent as { prenom: string; nom: string }).prenom : ''
              const agentNom = agent
                ? `${(agent as { prenom: string; nom: string }).prenom} ${(agent as { prenom: string; nom: string }).nom}`
                : 'Agent inconnu'
              const agentId = (iv as unknown as Record<string, string>).agent_id ?? null
              const contratRaw = (iv as Record<string, unknown>).contrats_residences
              const ligneContrat = contratRaw
                ? (contratRaw as { libelle: string | null }).libelle
                : null

              const debut = parseMin(iv.heure_scan)
              const fin   = parseMin(iv.heure_fin)
              const dureeMin = debut !== null && fin !== null ? fin - debut : null

              return (
                <div key={iv.id} className="bg-white rounded-2xl border border-slate-100 px-4 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 capitalize">
                      {formatDateFR(iv.date_prevue)}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-slate-500">{agentNom}</span>
                      {dureeMin !== null && (
                        <>
                          <span className="text-slate-200">·</span>
                          <span className="text-xs text-slate-500">
                            {Math.floor(dureeMin / 60) > 0 && `${Math.floor(dureeMin / 60)} h `}
                            {dureeMin % 60 > 0 && `${dureeMin % 60} min`}
                          </span>
                        </>
                      )}
                    </div>
                    {ligneContrat && !contratId && (
                      <p className="text-xs font-semibold mt-0.5" style={{ color: '#0BBFBF' }}>
                        {ligneContrat}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {iv.statut === 'validee' ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#EAF3DE', color: '#3B6D11' }}>
                        ✓ Validé
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#FAEEDA', color: '#854F0B' }}>
                        En attente
                      </span>
                    )}
                    {agentId && (
                      <RapportsActions
                        agentId={agentId}
                        agentNom={agentNom}
                        date={iv.date_prevue}
                        prenomAgent={agentPrenom}
                      />
                    )}
                    <Link
                      href={`/manager/interventions/${iv.id}/rapport`}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                      Voir
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
                      </svg>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
