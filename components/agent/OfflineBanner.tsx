'use client'

import { useEffect, useState } from 'react'

// Bandeau « Pas de réseau » affiché globalement quand la connexion tombe.
// Utilise navigator.onLine + les événements online/offline.
// Se monte dans le layout agent (toujours visible au-dessus du contenu).
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    // Vérifier l'état initial (utile si le composant se monte après une perte)
    setOffline(!navigator.onLine)

    const handleOffline = () => setOffline(true)
    const handleOnline  = () => setOffline(false)

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online',  handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online',  handleOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-600 text-white text-center py-2 px-4 text-sm font-semibold shadow-lg">
      📡 Pas de réseau — les actions nécessitent une connexion
    </div>
  )
}
