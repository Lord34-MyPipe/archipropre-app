// Test spécifique sur les 3 régressions corrigées le 21/07/2026 (point 4 de
// la demande). Contrat seedé directement via l'API (pas le wizard IA) pour
// rester déterministe — ces assertions portent sur des nombres précis, elles
// ne doivent jamais dépendre du texte non déterministe produit par l'IA.
import { test, expect } from '@playwright/test'
import { ensureFixtures, nettoyerContrat } from './support/fixtures'
import { adminClient } from './support/admin'
import { login } from './support/auth'
import { E2E_MANAGER_EMAIL, E2E_MANAGER_PASSWORD } from './support/env'

test.describe.serial('Régressions du 21/07/2026 — durées créneau, mono-bâtiment, chips par jour', () => {
  let residenceId: string
  let agentAId: string
  let agentBId: string
  let contratId: string

  test.beforeAll(async ({ browser }) => {
    const fx = await ensureFixtures()
    residenceId = fx.residenceId
    agentAId = fx.agentAId
    agentBId = fx.agentBId

    const page = await browser.newPage()
    await login(page, E2E_MANAGER_EMAIL(), E2E_MANAGER_PASSWORD(), '/manager/dashboard')

    // Structure mono-bâtiment + dispatch_semaine SANS tournée transverse
    // (1 seule unité/jour) — mêmes créneaux que le cas GMCO validé le 21/07.
    const creerRes = await page.request.post(`/api/residences/${residenceId}/contrats/creer-complet`, {
      data: {
        identite: {
          libelle: 'E2E régressions 21/07', type_contrat: 'parties_communes',
          date_debut: '2026-01-01', date_fin: '2027-12-31',
          montant_mensuel: 300, taux_mode: 'base', taux_specifique: null, taux_base: 25,
        },
        agent_prefere_id: agentAId,
        creneaux_acceptes: [
          { jours: ['mardi'], heure_debut: '18:30', heure_fin: '19:30' },
          { jours: ['vendredi'], heure_debut: '18:30', heure_fin: '20:00' },
        ],
        minutes_hebdo_reelles: 150,
        structure: {
          batiments: [{
            nom: 'Bâtiment principal',
            zones: [{
              nom: 'Hall',
              taches: [
                { libelle: 'Dépoussiérage', frequence_type: 'hebdo', jours_semaine: ['mardi', 'vendredi'], semaine_du_mois: null, mois_de_annee: null },
              ],
            }],
          }],
        },
        dispatch_semaine: [
          { jour: 'mardi', batiments_complets: ['Bâtiment principal'], tournees_transverses: [], containers: null, duree_totale_estimee_minutes: 60 },
          { jour: 'vendredi', batiments_complets: ['Bâtiment principal'], tournees_transverses: [], containers: null, duree_totale_estimee_minutes: 90 },
        ],
      },
    })
    expect(creerRes.ok()).toBeTruthy()
    const creerJson = await creerRes.json()
    contratId = creerJson.contrat_id

    const genRes = await page.request.post('/api/planning/generer', { data: { residenceId, contratId } })
    expect(genRes.ok()).toBeTruthy()
    await page.close()
  })

  test.afterAll(async () => {
    if (contratId) await nettoyerContrat(contratId)
  })

  test('durées des interventions = créneaux du contrat, sans réduction binôme (fix 05d26f7)', async () => {
    const admin = adminClient()
    const { data: interventions } = await admin.from('interventions')
      .select('agent_id, date_prevue, heure_debut_prevue, heure_fin_prevue, batiment')
      .eq('contrat_id', contratId)
      .order('date_prevue')
      .limit(6)

    expect(interventions?.length ?? 0).toBeGreaterThan(0)
    for (const inter of interventions ?? []) {
      expect(inter.heure_debut_prevue.slice(0, 5)).toBe('18:30')
      // jamais 18:45/19:15 (ancien bug : réduction ×facteur_binome=0.5 appliquée à tort en mode dispatch)
      expect(['19:30', '20:00']).toContain(inter.heure_fin_prevue.slice(0, 5))
    }

    // Les 2 agents du binôme (miroir) ont exactement les mêmes horaires — présence simultanée.
    const agentIds = new Set((interventions ?? []).map(i => i.agent_id))
    expect(agentIds.has(agentAId)).toBeTruthy()
    expect(agentIds.has(agentBId)).toBeTruthy()
  })

  test('aucune tournée transverse sur un contrat mono-bâtiment (fix 57a7128)', async () => {
    const admin = adminClient()
    const { data: interventions } = await admin.from('interventions')
      .select('date_prevue, batiment')
      .eq('contrat_id', contratId)
      .order('date_prevue')
      .limit(20)

    expect(interventions?.length ?? 0).toBeGreaterThan(0)
    for (const inter of interventions ?? []) {
      expect(inter.batiment ?? '').not.toMatch(/passage interm[ée]diaire|tourn[ée]e/i)
    }
    // 1 seule unité par jour et par agent (pas de split bâtiment + tournée) :
    // au plus 2 lignes par date (1 par agent du binôme), jamais 4.
    const parDate = new Map<string, number>()
    for (const inter of interventions ?? []) {
      parDate.set(inter.date_prevue, (parDate.get(inter.date_prevue) ?? 0) + 1)
    }
    for (const count of parDate.values()) expect(count).toBeLessThanOrEqual(2)
  })

  test('chips par jour de /taches = créneaux × binôme, pas une moyenne périmée (fix 2be7b99)', async ({ page }) => {
    await login(page, E2E_MANAGER_EMAIL(), E2E_MANAGER_PASSWORD(), '/manager/dashboard')
    await page.goto(`/manager/residences/${residenceId}/taches?contratId=${contratId}`)

    // 60 min × 2 (binôme) = 2h00 (mardi) ; 90 min × 2 = 3h00 (vendredi) —
    // jamais une moyenne financière lissée (ex. l'ancien 148/78 min sur GMCO).
    await expect(page.getByText('2h00', { exact: false }).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('3h00', { exact: false }).first()).toBeVisible()
  })
})
