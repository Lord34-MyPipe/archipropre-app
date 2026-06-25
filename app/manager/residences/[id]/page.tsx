import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence } from '@/lib/types'
import type { EtatResidenceInfo } from '@/components/manager/ResidenceCard'
import ResidenceDetailClient from './ResidenceDetailClient'
import { calcCoutMensuel, type KpiResidence, type TacheFrequence } from '@/lib/rentabilite'

export const dynamic = 'force-dynamic'

interface Props { params: Promise<{ id: string }> }

export default async function ResidenceDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = await createAdminClient()

  const { data: res } = await supabase
    .from('residences')
    .select('id,nom,adresse,type_client,actif,agent_prefere_id,notes_import,lat,lng,qr_code_token,manager_id,agent_secondaire_id,agent_exclu_ids,vehicule_requis,competences_requises,created_at,client_exigeant')
    .eq('id', id)
    .eq('manager_id', user.id)
    .single()

  if (!res) redirect('/manager/residences')

  const [{ data: etatRow }, { data: contratRow }, kpi] = await Promise.all([
    admin.from('v_etat_residence')
      .select('etat,nom_agent_attitre')
      .eq('residence_id', id)
      .maybeSingle(),
    admin.from('contrats_residences')
      .select('id,montant_mensuel,nb_interventions_mois')
      .eq('residence_id', id)
      .maybeSingle(),
    (async (): Promise<KpiResidence | null> => {
      try {
        const [{ data: contrats }, { data: params }] = await Promise.all([
          admin.from('contrats_residences').select('id, montant_mensuel').eq('residence_id', id).eq('actif', true),
          admin.from('parametres_societe').select('taux_horaire_agent').limit(1).maybeSingle(),
        ])
        const tauxAgent = (params?.taux_horaire_agent as number | null) ?? 23
        const contratsList = contrats ?? []
        if (contratsList.length === 0) {
          return { caMois: 0, coutMoisEstime: 0, margeMois: 0, tauxMarge: null, perteCachee: false, hasContrats: false }
        }
        const { data: zones } = await admin.from('zones_residence')
          .select('id, contrat_id')
          .in('contrat_id', contratsList.map(c => c.id))
        const typedZones = (zones ?? []) as { id: string; contrat_id: string }[]
        const zoneIds = typedZones.map(z => z.id)
        type TF = TacheFrequence & { zone_id: string }
        const taches: TF[] = zoneIds.length > 0
          ? (((await admin.from('taches_template')
              .select('zone_id, duree_minutes, frequence_type, jours_semaine, frequence_valeur')
              .in('zone_id', zoneIds)).data ?? []) as TF[])
          : []
        const zoneToContrat = new Map<string, string>(typedZones.map(z => [z.id, z.contrat_id]))
        const tachesParContrat = new Map<string, TacheFrequence[]>()
        for (const t of taches) {
          const cid = zoneToContrat.get(t.zone_id)
          if (!cid) continue
          if (!tachesParContrat.has(cid)) tachesParContrat.set(cid, [])
          tachesParContrat.get(cid)!.push(t)
        }
        let caMois = 0, coutMoisEstime = 0, perteCachee = false
        for (const c of contratsList) {
          const ca = (c.montant_mensuel as number | null) ?? 0
          const cout = calcCoutMensuel(tachesParContrat.get(c.id) ?? [], tauxAgent)
          caMois += ca
          coutMoisEstime += cout
          if (ca - cout < 0) perteCachee = true
        }
        const margeMois = caMois - coutMoisEstime
        return {
          caMois,
          coutMoisEstime,
          margeMois,
          tauxMarge: caMois > 0 ? (margeMois / caMois) * 100 : null,
          perteCachee,
          hasContrats: true,
        }
      } catch {
        return null
      }
    })(),
  ])

  const etat = (etatRow?.etat ?? 'a_configurer') as EtatResidenceInfo['etat']
  const agentNom: string | null = etatRow?.nom_agent_attitre ?? null

  return (
    <ResidenceDetailClient
      residence={res as unknown as Residence}
      etat={etat}
      agentNom={agentNom}
      contrat={contratRow ?? null}
      kpi={kpi}
    />
  )
}
