import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase-server'
import { resolveIdentifiant, isIdentifiantDejaPris } from '@/lib/agent-identifiant'

async function getManagerUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'manager') return null
  return user
}

// GET /api/agents — liste des agents actifs du manager
export async function GET() {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, prenom, nom, binome_agent_id')
    .eq('role', 'agent')
    .eq('actif', true)
    .eq('manager_id', manager.id)
    .order('nom')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ agents: data ?? [] })
}

// POST /api/agents — créer un agent
export async function POST(req: NextRequest) {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { nom, prenom, email, telephone, password, vehicule, zones_geo, competences, contrat_heures_hebdo, disponibilites } = body

  if (!nom || !prenom || !email || !password) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 })
  }

  // Identifiant simple sans email (agent terrain) ou vrai email — résolu vers
  // un email technique valide pour Supabase Auth dans les deux cas.
  const resolved = resolveIdentifiant(String(email))
  if (!resolved) {
    return NextResponse.json(
      { error: 'Identifiant invalide — utilisez un email, ou un identifiant simple (lettres, chiffres, points, tirets)' },
      { status: 400 }
    )
  }

  const admin = await createAdminClient()

  // Créer le compte auth
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: resolved.email,
    password,
    email_confirm: true,
    user_metadata: { nom, prenom },
  })
  if (authErr) {
    const dejaPris = isIdentifiantDejaPris(authErr)
    return NextResponse.json(
      { error: dejaPris ? 'Cet identifiant est déjà utilisé par un autre compte.' : authErr.message },
      { status: dejaPris ? 409 : 400 }
    )
  }

  // Créer le profil
  const { error: profileErr } = await admin.from('profiles').insert({
    id: authData.user.id,
    nom,
    prenom,
    email: resolved.email,
    telephone: telephone || null,
    role: 'agent',
    vehicule: vehicule ?? false,
    zones_geo: zones_geo ?? [],
    competences: competences ?? [],
    contrat_heures_hebdo: contrat_heures_hebdo ?? 35,
    disponibilites: disponibilites ?? {},
    manager_id: manager.id,
    actif: true,
    residences_attitrees: [],
    residences_exclues: [],
  })

  if (profileErr) {
    // Rollback auth user si profil échoue
    await admin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 400 })
  }

  return NextResponse.json({ id: authData.user.id })
}

// PATCH /api/agents — modifier un agent
export async function PATCH(req: NextRequest) {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { id, nom, prenom, email, telephone, adresse_domicile, vehicule, zones_geo, competences, contrat_heures_hebdo, disponibilites, actif,
          mode_deplacement, secteur_libelle, seuil_cible_pct, binome_agent_id, facteur_binome, password } = body
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  const admin = await createAdminClient()

  // Vérifier que l'agent appartient à ce manager
  const { data: agent } = await admin.from('profiles').select('manager_id, binome_agent_id, email').eq('id', id).single()
  if (agent?.manager_id !== manager.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}

  // Email : c'est l'identifiant de connexion (auth.users), profiles.email n'est
  // qu'un miroir. On ne touche à auth QUE si l'email a réellement changé, et on
  // s'arrête immédiatement en cas d'échec pour ne jamais laisser les deux
  // diverger (pas d'écriture profiles si l'écriture auth a échoué).
  if (email !== undefined) {
    const resolved = resolveIdentifiant(String(email))
    if (!resolved) {
      return NextResponse.json(
        { error: 'Identifiant invalide — utilisez un email, ou un identifiant simple (lettres, chiffres, points, tirets)' },
        { status: 400 }
      )
    }
    const newEmail = resolved.email
    const currentEmail = (agent?.email ?? '').toLowerCase()
    if (newEmail !== currentEmail) {
      const { error: emailErr } = await admin.auth.admin.updateUserById(id, { email: newEmail })
      if (emailErr) {
        console.error('[PATCH /api/agents] updateUserById(email) error:', JSON.stringify(emailErr, null, 2))
        const dejaPris = isIdentifiantDejaPris(emailErr)
        return NextResponse.json(
          { error: dejaPris ? 'Cet identifiant est déjà utilisé par un autre compte.' : (emailErr.message || 'Erreur mise à jour identifiant') },
          { status: dejaPris ? 409 : 400 }
        )
      }
      updates.email = newEmail
    }
  }

  if (nom !== undefined) updates.nom = nom
  if (prenom !== undefined) updates.prenom = prenom
  if (telephone !== undefined) updates.telephone = telephone || null
  if (adresse_domicile !== undefined) updates.adresse_domicile = adresse_domicile || null
  if (vehicule !== undefined) updates.vehicule = vehicule
  if (zones_geo !== undefined) updates.zones_geo = zones_geo
  if (competences !== undefined) updates.competences = competences
  if (contrat_heures_hebdo !== undefined) updates.contrat_heures_hebdo = contrat_heures_hebdo
  if (disponibilites !== undefined) updates.disponibilites = disponibilites
  if (actif !== undefined) updates.actif = actif
  if (mode_deplacement !== undefined) updates.mode_deplacement = mode_deplacement
  if (secteur_libelle !== undefined) updates.secteur_libelle = secteur_libelle || null
  if (seuil_cible_pct !== undefined) updates.seuil_cible_pct = Number(seuil_cible_pct)
  if (facteur_binome !== undefined) updates.facteur_binome = Number(facteur_binome)

  if (binome_agent_id !== undefined) {
    const newBinomeId = binome_agent_id || null
    const oldBinomeId = agent?.binome_agent_id ?? null
    updates.binome_agent_id = newBinomeId
    // Effacer l'ancien binôme si différent
    if (oldBinomeId && oldBinomeId !== newBinomeId) {
      await admin.from('profiles').update({ binome_agent_id: null }).eq('id', oldBinomeId)
    }
    // Relation symétrique : pointer le nouveau binôme vers cet agent + copier le facteur
    if (newBinomeId) {
      const symUpdate: Record<string, unknown> = { binome_agent_id: id }
      if (facteur_binome !== undefined) symUpdate.facteur_binome = Number(facteur_binome)
      await admin.from('profiles').update(symUpdate).eq('id', newBinomeId)
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await admin.from('profiles').update(updates).eq('id', id)
    if (error) {
      console.error('[PATCH /api/agents] profiles.update error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  // Mise à jour du mot de passe via Auth Admin (ne passe jamais par profiles)
  if (password && typeof password === 'string' && password.length >= 6) {
    console.log('[PATCH /api/agents] id pour updateUserById:', id, typeof id)
    const { data: pwData, error: pwErr } = await admin.auth.admin.updateUserById(id, { password })
    if (pwErr) {
      console.error('[PATCH /api/agents] updateUserById error FULL:',
        JSON.stringify(pwErr, null, 2),
        'status:', pwErr?.status,
        'message:', pwErr?.message,
        'code:', pwErr?.code
      )
      return NextResponse.json(
        { error: pwErr?.message || pwErr?.code || 'Erreur mise à jour mot de passe' },
        { status: 500 }
      )
    }
    console.log('[PATCH /api/agents] password updated for user:', pwData?.user?.email)
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/agents — désactiver un agent (soft delete)
export async function DELETE(req: NextRequest) {
  const manager = await getManagerUser()
  if (!manager) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 })

  const admin = await createAdminClient()
  const { data: agent } = await admin.from('profiles').select('manager_id').eq('id', id).single()
  if (agent?.manager_id !== manager.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const { error } = await admin.from('profiles').update({ actif: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
