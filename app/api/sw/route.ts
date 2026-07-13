import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// VERCEL_DEPLOYMENT_ID est injecté automatiquement par Vercel sur chaque déploiement.
// En local, l'env NODE_ENV sert de fallback (pas de SW en dev dans ServiceWorkerUpdater).
// Résultat : le contenu du SW change à chaque déploiement → le navigateur détecte un nouveau SW.
const DEPLOY_VERSION = process.env.VERCEL_DEPLOYMENT_ID ?? `dev-${process.env.NODE_ENV}`

const SW_SCRIPT = `
// Archipropre Service Worker — version: ${DEPLOY_VERSION}
// Regénéré à chaque déploiement via VERCEL_DEPLOYMENT_ID.
//
// Pour vérifier la propagation après un déploiement :
//   DevTools → Application → Service Workers → colonne "Source" (doit afficher la nouvelle date).
//   Ou cliquer "Update" dans l'onglet Service Workers puis recharger la page.

const DEPLOY_VERSION = '${DEPLOY_VERSION}'

self.addEventListener('install', () => {
  // Activation immédiate sans attendre la fermeture des anciens onglets.
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  // Prendre le contrôle de tous les clients ouverts immédiatement.
  event.waitUntil(clients.claim())
})

// Réseau prioritaire — pas de mise en cache offline pour ce MVP.
// Le rôle de ce SW est uniquement le versioning automatique (skipWaiting + clients.claim).
self.addEventListener('fetch', () => {
  // Laisser le navigateur gérer les requêtes normalement.
})
`.trim()

export async function GET() {
  return new NextResponse(SW_SCRIPT, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      // Autorise un scope / même si le script est servi depuis /api/sw
      'Service-Worker-Allowed': '/',
      // Pas de cache HTTP : le navigateur doit re-vérifier à chaque visite
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
