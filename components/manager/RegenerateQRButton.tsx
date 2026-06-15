'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  residenceId: string
  residenceNom: string
  onRegenerated: (newToken: string) => void
}

export default function RegenerateQRButton({ residenceId, residenceNom, onRegenerated }: Props) {
  const [step, setStep]       = useState<'idle' | 'confirm' | 'loading'>('idle')
  const [error, setError]     = useState('')

  async function handleConfirm() {
    setStep('loading')
    setError('')
    try {
      const supabase = createClient()
      const { data, error: rpcError } = await supabase
        .rpc('regenerate_qr_token', { p_residence_id: residenceId })

      if (rpcError) throw rpcError
      onRegenerated(data as string)
      setStep('idle')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setStep('confirm')
    }
  }

  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('confirm')}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-lg hover:bg-red-100 active:scale-95 transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/>
        </svg>
        Régénérer QR
      </button>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/>
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-800">Régénérer le QR code ?</h2>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed mb-2">
            <strong className="text-slate-800">{residenceNom}</strong>
          </p>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">
            ⚠️ Régénérer le QR code invalidera l'ancien immédiatement. Vous devrez{' '}
            <strong>imprimer et remplacer le QR code physique</strong> affiché à l'entrée
            de cette résidence avant la prochaine intervention.
          </p>

          {error && (
            <p className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setStep('idle'); setError('') }}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Oui, régénérer
            </button>
          </div>
        </div>
      </div>
    )
  }

  // loading
  return (
    <button disabled
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-400 border border-red-200 text-xs font-semibold rounded-lg opacity-60">
      <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin"/>
      Régénération…
    </button>
  )
}
