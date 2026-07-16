// Vérification du calcul de prorata pondéré (docs/CONCEPTION_BATIMENTS.md §4.2).
// Reproduit l'exemple de la spec et échoue (exit 1) si le calcul dévie.
//
// Ce fichier n'est PAS importé par l'app (aucun effet au build). Pour l'exécuter :
//   npx tsc lib/prorata.ts lib/prorata.check.ts --outDir .prorata-tmp \
//     --module commonjs --target es2020 --esModuleInterop --skipLibCheck
//   node .prorata-tmp/lib/prorata.check.js

import { computeProrataZones, type ProrataZoneInput } from './prorata'

// Exemple §4.2 : volume 4 h/semaine (240 min), containers coef 0,5.
//   Hall ×2/sem (coef 1) · Paliers ×1 (coef 1) · Poubelles ×1 (coef 1) · Containers ×3 (coef 0,5)
//   Σ poids = 2 + 1 + 1 + 1,5 = 5,5  →  240 / 5,5 ≈ 43,6 min / unité de poids
//   attendu : Hall ≈ 44 min/passage, Container ≈ 22 min/passage.
const t = (jours: string[]) => ({ frequence_type: 'hebdo', jours_semaine: jours })

const zones: ProrataZoneInput[] = [
  { id: 'hall',       coefDuree: 1,   taches: [t(['lundi']), t(['jeudi'])] },                 // 2 passages
  { id: 'paliers',    coefDuree: 1,   taches: [t(['lundi'])] },                               // 1 passage
  { id: 'poubelles',  coefDuree: 1,   taches: [t(['mardi'])] },                               // 1 passage
  { id: 'containers', coefDuree: 0.5, taches: [t(['lundi']), t(['mercredi']), t(['vendredi'])] }, // 3 passages
]

const VOLUME_MIN = 4 * 60 // 240
const res = computeProrataZones(VOLUME_MIN, zones)
const by = (id: string) => res.find(r => r.zoneId === id)!

let ok = true
function check(label: string, actual: number, expected: number, tol = 0.5) {
  const pass = Math.abs(actual - expected) <= tol
  ok = ok && pass
  console.log(`${pass ? '✓' : '✗'} ${label}: ${actual.toFixed(2)} (attendu ≈ ${expected})`)
}

// Poids
check('poids hall',        by('hall').poids,        2)
check('poids paliers',     by('paliers').poids,     1)
check('poids poubelles',   by('poubelles').poids,   1)
check('poids containers',  by('containers').poids,  1.5)

// nb passages
check('passages hall',       by('hall').nbPassages,       2)
check('passages containers', by('containers').nbPassages, 3)

// Durée d'un passage (le cœur de l'exemple)
check('hall — durée/passage',      Math.round(by('hall').dureePassageMin),      44)
check('container — durée/passage', Math.round(by('containers').dureePassageMin), 22)

// Le volume total doit être intégralement réparti sur la semaine (Σ durées hebdo = volume)
const totalHebdo = res.reduce((s, r) => s + r.dureeHebdoMin, 0)
check('Σ durées hebdo = volume', totalHebdo, VOLUME_MIN, 0.1)

// Repli : prorata simple si tous les coefs à 1
const zonesSimple: ProrataZoneInput[] = [
  { id: 'a', coefDuree: 1, taches: [t(['lundi'])] },
  { id: 'b', coefDuree: 1, taches: [t(['lundi'])] },
]
const resSimple = computeProrataZones(120, zonesSimple)
check('prorata simple a', resSimple[0].dureePassageMin, 60)
check('prorata simple b', resSimple[1].dureePassageMin, 60)

console.log(ok ? '\nTOUS LES CHECKS PASSENT ✓' : '\nÉCHEC ✗')
if (!ok) process.exit(1)
