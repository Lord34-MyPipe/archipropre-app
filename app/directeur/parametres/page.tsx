'use client'

import { useState, useEffect } from 'react'

export default function DirecteurParametres() {
  const [taux,   setTaux]   = useState('22')
  const [km,     setKm]     = useState('0.45')
  const [frais,  setFrais]  = useState('0')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState('')

  useEffect(() => {
    fetch('/api/directeur/parametres')
      .then(r => r.json())
      .then(({ data }) => {
        if (data) {
          setTaux(String(data.taux_horaire_agent ?? 22))
          setKm(String(data.cout_km ?? 0.45))
          setFrais(String(data.frais_generaux_mois ?? 0))
        }
      })
  }, [])

  async function handleSave() {
    setSaving(true); setSaved(false); setError('')
    const res = await fetch('/api/directeur/parametres', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tauxHoraireAgent:  parseFloat(taux)  || 22,
        coutKm:            parseFloat(km)    || 0.45,
        fraisGenerauxMois: parseFloat(frais) || 0,
      }),
    })
    setSaving(false)
    if (res.ok) setSaved(true)
    else setError('Erreur lors de la sauvegarde')
  }

  const Field = ({ label, value, onChange, unit, help }: {
    label: string; value: string; onChange: (v: string) => void
    unit: string; help?: string
  }) => (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <label className="block text-sm font-semibold text-slate-700 mb-1">{label}</label>
      {help && <p className="text-xs text-slate-400 mb-3">{help}</p>}
      <div className="flex items-center gap-2">
        <input
          type="number" min="0" step="0.01" value={value}
          onChange={e => { onChange(e.target.value); setSaved(false) }}
          className="w-40 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0BBFBF]"
        />
        <span className="text-slate-500 text-sm font-medium">{unit}</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-[#0A2E5A] text-white px-8 py-8">
        <h1 className="text-2xl font-bold">Paramètres société</h1>
        <p className="text-blue-300 text-sm mt-1">Coûts de production utilisés pour le calcul de rentabilité</p>
      </div>

      <div className="px-8 py-8 max-w-2xl space-y-4">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Coûts de production</h2>

        <Field
          label="Coût horaire moyen d'un agent (salaire + charges + équipements)"
          value={taux} onChange={setTaux} unit="€/h"
          help="Inclut salaire brut, charges patronales (~42%), produits, équipements"
        />
        <Field
          label="Coût kilométrique moyen"
          value={km} onChange={setKm} unit="€/km"
        />
        <Field
          label="Quote-part frais généraux (bureaux, admin, logiciels...)"
          value={frais} onChange={setFrais} unit="€/mois"
        />

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        <button
          onClick={handleSave} disabled={saving}
          className="w-full py-3.5 rounded-xl text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg,#0A2E5A,#1A5FA8)' }}
        >
          {saving ? (
            <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/> Enregistrement…</>
          ) : saved ? (
            '✓ Paramètres enregistrés'
          ) : (
            'Enregistrer'
          )}
        </button>

        {saved && (
          <p className="text-xs text-center text-slate-400">
            Ces paramètres seront utilisés dans le calcul de rentabilité de toutes les résidences.
          </p>
        )}
      </div>
    </div>
  )
}
