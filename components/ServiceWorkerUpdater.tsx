'use client'

import { useEffect, useState } from 'react'

// Enregistre le SW /sw.js (généré au build par scripts/generate-sw.js, CACHE_VERSION
// unique par déploiement). Sur controllerchange (nouveau SW actif via skipWaiting) :
//   - auto-reload si aucun champ de saisie n'est actif
//   - toast "Mettre à jour" sinon pour ne pas perdre une saisie en cours
export default function ServiceWorkerUpdater() {
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV === 'development') return

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})

    const handleControllerChange = () => {
      const el = document.activeElement
      const isTyping =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)

      if (isTyping) {
        setShowToast(true)
      } else {
        window.location.reload()
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  if (!showToast) return null

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#0A2E5A] text-white px-4 py-3 rounded-2xl shadow-lg whitespace-nowrap">
      <span className="text-sm">Nouvelle version disponible</span>
      <button
        onClick={() => window.location.reload()}
        className="text-xs font-semibold bg-white text-[#0A2E5A] px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
      >
        Mettre à jour
      </button>
    </div>
  )
}
