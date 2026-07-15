import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence } from '@/lib/types'
import type { EtatResidenceInfo } from '@/components/manager/ResidenceCard'
import ResidenceDetailClient from './ResidenceDetailClient'
import { calcCoutMensuel, type KpiResidence, type TacheFrequence } from '@/lib/rentabilite'
import { FEATURES } from '@/lib/features'

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
      // Données financières sensibles : on ne calcule NI n'envoie les chiffres
      // au client quand la rentabilité est masquée par le feature flag.
      if (!FEATURES.rentabilite) return null
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

  // ── Checklist de configuration par contrat (calcul serveur, requêtes existantes) ──
  const todayStr = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())

  const [{ data: contratsCfg }, { data: zonesCfg }, { data: interExistantes }] = await Promise.all([
    admin.from('contrats_residences')
      .select('id, actif, montant_mensuel, creneaux_acceptes, agent_prefere_id, date_fin')
      .eq('residence_id', id),
    admin.from('zones_residence')
      .select('id, contrat_id').eq('residence_id', id).not('contrat_id', 'is', null),
    // Étape ④ « planning généré » : au moins une intervention non-annulée sur le
    // contrat, toutes dates confondues (planifiee/en_cours/terminee/validee) → un
    // planning a déjà été généré. On ne se limite PAS aux interventions futures.
    admin.from('interventions')
      .select('contrat_id').eq('residence_id', id)
      .neq('statut', 'annulee').not('contrat_id', 'is', null),
  ])

  // Zones par contrat + tâches par zone (pour l'étape « zones et tâches »)
  const zoneIds = (zonesCfg ?? []).map(z => z.id)
  const zonesAvecTache = new Set<string>()
  if (zoneIds.length > 0) {
    const { data: tachesCfg } = await admin.from('taches_template').select('zone_id').in('zone_id', zoneIds)
    for (const t of tachesCfg ?? []) if (t.zone_id) zonesAvecTache.add(t.zone_id as string)
  }
  const zonesParContrat = new Map<string, { id: string }[]>()
  for (const z of zonesCfg ?? []) {
    if (!z.contrat_id) continue
    const arr = zonesParContrat.get(z.contrat_id) ?? []
    arr.push({ id: z.id })
    zonesParContrat.set(z.contrat_id, arr)
  }
  const interParContrat = new Map<string, number>()
  for (const i of interExistantes ?? []) {
    if (i.contrat_id) interParContrat.set(i.contrat_id, (interParContrat.get(i.contrat_id) ?? 0) + 1)
  }

  const contratsChecklist = (contratsCfg ?? []).map(c => {
    const zones = zonesParContrat.get(c.id) ?? []
    const aTache = zones.some(z => zonesAvecTache.has(z.id))
    const creneaux = c.creneaux_acceptes as unknown[] | null
    const step1 = (c.actif ?? false) && c.montant_mensuel != null && Array.isArray(creneaux) && creneaux.length > 0
    const step2 = zones.length >= 1 && aTache
    const step3 = c.agent_prefere_id != null
    const step4 = (interParContrat.get(c.id) ?? 0) >= 1
    return {
      id: c.id,
      step1, step2, step3, step4,
      allDone: step1 && step2 && step3 && step4,
      estTermine: typeof c.date_fin === 'string' && c.date_fin < todayStr,
    }
  })

  return (
    <ResidenceDetailClient
      residence={res as unknown as Residence}
      etat={etat}
      agentNom={agentNom}
      contrat={contratRow ?? null}
      kpi={kpi}
      contratsChecklist={contratsChecklist}
    />
  )
}
