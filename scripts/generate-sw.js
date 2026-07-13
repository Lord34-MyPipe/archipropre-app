/* eslint-disable */
// Génère public/sw.js avec un CACHE_VERSION unique injecté au build.
// Lancé automatiquement via les hooks npm `predev` et `prebuild` (voir package.json).
//
// Objectif : après chaque déploiement Vercel, le contenu du SW change (nouveau
// CACHE_VERSION) → le navigateur détecte un nouveau service worker → skipWaiting +
// clients.claim l'activent immédiatement → controllerchange côté client → reload.
// Les PWA installées sur les iPhones des agents récupèrent le nouveau code SANS
// désinstaller/réinstaller.
//
// Vérifier la propagation après un déploiement :
//   DevTools → Application → Service Workers → colonne "Source" (nouvelle date) ;
//   la valeur CACHE_VERSION en tête de public/sw.js doit correspondre au déploiement.

const fs = require('fs')
const path = require('path')

// Priorité aux identifiants de déploiement Vercel (stables par déploiement),
// fallback timestamp en local.
const CACHE_VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  `local-${Date.now()}`

const swContent = `// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.
// Généré par scripts/generate-sw.js via les hooks predev/prebuild.
// Regénéré à chaque build avec un CACHE_VERSION unique par déploiement.

const CACHE_VERSION = '${CACHE_VERSION}'
const CACHE_NAME = 'archipropre-' + CACHE_VERSION

self.addEventListener('install', () => {
  // Activation immédiate sans attendre la fermeture des anciens onglets.
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Purge des anciens caches (versions précédentes).
      const keys = await caches.keys()
      await Promise.all(
        keys.filter(k => k.startsWith('archipropre-') && k !== CACHE_NAME).map(k => caches.delete(k))
      )
      // Prise de contrôle immédiate de tous les clients ouverts.
      await self.clients.claim()
    })()
  )
})

// Réseau prioritaire — pas de cache offline pour ce MVP.
// Le rôle de ce SW est le versioning automatique (skipWaiting + clients.claim).
self.addEventListener('fetch', () => {})
`

const outPath = path.join(__dirname, '..', 'public', 'sw.js')
fs.writeFileSync(outPath, swContent, 'utf8')
console.log('[generate-sw] public/sw.js généré — CACHE_VERSION=' + CACHE_VERSION)
