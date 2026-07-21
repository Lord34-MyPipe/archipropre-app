// Provisioning idempotent des fixtures e2e : résidence de test dédiée + 2
// agents de test en binôme. Ne touche JAMAIS à une résidence/un agent réel —
// tout est créé (ou réutilisé s'il existe déjà) sous des noms sans ambiguïté.
// Même logique que app/api/agents/route.ts (POST) et
// app/api/residences/creer-rapide/route.ts, répliquée ici en script autonome
// (ces routes exigent une session manager via next/headers, indisponible
// hors d'une requête Next.js).
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from './admin'
import {
  E2E_RESIDENCE_NOM, E2E_AGENT_NOM_A, E2E_AGENT_PRENOM_A, E2E_AGENT_NOM_B, E2E_AGENT_PRENOM_B,
  E2E_AGENT_EMAIL, E2E_AGENT_PASSWORD, E2E_MANAGER_EMAIL,
} from './env'

export interface E2EFixtures {
  residenceId: string
  residenceQrToken: string
  managerId: string
  agentAId: string
  agentAEmail: string
  agentBId: string
}

let cached: E2EFixtures | null = null

export async function ensureFixtures(): Promise<E2EFixtures> {
  if (cached) return cached
  const admin = adminClient()

  // Manager de test EXISTANT — jamais créé ni modifié par ce script.
  const { data: manager, error: managerErr } = await admin.from('profiles')
    .select('id').eq('role', 'manager').eq('email', E2E_MANAGER_EMAIL()).maybeSingle()
  if (managerErr || !manager) {
    throw new Error(`Compte manager de test introuvable (${E2E_MANAGER_EMAIL()}) : ${managerErr?.message ?? 'aucune ligne'} — voir docs/E2E_TESTS.md`)
  }

  // Résidence de test dédiée, réutilisée si elle existe déjà (idempotent entre
  // runs) — nom volontairement sans ambiguïté, jamais GMCO ni une résidence réelle.
  let residenceId: string
  let residenceQrToken: string
  const { data: existingResidence } = await admin.from('residences')
    .select('id, qr_code_token').eq('nom', E2E_RESIDENCE_NOM).eq('manager_id', manager.id).maybeSingle()
  if (existingResidence) {
    residenceId = existingResidence.id
    residenceQrToken = existingResidence.qr_code_token
  } else {
    const { data: created, error } = await admin.from('residences').insert({
      nom: E2E_RESIDENCE_NOM,
      adresse: '1 Rue de Test, 34000 Montpellier (fixture Playwright)',
      lat: 43.6108, lng: 3.8767, // Montpellier centre — coïncide avec la géoloc simulée du test agent (évite une alerte hors_zone parasite)
      manager_id: manager.id,
      actif: true,
      notes_import: 'Résidence dédiée à la suite Playwright e2e (docs/E2E_TESTS.md) — ne jamais utiliser pour un client réel, ne jamais supprimer.',
    }).select('id, qr_code_token').single()
    if (error || !created) throw new Error(`Échec création résidence de test : ${error?.message}`)
    residenceId = created.id
    residenceQrToken = created.qr_code_token
  }

  // 2 agents de test dédiés, en binôme l'un de l'autre — jamais les comptes
  // agent réels. Agent A se connecte dans les tests, agent B n'est qu'un
  // partenaire miroir (jamais loggé) pour exercer les chemins binôme.
  const agentAEmail = E2E_AGENT_EMAIL()
  const agentBEmail = agentAEmail.replace('@', '-binome@')
  const agentAId = await ensureAgent(admin, manager.id, agentAEmail, E2E_AGENT_PASSWORD(), E2E_AGENT_PRENOM_A, E2E_AGENT_NOM_A)
  const agentBId = await ensureAgent(admin, manager.id, agentBEmail, E2E_AGENT_PASSWORD(), E2E_AGENT_PRENOM_B, E2E_AGENT_NOM_B)

  await admin.from('profiles').update({ binome_agent_id: agentBId, facteur_binome: 0.5 }).eq('id', agentAId)
  await admin.from('profiles').update({ binome_agent_id: agentAId, facteur_binome: 0.5 }).eq('id', agentBId)

  cached = { residenceId, residenceQrToken, managerId: manager.id, agentAId, agentAEmail, agentBId }
  return cached
}

async function ensureAgent(
  admin: SupabaseClient, managerId: string, email: string, password: string, prenom: string, nom: string,
): Promise<string> {
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) {
    // Réactive/rattache si un run précédent l'avait laissé dans un état inattendu.
    await admin.from('profiles').update({ actif: true, manager_id: managerId }).eq('id', existing.id)
    return existing.id
  }

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { nom, prenom },
  })
  if (authErr || !authData?.user) throw new Error(`Échec création agent de test (${email}) : ${authErr?.message}`)

  const { error: profileErr } = await admin.from('profiles').insert({
    id: authData.user.id, nom, prenom, email, role: 'agent', vehicule: false,
    zones_geo: [], competences: [], contrat_heures_hebdo: 35, disponibilites: {},
    manager_id: managerId, actif: true, residences_attitrees: [], residences_exclues: [],
  })
  if (profileErr) {
    await admin.auth.admin.deleteUser(authData.user.id) // rollback, même pattern que app/api/agents/route.ts
    throw new Error(`Échec création profil agent de test (${email}) : ${profileErr.message}`)
  }
  return authData.user.id
}

// Nettoyage d'un contrat de test — même séquence que les 2 nettoyages GMCO
// manuels de cette session (interventions → delete_contrat_cascade). Ne
// JAMAIS appeler sur un contrat qui n'a pas été créé par la suite e2e.
export async function nettoyerContrat(contratId: string): Promise<void> {
  const admin = adminClient()
  await admin.from('interventions').delete().eq('contrat_id', contratId)
  const { error } = await admin.rpc('delete_contrat_cascade', { p_contrat_id: contratId })
  if (error) throw new Error(`delete_contrat_cascade a échoué pour le contrat ${contratId} : ${error.message}`)
}
