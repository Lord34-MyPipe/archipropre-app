# Conception — Niveau Bâtiment, Template standard & Durée au prorata

> Document de conception validé avec Julien (16/07/2026).
> À déposer dans `/docs/`. Sert de référence pour l'implémentation par Claude Code.
> Ne rien coder sans se référer à ce document. Découpage en étapes en fin de fichier.

---

## 1. Contexte & décision

~30 % des résidences Archipropre ont **plusieurs bâtiments** (ex. RÉSIDENCE PRIEURE II :
9 bâtiments, 99 lots). Il faut pouvoir organiser les zones par bâtiment, sans alourdir
la saisie ni casser le modèle existant.

**Décision de modèle (validée) :** le bâtiment n'est PAS une nouvelle table. C'est un
**champ texte (étiquette) sur la zone**. Justification :
- 1 seul QR code par résidence (contrainte forte) → le bâtiment ne sépare pas le scan.
- Pas de facturation par bâtiment (contrat commercial unique par résidence).
- Le bâtiment n'a aucune logique propre : il ne fait que **regrouper visuellement** des zones.
- Le « quand » (fréquence + jours) reste sur la TÂCHE, comme aujourd'hui.

**Hiérarchie finale :**

```
Résidence → Contrat → [Bâtiment = étiquette] → Zone → Tâche
```

**Migration :** AUCUNE. Base vierge (ALTHEA remise à zéro, rien créé avec Ana).
Le champ bâtiment est nullable ; une résidence mono-bâtiment a le champ vide et
s'affiche exactement comme aujourd'hui (aucun en-tête bâtiment).

---

## 2. Modèle de données

### 2.1 Nouveau champ
- `zones_residence.batiment` : `TEXT NULL`. Étiquette libre ("Bât A", "Bât B", …).
  Vide/NULL = résidence ou contrat mono-bâtiment (affichage inchangé).

Migration additive, non destructive : `ALTER TABLE zones_residence ADD COLUMN batiment TEXT;`

### 2.2 Ce qui NE change PAS
- `contrats_residences` : inchangé. Le contrat reste unique par résidence, porte le
  montant global, le taux, les créneaux, l'agent, le QR token.
- `taches_template` : inchangé. La fréquence (`frequence_type`) et les jours
  (`jours_semaine`) restent sur la tâche. C'est là que vit le « quand ».
- Le scan, le QR (1 par résidence via le contrat), la facturation, la rentabilité.

---

## 3. Template standard (copropriété)

Objectif : instancier un bâtiment complet en 1 clic, au lieu de saisir 30 tâches à la main.

### 3.1 Contenu du template
**6 zones**, chacune contenant les **5 tâches** ci-dessous :
1. Hall entrée / Ascenseur
2. Palier
3. Escalier de service
4. SAS / Accès sous-sol
5. Garage
6. Extérieur

**5 tâches par zone** (ordre = protocole des 5 doigts, du haut vers le bas / du propre
vers le sale — cohérent avec les règles métier existantes) :
1. Toiles d'araignées
2. Dépoussiérage
3. Vitres / traces
4. Poubelle / Prospectus
5. Sol

Chaque zone du template porte aussi un **coefficient de durée** (voir section 4.2) :
zones normales = `1`, containers/poubelles = `0,5`. Invisible pour l'utilisateur,
sert au prorata pondéré.

### 3.2 Où stocker le template
Un seul template pour l'instant ("résidence / copropriété"). Prévoir l'architecture
pour en ajouter d'autres plus tard (tertiaire, cabinet médical…) SANS refonte.
→ Stocker le template en **constante côté code** (ex. `lib/templates/copropriete.ts`)
exposant la liste zones→tâches. Un futur template = un nouveau fichier + une entrée
dans un registre. Ne PAS créer de table `templates` maintenant (sur-ingénierie).

### 3.3 Instanciation
Bouton **« Ajouter un bâtiment standard »** dans l'écran zones/tâches d'un contrat :
1. Ana saisit le **nom du bâtiment** ("Bât A") et **le(s) jour(s)** par défaut ("lundi").
2. Le système crée les 6 zones (avec `batiment` = "Bât A") et leurs 5 tâches chacune,
   toutes avec `jours_semaine` = jour(s) choisi(s) et fréquence par défaut (hebdo).
3. Ana ajuste ensuite : retirer une zone absente (pas de garage), ajouter un jour à une
   zone (hall aussi le vendredi), changer une fréquence (caves = 2×/mois), etc.

Tout reste modifiable : ajouter/supprimer zones et tâches, créer hors template.

### 3.4 Attribution des jours « d'un coup », modifiable ensuite
- À l'instanciation, le jour choisi s'applique aux 30 tâches du bâtiment.
- Ensuite, modification possible **par zone ou par tâche** (ex. ajouter "vendredi" aux
  tâches du Hall → hall fait lundi ET vendredi).
- Prévoir une action groupée pratique : « appliquer ce(s) jour(s) à toutes les tâches
  d'une zone / d'un bâtiment » pour éviter le clic-à-clic.

---

## 4. Durée — prorata simple

### 4.1 Principe
On NE saisit PAS de durée par tâche au démarrage (philosophie : vite d'abord, affiner
avec les temps réels remontés par les scans).

**Volume horaire total** = déjà connu du système : `heures_vendues = montant_mensuel ÷
taux_horaire_facturation` (formule existante, bloc « heures vendues » du modal contrat).
Ana ne saisit donc RIEN de plus pour la durée — elle vient du montant.

### 4.2 Répartition (prorata PONDÉRÉ par coefficient de zone)
Le volume horaire hebdomadaire est réparti entre tous les passages-zones de la semaine,
**pondéré par un coefficient de durée propre à chaque type de zone**. Un « passage-zone »
= une occurrence d'une zone à une date donnée selon sa fréquence.

**Pourquoi pondéré et pas égal :** certaines zones prennent structurellement beaucoup
moins de temps (ex. gestion des containers = sortir/rentrer les poubelles) qu'un
nettoyage complet de hall. Un prorata à parts égales fausserait le calcul de charge dès
le départ, sur presque toutes les résidences avec containers. Le coefficient corrige ce
biais sans saisie supplémentaire pour l'utilisateur (valeurs pré-remplies dans le template).

**Coefficients par défaut (dans le template, section 3) :**
- Zone normale (Hall, Palier, Escalier, SAS, Garage, Extérieur) : `1`
- Containers / gestion poubelles : `0,5` (compte pour la moitié d'une zone normale)
- (Autres coefficients ajoutables plus tard si un type de zone se révèle atypique.)

**Formule :** `durée d'un passage-zone = volume_horaire × (coef_zone / Σ(coef × nb_passages))`

Exemple (1 bâtiment, volume 4 h/semaine, containers à coef 0,5) :
- Hall ×2/sem, coef 1 → poids 2
- Paliers ×1/sem, coef 1 → poids 1
- Poubelles ×1/sem, coef 1 → poids 1
- Containers ×3/sem, coef 0,5 → poids 1,5
- Σ poids = 5,5 → 4 h ÷ 5,5 = ~44 min pour une unité de poids.
  Hall = 44 min/passage, container = 22 min/passage.

Coefficients tous à `1` = prorata simple (comportement de repli).
La durée sert au calcul de charge et à l'enchaînement du planning, PAS à l'agent (il ne
voit pas la durée impartie par tâche — il voit seulement la durée totale de son chantier).

### 4.3 Affinage futur (hors périmètre immédiat)
Quand les temps réels seront remontés (scans → temps par zone), remplacer le prorata par
des durées réelles par zone. Prévoir que le système accepte une **durée par zone** si
elle est renseignée, et retombe sur le prorata sinon. Ne pas coder l'affinage maintenant,
juste ne pas fermer la porte.

---

## 5. Génération de planning — enchaînement des bâtiments

### 5.1 Horaires : d'où viennent-ils
Les créneaux viennent du **contrat** (`creneaux_acceptes`) = fenêtre autorisée par le
client (ex. PRIEURE : Lun-Sam 08:00–20:00). Ce n'est pas une heure imposée mais une plage.

### 5.2 Enchaînement (validé)
Sur une résidence à plusieurs bâtiments le **même jour**, le système **enchaîne** les
bâtiments dans la fenêtre du créneau, au lieu de les empiler à la même heure :
- Bât A : début = heure d'ouverture du créneau (ex. 08:00), durée = somme des durées de
  ses zones ce jour-là.
- Bât B : début = fin de Bât A (+ trajet inter-bâtiments si applicable — réutiliser la
  mécanique de trajet inter-chantiers OSRM existante ; sur une même résidence le trajet
  est souvent nul ou négligeable).
- etc.

Le regroupement pour l'enchaînement se fait par `batiment` sur les zones du contrat.
Les zones sans étiquette (mono-bâtiment) forment un seul bloc = comportement actuel.

### 5.3 Points d'attention
- Vérifier que l'enchaînement respecte la borne haute du créneau (ne pas dépasser 20:00).
  Si ça déborde, signaler (alerte / warning), ne pas planter.
- Le total journalier par agent alimente la charge (v_charge_agent) comme aujourd'hui.

---

## 6. Saisonnier — HORS PÉRIMÈTRE (noté pour mémoire)

Certains contrats ont des prestations saisonnières (ex. PRIEURE extérieurs : 2×/mois
sept-déc, 1×/mois déc-sept). **On ne l'implémente PAS maintenant.** On lisse sur l'année.

Repli déjà disponible si besoin : créer deux contrats datés (multi-contrats P2-11 avec
`date_debut`/`date_fin`) — « Contrat Hiver » et « Contrat Été ». Zéro développement.
À garder en tête, ne pas concevoir de mécanisme saisonnier dédié pour l'instant.

---

## 7. Écrans impactés

1. **Formulaire zone** (création/édition) : ajouter le champ `batiment`
   (texte libre + autocomplétion des bâtiments déjà saisis sur le contrat).
2. **Écran zones/tâches du contrat** (config manager) :
   - Regroupement visuel des zones par bâtiment (en-tête « Bât A » puis ses zones).
   - Bouton « Ajouter un bâtiment standard » (nom + jours → instancie le template).
   - Action groupée « appliquer jour(s) à tout le bâtiment ».
   - Mono-bâtiment (aucune étiquette) = affichage plat actuel, sans en-tête.
3. **Parcours agent après scan** : zones regroupées par bâtiment (en-têtes), ordre libre.
   Mono-bâtiment = affichage actuel inchangé.
4. **Génération de planning** : enchaînement des bâtiments (section 5).

---

## 8. Découpage en étapes pour Claude Code

Ordre imposé. 1 commit par étape, `npm run build` avant chaque commit, push immédiat,
confirmer le hash. Ne pas mélanger les étapes.

- **Étape 1 — Schéma.** Migration additive `zones_residence.batiment TEXT NULL`.
  Versionner le fichier de migration. Vérifier qu'aucun flux existant ne casse
  (champ nullable, rien ne le lit encore).

- **Étape 2 — Template en code.** `lib/templates/copropriete.ts` : structure zones→tâches
  (6×5), + registre extensible pour futurs templates. Aucune UI encore.

- **Étape 3 — Champ bâtiment dans le formulaire zone.** Saisie + autocomplétion des
  bâtiments existants du contrat. La zone créée porte son étiquette `batiment`.

- **Étape 4 — Regroupement par bâtiment (affichage config manager).** En-têtes bâtiment
  dans l'écran zones/tâches. Mono-bâtiment = affichage plat inchangé.

- **Étape 5 — Bouton « Ajouter un bâtiment standard ».** Nom + jours → instancie le
  template (6 zones × 5 tâches, étiquette + jours appliqués). Réutilise la route de
  création de zones/tâches existante ; ne pas réécrire.

- **Étape 6 — Action groupée jours.** « Appliquer jour(s) à toutes les tâches d'un
  bâtiment / d'une zone ».

- **Étape 7 — Durée au prorata pondéré.** Calcul serveur : volume horaire réparti selon
  les coefficients de zone (section 4.2). Coefficients pré-remplis dans le template
  (normale 1, containers 0,5). Utilisé par la charge et le planning. Accepter une durée
  par zone si renseignée (porte ouverte à l'affinage), prorata pondéré sinon.
  Tous coefs à 1 = prorata simple.

- **Étape 8 — Enchaînement planning.** Génération : regrouper par bâtiment, enchaîner
  dans la fenêtre du créneau (début Bât N+1 = fin Bât N + trajet). Respecter la borne
  haute du créneau, warning si dépassement. Mono-bâtiment = comportement actuel.

- **Étape 9 — Affichage agent groupé.** Zones regroupées par bâtiment après scan,
  ordre libre. Mono-bâtiment inchangé.

Après chaque étape : test visuel sur une résidence témoin (créée puis supprimée, aucun
client réel touché), comme pour le fix contrat placeholder.

---

## 9. Ce qui reste hors de ce document (dette / plus tard)
- Saisonnier dédié (repli multi-contrats datés en attendant).
- Durées réelles par zone (affinage post temps-réels).
- Templates additionnels (tertiaire, cabinet médical…).
- Pondération manuelle des durées (approche 2, si le prorata simple s'avère trop grossier).
