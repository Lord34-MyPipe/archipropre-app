import { createClient, createAdminClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import type { Residence } from '@/lib/types'
import type { EtatResidenceInfo } from '@/components/manager/ResidenceCard'
import ResidenceDetailClient from './ResidenceDetailClient'

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

  const [{ data: etatRow }, { data: contratRow }] = await Promise.all([
    admin.from('v_etat_residence')
      .select('etat,nom_agent_attitre')
      .eq('residence_id', id)
      .maybeSingle(),
    admin.from('contrats_residences')
      .select('id,montant_mensuel,nb_interventions_mois')
      .eq('residence_id', id)
      .maybeSingle(),
  ])

  const etat = (etatRow?.etat ?? 'a_configurer') as EtatResidenceInfo['etat']
  const agentNom: string | null = etatRow?.nom_agent_attitre ?? null

  return (
    <ResidenceDetailClient
      residence={res as unknown as Residence}
      etat={etat}
      agentNom={agentNom}
      contrat={contratRow ?? null}
    />
  )
}
