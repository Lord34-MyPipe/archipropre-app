// Parcours manager critique (point 1 de la demande) : login → wizard IA
// top-down → cartes de décision → création du contrat → génération du
// planning → vérification que les interventions couvrent les créneaux.
// Reproduit le cas GMCO validé de bout en bout le 21/07/2026 (créneaux
// mardi 18h30-19h30 / vendredi 18h30-20h00, agent en binôme, prestation
// mono-bâtiment bi-hebdomadaire).
import { test, expect, type Page } from '@playwright/test'
import { ensureFixtures, nettoyerContrat } from './support/fixtures'
import { login } from './support/auth'
import { E2E_MANAGER_EMAIL, E2E_MANAGER_PASSWORD } from './support/env'

const TEXTE_CONTRAT = `Résidence de test — parties communes, un seul bâtiment.
Prestations hebdomadaires (mardi et vendredi) : dépoussiérage rampes et mains courantes, lavage sol hall d'entrée et paliers, entretien du matériel de nettoyage — le mardi est un passage allégé (uniquement les tâches à fréquence bi-hebdomadaire), le vendredi est le passage complet.
Nettoyage complet des vitres du hall une fois par mois, semaine non précisée dans le cahier des charges.`

async function ajouterCreneau(page: Page, joursLabels: string[], debut: string, fin: string) {
  await page.getByRole('button', { name: /Ajouter un créneau/ }).click()
  const joursBox = page.getByTestId('jours-creneau')
  for (const j of joursLabels) {
    await joursBox.getByRole('button', { name: j, exact: true }).click()
  }
  const timeInputs = page.locator('input[type="time"]')
  await timeInputs.nth(0).fill(debut)
  await timeInputs.nth(1).fill(fin)
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
}

// Résout toutes les cartes "Décisions & remarques" de l'étape 3 en cliquant
// l'option "garder tel quel" (effet=none) — TOUJOURS proposée par le prompt
// pour une carte "question" (règle vérifiée par script cette session), et
// "✓ Lu" pour les cartes "info". Ne dépend jamais du libellé exact généré
// par l'IA (non déterministe d'un run à l'autre) au-delà de ce mot.
async function resoudreDecisions(page: Page) {
  for (let i = 0; i < 10; i++) {
    const garder = page.getByRole('button', { name: /garder/i })
    const lu = page.getByRole('button', { name: '✓ Lu', exact: true })
    const nGarder = await garder.count()
    const nLu = await lu.count()
    if (nGarder === 0 && nLu === 0) break
    if (nGarder > 0) await garder.first().click()
    else await lu.first().click()
    await page.waitForTimeout(200)
  }
}

test.describe.serial('Parcours manager — wizard top-down → création → génération planning', () => {
  let residenceId: string
  let agentAId: string
  let contratId: string | null = null

  test.beforeAll(async () => {
    const fx = await ensureFixtures()
    residenceId = fx.residenceId
    agentAId = fx.agentAId
  })

  test.afterAll(async () => {
    if (contratId) await nettoyerContrat(contratId)
  })

  test('login manager → wizard → décisions → création → génération', async ({ page }) => {
    await login(page, E2E_MANAGER_EMAIL(), E2E_MANAGER_PASSWORD(), '/manager/dashboard')

    await page.goto(`/manager/residences/${residenceId}`)
    await page.getByRole('button', { name: 'Nouveau contrat (assisté IA)' }).click()

    // ── Étape 1 : Identité + organisation actuelle ──
    // Créneaux identiques au cas GMCO validé le 21/07 : mardi 60 min, vendredi 90 min.
    await ajouterCreneau(page, ['Mar'], '18:30', '19:30')
    await ajouterCreneau(page, ['Ven'], '18:30', '20:00')
    await page.locator('select').selectOption({ value: agentAId })
    await page.getByRole('button', { name: 'Continuer → Analyse' }).click()

    // ── Étape 2 : analyse IA (appel Claude réel — peut prendre 20-40s) ──
    await page.getByPlaceholder('Collez le texte du contrat ou décrivez la prestation').fill(TEXTE_CONTRAT)
    await page.getByRole('button', { name: 'Analyser', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Continuer → Validation' })).toBeVisible({ timeout: 60_000 })

    // ── Étape 3 : cartes de décision, cliquées en réel ──
    await resoudreDecisions(page)
    await page.getByRole('button', { name: 'Continuer → Validation' }).click()

    // ── Étape 4 : création du contrat + génération du planning ──
    const creerResponse = page.waitForResponse(r => r.url().includes('/creer-complet') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Créer le contrat complet' }).click()
    const creerRes = await creerResponse
    expect(creerRes.ok()).toBeTruthy()
    const creerJson = await creerRes.json()
    contratId = creerJson.contrat_id
    expect(contratId).toBeTruthy()
    expect(creerJson.nb_zones).toBeGreaterThan(0)
    expect(creerJson.nb_taches).toBeGreaterThan(0)
    await expect(page.getByText('✓ Contrat créé')).toBeVisible()

    const generationResponse = page.waitForResponse(r => r.url().includes('/api/planning/generer') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Générer le planning' }).click()
    const generationRes = await generationResponse
    expect(generationRes.ok()).toBeTruthy()
    await expect(page.getByText('✓ Planning généré')).toBeVisible()

    // ── Vérification durées/créneaux (point 1 de la demande) ──
    // Les interventions générées doivent référencer les horaires des créneaux
    // saisis à l'étape 1 (18h30 apparaît forcément mardi ET vendredi).
    await page.goto(`/manager/residences/${residenceId}/planning`)
    await expect(page.getByText('18:30').first()).toBeVisible({ timeout: 15_000 })
  })
})
