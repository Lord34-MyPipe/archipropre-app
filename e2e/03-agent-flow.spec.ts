// Parcours agent critique (point 1 de la demande) : login → scan (mode
// `?test=1` documenté dans app/agent/scan/page.tsx, pensé précisément pour
// tester sans dépendre du jour réel ni d'une caméra) → validation des tâches
// → rapport envoyé. Seed dédié et déterministe (pas de dépendance au wizard
// IA ni au spec manager-flow) : 1 bâtiment, 1 zone, 1 tâche, 1 intervention
// datée aujourd'hui pour l'agent de test.
import { test, expect } from '@playwright/test'
import { ensureFixtures, nettoyerContrat } from './support/fixtures'
import { adminClient } from './support/admin'
import { login } from './support/auth'
import { E2E_AGENT_PASSWORD } from './support/env'

// 1x1 PNG transparent — suffisant pour satisfaire "au moins une photo" sans
// dépendre d'un fichier binaire versionné dans le repo.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const TOUS_LES_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

test.describe.serial('Parcours agent — scan → validation des tâches → rapport', () => {
  let residenceId: string
  let residenceQrToken: string
  let agentAEmail: string
  let contratId: string | null = null
  let interventionId: string

  test.beforeAll(async () => {
    const fx = await ensureFixtures()
    residenceId = fx.residenceId
    residenceQrToken = fx.residenceQrToken
    agentAEmail = fx.agentAEmail

    const admin = adminClient()
    const todayIso = new Date().toISOString().slice(0, 10) // best-effort — le mode ?test=1 couvre ±3 jours, aucune précision fuseau requise ici

    const { data: rpcResult, error: rpcErr } = await admin.rpc('creer_contrat_complet', {
      p_residence_id: residenceId,
      p_contrat: {
        libelle: 'E2E agent-flow', type_contrat: 'parties_communes',
        date_debut: todayIso, date_fin: '2027-12-31',
        montant_mensuel: null, nb_interventions_mois: null,
        taux_horaire_facturation: null, agent_prefere_id: fx.agentAId,
        creneaux_acceptes: [{ jours: TOUS_LES_JOURS, heure_debut: '08:00', heure_fin: '18:00' }],
        jours_interdits: [], notes_specifiques: null,
        minutes_hebdo_reelles: 60, ecart_rentable_minutes: 0,
      },
      p_structure: {
        batiments: [{
          nom: 'Bâtiment principal',
          zones: [{
            nom: 'Hall test',
            taches: [
              // jours_semaine = tous les jours : évite toute dépendance au
              // fuseau horaire du runner CI pour que la tâche soit reprise
              // par le scan quel que soit le jour réel d'exécution.
              { libelle: 'Dépoussiérage test', frequence_type: 'hebdo', jours_semaine: TOUS_LES_JOURS, semaine_du_mois: null, mois_de_annee: null },
            ],
          }],
        }],
      },
    })
    if (rpcErr) throw new Error(`Échec seed contrat agent-flow : ${rpcErr.message}`)
    contratId = (rpcResult as { contrat_id: string }).contrat_id

    const { data: intervention, error: interErr } = await admin.from('interventions').insert({
      agent_id: fx.agentAId, residence_id: residenceId, contrat_id: contratId,
      date_prevue: todayIso, heure_debut_prevue: '08:00', heure_fin_prevue: '09:00',
      statut: 'planifiee', batiment: null,
    }).select('id').single()
    if (interErr || !intervention) throw new Error(`Échec seed intervention agent-flow : ${interErr?.message}`)
    interventionId = intervention.id
  })

  test.afterAll(async () => {
    if (contratId) await nettoyerContrat(contratId)
  })

  test('login agent → scan → valider la zone → rapport final', async ({ page, context }) => {
    // Géoloc simulée sur les coordonnées de la résidence de test (fixtures.ts)
    // — évite l'attente réelle du GPS et toute alerte hors_zone parasite.
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 43.6108, longitude: 3.8767 })

    await login(page, agentAEmail, E2E_AGENT_PASSWORD(), '/agent/dashboard')

    // Mode test documenté (app/agent/scan/page.tsx) : bypasse la caméra,
    // résout l'intervention par contrat/agent sur une fenêtre J-3/J+3.
    await page.goto(`/agent/scan?token=${residenceQrToken}&test=1`)
    await page.waitForURL(new RegExp(`/agent/intervention/${interventionId}`), { timeout: 20_000 })

    // ── Zone unique : valider les tâches + photo obligatoire ──
    await expect(page.getByText('Hall test')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '✓ Valider la zone' }).click()

    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles({ name: 'photo-e2e.png', mimeType: 'image/png', buffer: PIXEL_PNG })
    await expect(page.getByText('Zone validée')).toBeVisible({ timeout: 15_000 })

    // ── Finalisation (mono-bâtiment → bouton direct sur cette page) ──
    await page.getByRole('button', { name: '✅ Valider le rapport final' }).click()
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await page.waitForURL(/\/controle-final$/, { timeout: 15_000 })

    // ── Rapport : rien à signaler (aucun produit/ampoule sélectionné) ──
    await page.getByRole('button', { name: /Rien à signaler|Envoyer le rapport/ }).click()
    await page.waitForURL('**/agent/dashboard', { timeout: 20_000 })

    // ── Vérification (point 1 de la demande) : intervention "Validé" ──
    const admin = adminClient()
    const { data: interFinale } = await admin.from('interventions').select('statut').eq('id', interventionId).single()
    expect(interFinale?.statut).toBe('terminee')
  })
})
