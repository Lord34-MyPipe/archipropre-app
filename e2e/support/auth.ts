import { type Page } from '@playwright/test'

// Sélecteurs par placeholder — la page /login (app/login/page.tsx) n'associe
// pas ses <label> aux <input> (pas de for/id ni de name), getByLabel ne
// fonctionne donc pas ici.
export async function login(page: Page, email: string, password: string, waitForUrlPart: string) {
  await page.goto('/login')
  await page.getByPlaceholder('votre identifiant ou email').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL(new RegExp(waitForUrlPart), { timeout: 15_000 })
}
