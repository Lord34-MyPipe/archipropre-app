# ⚡ ÉTAT ACTUEL DU PROJET (mis à jour 17 juillet 2026 — chantier "niveau bâtiment" terminé fonctionnellement)

**CHANTIER "NIVEAU BÂTIMENT" TERMINÉ (fonctionnellement).** Modèle final :
Résidence → Contrat → [Bâtiment = étiquette texte sur zone] → Zone → Tâche.
Spec de référence : `docs/CONCEPTION_BATIMENTS.md` (déposé dans le repo).
**PRIEURE = résidence de référence multi-bâtiments** (9 bâtiments, 54 zones,
270 tâches, compteur 100% = 19h59/19h59) — **NE PAS SUPPRIMER**, config réelle
définitive. Détail complet (décisions de modèle, migrations, commits, parcours
agent, bug reconstruction + fix) : voir section « CHANTIER BÂTIMENTS — ÉTAPES
LIVRÉES » plus bas.

**RESTE À FAIRE avant config avec Ana :**
1. Test terrain complet d'une mission NEUVE sur iPhone (scan PRIEURE un jour où
   le planning est frais/`planifiee`, valider plusieurs bâtiments, envoyer le
   rapport, vérifier côté manager). Les validations « en base » de Claude Code
   ne suffisent pas pour ce parcours intégré — le bug de reconstruction (voir
   section dédiée plus bas) n'est sorti qu'au test iPhone réel.
2. Régénérer les plannings des résidences configurées AVANT le fix date
   `ff7d43e` (dates potentiellement décalées d'un jour).
3. Reprendre la config des 156 autres résidences avec Ana (utiliser « Ajouter
   un bâtiment standard » pour les multi-bâtiments).

**FIX MAJEUR post-audit (commit `bf6e47a`) :** le test terrain iPhone (item 1
ci-dessus) a révélé un bug de double comptage du temps journée agent en
multi-bâtiments (impact direct PAIE/RH) — **CORRIGÉ**. Voir section « FIX
MAJEUR : double comptage temps journée agent » plus bas.

**NOUVEAU CHANTIER LIVRÉ : RAPPORT SYNDIC (P3-2)**, complet de bout en bout
(S1→S5) — premier morceau de la Phase 3 (espace/rapport client), différenciateur
commercial face à Organilogue. Voir section « RAPPORT SYNDIC (P3-2) — LIVRÉ »
plus bas pour le détail complet.

**RESTE À FAIRE (rapport syndic) :**
1. Test terrain réel par Julien (génération d'un lien depuis l'UI manager,
   ouverture en navigation privée, révocation) — les vérifications faites par
   Claude Code sont en navigateur réel mais via serveur dev local, pas encore
   confirmées par Julien sur la prod archipropre-app.vercel.app.
2. P3-1 (rôle client à part entière) reste à faire — S5 en est l'embryon
   technique (page publique par token) mais pas encore un vrai rôle/compte.

Avant (15 juillet 2026) : **MVP JUILLET 2026 : développement TERMINÉ, testé, sécurisé.** Toutes les
fonctions du périmètre MVP sont fonctionnelles et **vérifiées en live** (audit
pré-vol navigation des 3 rôles, 15/07). Périmètre agent (scan → zones/photos →
rapport), planning agent 2 semaines, création manuelle d'intervention manager
(rebranchée), alertes (scan hors-zone >200 m + retard scan 15 min + hors planning),
temps de travail réel (1er scan → dernier rapport). Comptes désactivés bloqués à la
connexion. Base propre : **157 résidences réelles (les vrais clients Archipropre),
0 intervention réelle.**

**Le chemin critique n'est plus le code, mais la donnée et le terrain. Prochaine étape :**
1. **Passer Supabase en Pro** (backups quotidiens + fin des pauses auto Free).
2. **Test agent complet** en conditions réelles avec Christian.
3. **Config** paramètres société → agents → résidences avec Ana, via le wizard
   (voir « Ordre de configuration »).

Tag `pre-mvp-juillet2026`. Feature flags actifs (hors-MVP masqué, non supprimé —
réactivation = flag true + push). Service Worker versionné (public/sw.js généré au
build). LOT 2 (liste résidences en tableau dense) + LOT 3 (wizard config + page
contrat à onglets + fil d'Ariane) + 6 correctifs pré-lancement livrés.
Bandeau/formule financière masqués par `FEATURES.rentabilite`. Voir section
[MVP JUILLET 2026](#mvp-juillet-2026) et « Session corrections pré-lancement » pour le détail.

⚠️ **Dette découverte :** `interventions_planifiees` n'est PAS morte (validation
planning directeur écrit encore dedans) — NE PAS la supprimer (voir dette dédiée).

Avant (15 juillet 2026, matin) : **MVP livré & sécurisé.** Base nettoyée
(157 résidences, 0 intervention). LOT 2 + LOT 3 livrés.

Avant (14 juillet 2026) : **MVP JUILLET 2026 en prod. Feature flags actifs.**
Alerte retard scan à 15 min. Planning agent étendu semaine courante + suivante.
Service Worker versionné.

Avant (28 juin 2026) : **BLOC B ENTIÈREMENT TERMINÉ. P2-9 livré. Nouvelles features commande produits
+ catalogue + contrôle final agent livrés.**

Backend migré (migrations 015→023 appliquées en prod).
Modèle Résidence → Contrat → Zone → Tâche. 162 contrats.

Derniers commits de la session (28 juin 2026) :
- 6655b21 : Migration 022 + contrôle final agent (chariot + commande produits)
- 05baddb : Catalogue produits interface directeur /directeur/catalogue
- 6879ed0 : Fix flow controle-final (redirect /agent/dashboard + route rapport)
- 4f43c63 : Fix déclencheur controle-final (peutFinaliser ≥1 zone complète)
- 05eade7 : Fix navigation bloquée await mobile (handleFinaliser synchrone)
- f6f4172 : Migration 023 passages_siege + bloc réappro dashboard + P2-9 agent
- 5809da0 : Position bloc commandes + drawer détail + PDF préparation

UI multi-contrats — avancement B1→B6 :
- B1 ✅ LIVRÉ : API GET /api/residences/[id]/contrats
- B2 ✅ LIVRÉ : cartes contrats lecture seule (commit 4ce7340)
- B2.5 ✅ LIVRÉ : accès fiche détail depuis liste résidences (commit 5fc388a)
- B3 ✅ LIVRÉ : "+ Ajouter un contrat" (commit 681e209)
- B4 ✅ LIVRÉ : GestionContratModal par-contrat (commits 9823cd3 + 8b7601b)
- B4.5 ✅ LIVRÉ : parcours contrat unifié + ancien bouton débranché (commit 5b292ff)
- B5 ✅ LIVRÉ : KPI bande en-tête résidence CA/Coût/Marge/Perte cachée (commit 077089b)
- B5.5 ✅ LIVRÉ : contrat_id écrit à la génération (migration 019 + commit 966d229)
- B6a ✅ LIVRÉ : QR par contrat — manager PDF + agent scan token→contrat (commit fb80809+)
- B6b ✅ LIVRÉ : rapports par contrat — filtre ?contratId= + libellé par ligne (commits e35bc9a+)
- B6c ✅ LIVRÉ : rentabilité 2 niveaux — globale + par contrat (commits f9b03e6+)
- B6d ✅ LIVRÉ : tâches PAR CONTRAT (commit cbacbaa)
- B6e ✅ LIVRÉ : planning PAR CONTRAT (migration 020 + commits 2b0852f+)
- P2-9 ✅ LIVRÉ : passages siège + bloc réappro + IA suggestion (commits f6f4172 + 5809da0)

Cobaye de test : ALTHEA (6537baf8-05ae-493e-9b3a-d404fa190a94).
État actuel : 2 contrats parties_communes actifs —
  "Bat A" (ec5f0a9a-4b2e-4b8d-b27b-ac6b93088c3b) : créneau jeu 14-18h, zone Hall,
    tâche Ascenseur, 53 interventions, agent Christian
  "Container" (4aabed0b-4890-4e5a-897d-462cf90a8964) : créneau jeu 8-9h,
    zone Local Container, tâche Nettoyage Poubelles, 53 interventions, agent Christian
Note : "Container" est typé parties_communes (devrait être containers — non bloquant).
Agent Christian (1d46fd73-226c-404d-aeae-e47676955fb2) sur les deux contrats.
TEST B6e validé : régénérer Bat A laisse Container intact à 53 (DELETE scopé OK).
TEST B6a validé : scan Bat A → Hall seul ; scan Container → Local Container seul.
TEST B6b validé ALTHEA : 2 rapports du 25 juin avec libellés "Container" / "Bat A".
Détail complet : voir section P2-11 plus bas.

RESTE (post-MVP) :
- Dette finale P2-11 (voir liste ci-dessous)
- P2-12 / P2-13 à cadrer
- Tests terrain à valider (controle-final, commandes, passage bureau)
- Réactivation features masquées selon retours terrain (flag true + push)

## 🔄 PROTOCOLE CONTEXT! (mise à jour de la mémoire projet)

Quand l'utilisateur écrit "CONTEXT!" (ou "context!") dans une conversation,
Claude doit produire un bloc unique prêt à coller dans Claude Code, qui met à
jour ce fichier /docs/CONTEXT.md selon ces règles :

1. INCRÉMENTAL : reprendre tout ce qui a été fait, exécuté, décidé ou appris
   dans la conversation DEPUIS le dernier CONTEXT! — pas tout le projet,
   seulement les nouveautés.

2. METTRE À JOUR le bloc "⚡ ÉTAT ACTUEL" en haut du fichier (étape en cours,
   prochaines étapes) ET la ou les sections concernées plus bas.

3. NE JAMAIS SUPPRIMER une décision, un apprentissage ou un choix technique.
   Si une décision antérieure a changé, NE PAS l'effacer : la marquer comme
   dépassée et expliquer le changement, format :
   "Avant : [ancienne approche]. → Changé le [date] : [nouvelle approche].
   Raison : [pourquoi]."
   Ainsi on garde la trace du raisonnement, jamais juste le résultat final.

4. PRÉSERVER tout le reste du fichier inchangé (ne toucher qu'aux sections
   concernées par les nouveautés).

5. Inclure les détails techniques concrets utiles à la reprise : commits,
   noms de fichiers/routes, IDs de test, requêtes SQL clés, résultats de tests.

6. Terminer le bloc par la consigne explicite à Claude Code de ne rien
   supprimer d'autre dans le fichier.

Objectif : qu'une nouvelle conversation (Claude chat ou Claude Code) puisse
reprendre l'avancement exact sans aucune perte d'information ni de raisonnement.

Note : si la section d'historique des décisions dépassées devient trop longue,
l'archiver dans docs/CONTEXT_HISTORIQUE.md pour garder ce fichier lisible
(à faire seulement quand le besoin se présente).

# Contexte projet Archipropre

## Projet
Application PWA Next.js de gestion d'interventions 
pour Archipropre Services (société de nettoyage, Montpellier).
URL production : https://archipropre-app.vercel.app
Repo GitHub : https://github.com/Lord34-MyPipe/archipropre-app
Dossier local Mac : ~/archipropre-app

## Stack technique
Next.js 16 + TypeScript + Tailwind CSS
Supabase (PostgreSQL + Auth + Storage + Realtime)
Vercel + GitHub + Leaflet + PWA iPhone

## Supabase
URL : https://qszexdcyzlknokpaccnw.supabase.co
Région : eu-west-3 Paris (RGPD)
Plan : Free (à passer Pro avant livraison)

## Comptes de test
- directeur@archipropre.fr / Test1234! → role: directeur
- manager@archipropre.fr / Test1234! → role: manager
- agent@archipropre.fr / Test1234! → role: agent
- demo_sofia@archipropre.fr / Demo1234! → agent démo (à supprimer)
- demo_karim@archipropre.fr / Demo1234! → agent démo (à supprimer)
- (+ 8 autres comptes demo_ à supprimer via :
  DELETE FROM auth.users WHERE email LIKE 'demo_%@archipropre.fr')

## Comptes de production (agents réels)
- Tous les agents @archipropre-services.com : mot de passe **Archipropre2026**
- Christian Marquant (manager) : marquant@archipropre-services.com / Archipropre2026

## IDs importants en base
- Manager test (Ciprian Onitiu) : 94562442-7f4a-4ab7-bc11-ac866275d5d7
- Agent test (Marie Dupont) : c9ae0702-02d4-45b3-aa51-4dd987184867
- Directeur test (Ana Gainar) : 49f93789-a55d-4584-92b5-917db561d4af
- Résidence Home Inside : 30d96500-6612-464a-97cc-8abcd8af3540
- Contrat Home Inside : 1d9676ff-a73d-4e7f-923a-985522d6d34f

## Tables Supabase (15 tables + 2 vues)
profiles, residences, zones_residence, taches_template,
contrats_residences, plannings, interventions_planifiees,
interventions, taches_intervention, alertes,
absences, conges, tournees, tournees_etapes, distances_cache

Vues calculées (ne pas stocker de données dedans) :
- v_charge_agent : taux de remplissage hebdo par agent
- v_etat_residence : état calculé (a_configurer / prete / planning_actif)
- v_conflits_planning : détection chevauchements horaires par agent

## Champs ajoutés en session 16/06/2026

### Sur profiles (agents)
- contrat_heures_hebdo (integer, défaut 35) — existait déjà
- seuil_cible_pct (integer, défaut 80, entre 50 et 100)
- mode_deplacement (enum : 'tramway' | 'voiture' | 'velo')
- secteur_libelle (text, nullable)
- depart_lat, depart_lng (double precision, nullable)

### Sur residences
- accessible_tramway (boolean, défaut false)
- arret_tram_proche (text, nullable)

### Type PostgreSQL créé
- mode_deplacement_enum ('tramway', 'voiture', 'velo')

## Logique de capacité agent
- Capacité théorique = contrat_heures_hebdo (figé)
- Capacité disponible = théorique − congés − absences − déjà affecté
- Pendant un congé complet : capacité disponible = 0 (verrou)
- Trajets résidence→résidence calculés via OSRM (lib/trajet.ts), fallback 20% si OSRM indisponible
- Seuil cible individuel : vert < seuil, orange entre seuil et 95%, rouge > 95%

## Logique d'état des résidences (v_etat_residence)
- a_configurer : pas d'agent_prefere_id OU pas de contrat
- prete : agent + contrat OK mais zéro intervention future
- planning_actif : au moins une intervention future
L'état se calcule automatiquement, aucun champ à maintenir.

## Ce qui est livré et en production
✅ Auth 3 rôles (agent / manager / directeur) avec RLS
✅ 15 tables Supabase + RLS + Storage buckets
✅ 30 résidences importées avec GPS (clients CTL)
✅ Carte interactive Leaflet + clusters par type client
✅ Navigation Google Maps + Waze par résidence
✅ QR Code PDF imprimable par résidence
✅ Token QR immuable (trigger PostgreSQL)
✅ Scan QR fonctionnel sur iPhone
✅ Déploiement Vercel opérationnel (HTTPS)
✅ Gestion agents + congés/absences + calendrier mensuel
✅ Interface résidences refaite + recherche temps réel
✅ Tâches template Home Inside (9 zones, 46 tâches)
✅ Fréquences enrichies (hebdo/mensuel/trim/semest/annuel)
✅ Vue par zone + vue par jour (tableau 11 colonnes)
✅ Affectation agent attitré + agents exclus par résidence
✅ Modal planification intervention (3 étapes) depuis manager
✅ Score de compatibilité agent/résidence (0-100)
✅ Récurrences : ponctuelle/hebdo/bihebdo/mensuelle
✅ Section interventions du jour + bouton réassigner
✅ Champs capacité agent (contrat_heures_hebdo, seuil_cible_pct,
   mode_deplacement, secteur_libelle, depart_lat, depart_lng)
✅ Vue v_charge_agent (taux remplissage hebdo, capacité disponible)
✅ Page /manager/charge — tableau de charge barres colorées + seuil individuel
✅ Filtre voiture/tramway sur tableau de charge
✅ 10 agents démo injectés (préfixe demo_ — à supprimer avant livraison)
✅ Vue v_etat_residence — 3 états calculés automatiquement
✅ Badges d'état (gris/orange/vert) sur toutes les cartes résidence
✅ Bouton principal contextuel (Configurer / Générer le planning / Voir le planning)
✅ Filtre par état sur la page résidences
✅ Menu ⋯ actions secondaires (QR, Maps, tâches, agent, contrat…)
✅ Cache Next.js corrigé (force-dynamic sur Server Components)
✅ Home Inside : planning_actif, Marie Dupont, 157 interventions planifiées
✅ Page /manager/residences/[id]/planning (voir/modifier/supprimer/régénérer)
✅ Refonte contrat : creneaux_acceptes JSONB remplace heure_debut_min/fin
✅ Fréquence estimée calculée depuis taches_template
✅ Tâche "Mise en place" 5 min sur toutes les résidences
✅ Durées tâches template corrigées (5 min par défaut)
✅ Génération planning depuis creneaux_acceptes + jours_semaine taches_template
✅ Idempotence régénération planning — transaction PostgreSQL planifier_interventions
✅ Optimistic update badge résidence après génération (window.location.href)
✅ Vue v_conflits_planning — détection automatique des chevauchements horaires par agent
✅ Vues Jour/Semaine/Mois sur /manager/planning avec navigation ← →
✅ Correction v_etat_residence — lit interventions (plus interventions_planifiees legacy)
✅ Génération planning corrigée — aucun jour exclu par défaut,
   seuls jours_interdits du contrat font foi
✅ Binôme d'agents — configuration, affectation automatique,
   interventions miroir, badge visuel sur planning et agents
✅ Alerte incohérence contrat horaire entre binômes
✅ Moteur IA suggestion d'agent (POST /api/residences/suggest-agent)
   avec GPS, charge, disponibilités, bouton "✨ Obtenir une suggestion IA"
   dans AgentAttitreModal
✅ Copilote IA conversationnel (POST /api/ia/copilote)
   — panneau slide-in 420px, contextuel par semaine (?date= URL),
   raccourcis rapides, réassignation + décalage horaire en langage naturel,
   application directe en base, rendu Markdown, router.refresh() après action
✅ Fix camelCase/snake_case TacheModal (duree_minutes, frequence_type…)
✅ Calcul temps de trajet réel via OSRM (serveur public router.project-osrm.org)
   — service lib/trajet.ts, profils driving/foot/bike
✅ Cache distances_cache par coordonnées lat/lng + mode (évite appels OSRM répétés)
✅ Contrainte UNIQUE (origine_lat, origine_lng, dest_lat, dest_lng, mode)
   + upsert ON CONFLICT DO NOTHING — doublons structurellement impossibles
✅ Mode tramway forfaitaire : marche→arrêt + forfait_tram (param) + arrêt→destination
✅ Trajets résidence→résidence intégrés à la génération de planning et au copilote IA
✅ Copilote IA recalcule les horaires avec les vrais temps de trajet OSRM
✅ Interventions de test sur 4 agents démo (vert/orange/rouge validés)
✅ Page /manager/charge enrichie : ratio heures programmées / contractuelles
   (ex. 42h / 35h) + heures libres affichés
✅ Barre de charge échelle 0→125% : repère contrat à 80%, heures sup
   en rouge foncé au-delà du contrat, label fusionné "Xh (+Xh sup)" si dépassement
✅ v_charge_agent expose les heures programmées en valeur absolue
✅ Cartes KPI page charge : agents, remplissage moyen, capacité libre, en surcharge
✅ Géocodage adresse→GPS via Nominatim (lib/geocodage.ts, User-Agent requis, biais Montpellier)
✅ Création de client par le copilote IA en langage naturel + validation par bouton
   (route /api/residences/creer-rapide, garde-fou structurel)
✅ Mini-carte Leaflet de validation GPS dans le copilote : marqueur déplaçable,
   bouton agrandir → grande carte zoomable, bascule plan/satellite (Esri World Imagery)
✅ Intervention ponctuelle via copilote (route /api/interventions/creer-ponctuelle,
   double insert interventions + taches_intervention, validation par bouton)
✅ Règle anti-hallucination dans le copilote : interdiction de prétendre avoir agi
   sans confirmation technique réelle (proposition + bouton obligatoire)
✅ Contexte copilote enrichi : liste complète des résidences du manager (tous états)
   + date du jour réelle injectée en fuseau Europe/Paris (fix décalage UTC)
✅ Gestion binôme dans intervention ponctuelle : agent en binôme jamais proposé seul,
   binome_agent_id + facteur_binome injectés dans le contexte ANA,
   durée réduite (durée × facteur_binome, ex. 1h × 0,5 = 30 min),
   2 interventions miroir créées avec rollback si échec
✅ Renommage copilote → "ANA" (Assistant Numérique d'Accompagnement),
   tooltip bouton flottant "Ask ANA the Boss"
✅ Annulation d'intervention par ANA (route /api/interventions/annuler, annulation
   LOGIQUE statut='annulee', PAS de suppression — garde l'historique)
✅ Annulation binôme : annuler un agent en binôme annule aussi son intervention miroir
✅ Migration contrainte interventions_statut_check : ajout de 'annulee' aux statuts autorisés
✅ Règle anti-hallucination ANA étendue à TOUTES les actions (création, modification,
   annulation, suppression) + "fais exactement ce qui est demandé, pas de remplacement inventé"
✅ Garde-fou bouton sur annulation (carte 🗑️ + "Confirmer l'annulation", aucune action sans clic)
✅ ANA fait du "qui est dispo" : recommandation argumentée d'agent (charge, GPS, zone, dispo)
✅ Table date→jour de la semaine (28 jours, fuseau Europe/Paris) injectée dans le contexte ANA :
   ANA ne calcule jamais un jour elle-même, elle lit la table (fix erreur "vendredi 20" / "jeudi 19")
✅ Filtrage statut='annulee' ajouté à la requête de la page planning
   (les 3 vues v_charge_agent, v_etat_residence, v_conflits_planning filtraient déjà)
✅ facteur_binome appliqué au planning RÉCURRENT : durée réduite sur les 2 interventions
   miroir du binôme (cohérent avec l'intervention ponctuelle)
✅ profiles.binome_agent_id devient la SEULE source de vérité du binôme à la génération
   (residences.agent_secondaire_id ignoré à la génération, conservé en base pour l'affichage)
✅ rowsForUI reflète les heures réduites (aperçu cohérent avec la base)
✅ Page détail agent /manager/charge/[id] : en-tête (mode déplacement, secteur,
   contrat, badge binôme cliquable), grande barre de charge cohérente avec la liste,
   liste interventions de la semaine par jour (badge binôme + durée réduite),
   congés/absences à venir, navigation semaine ← → (?date=)
✅ Avatar ANA : photo (usage autorisé), cercle, remplace l'icône robot
   (en-tête panneau + bouton flottant)
✅ Parcours agent terrain (mobile-first iPhone) — Bloc A + B :
   - Scan QR → intervention du jour (fuseau Europe/Paris corrigé)
   - Tâches groupées par zone (fix jointure PostgREST double requête)
   - Statut 3 états par tâche : a_faire / realisee / non_realisee
   - Commentaire possible sur toute tâche (réalisée ou non)
   - Bouton "Valider toute la zone" en plus de la validation individuelle
   - Photo par zone (1 minimum obligatoire, plusieurs autorisées)
   - Table photos_zone (signed URLs, bucket privé) + RLS
   - Table zones_intervention (heure_cloture auto = temps par zone)
   - Table zones_intervention + RLS
   - Règle clôture zone : toutes tâches traitées + ≥1 photo
   - Compteur zones complètes + barre de progression
   - Rapport agent : tâches + photos uniquement (durée masquée)
   - Temps par zone calculé automatiquement (heure_scan → heure_cloture)
   - Protection anti-doublon au scan (upsert ignoreDuplicates)
   - Migration 008 : statut_tache + commentaire sur taches_intervention
   - Migration 009 : table zones_intervention + RLS
✅ Migration 010 : UNIQUE(intervention_id, tache_template_id) sur taches_intervention
   + upsert ignoreDuplicates au scan (re-scan préserve statut et commentaires)
✅ Photos par zone : upload + affichage miniature confirmés (signed URLs, bucket privé)
✅ Écran "Temps passé par zone" supprimé (temps calculé automatiquement)
✅ Durée masquée côté agent dans le rapport (visible manager/directeur uniquement)
✅ Page /manager/interventions/[id]/rapport : durée totale, temps par zone,
   chronologie tâches (vert/rouge + commentaires), photos par zone (signed URLs)
✅ Envoi rapport : statut='terminee' + heure_fin + alerte manager (destinataire_id)
✅ Liens rapport depuis 3 points d'accès manager :
   - Dashboard alertes (rapport_soumis → "Voir le rapport →")
   - Planning (clic intervention terminée → rapport, 4 vues)
   - Interventions du jour (bouton "Voir le rapport →" sur terminées)
✅ Taux horaire de facturation client : champ taux_horaire_facturation sur
   contrats_residences (nullable = suit le taux Base société) +
   taux_horaire_facturation_defaut sur parametres_societe (défaut 25 €/h)
✅ Modal contrat enrichi : champ "Interventions facturées / mois" (nb_interventions_mois
   éditable, distinct de la fréquence estimée ~13 calculée à la volée),
   toggle Base/Spécifique pour le taux horaire, bloc "heures vendues" live
✅ Rapport manager : comparaison 3 durées (Contractuelle / Estimée / Réelle)
   — Contractuelle = montant_mensuel ÷ taux_horaire ÷ nb_interventions_mois,
   fallback taux Base société si contrat à NULL
✅ Fix bug temps par zone : clôture N − clôture N-1 (était clôture N − heure_scan)
✅ Tableau comparatif par zone : Estimée (taches_template.duree_minutes via zone_id)
   vs Réelle (zones_intervention corrigé), écart coloré, zones non traitées en orange,
   jointure par zones_residence.nom (copie directe au scan, fiable)
✅ Navigation planning agent J→J+7 (flèches ← →, bornée today à today+7,
   reset sur aujourd'hui à la connexion, dates calculées en Europe/Paris)
✅ Jours futurs côté agent : aperçu léger lecture seule (résidence + heure + adresse),
   scan grisé "Scan disponible le jour de l'intervention", tâches/zones/photos masquées
✅ Bouton Waze par carte d'intervention agent (réutilise lib/navigation.ts)
✅ lib/navigation.ts : wazeUrl/googleMapsUrl partagées agent + manager (GPS sinon adresse)
✅ Mise en sommeil résidence : annulation logique de toutes les interventions
   futures (statut='annulee') + residences.actif=false via POST /api/residences/[id]/sommeil
✅ Réactivation : residences.actif=true + option régénérer le planning (appel
   /api/planning/generer) ou réactiver uniquement — choix radio dans le modal Contrat
✅ router.refresh() après sommeil/réactivation — badge et compteur mis à jour
   automatiquement sans reload
✅ Badge "En sommeil" (gris) distinct de "Prête" — calculé depuis residences.actif
✅ Boutons Planning + Intervention grisés en sommeil, Rapports/Contrat/Tâches/
   Affectation restent accessibles
✅ Garde-fou régénération planning : bandeau avertissement + bouton Régénérer
   désactivé si résidence en sommeil (page planning + route API 403)
✅ Garde-fou création intervention : routes /api/interventions +
   /api/interventions/creer-ponctuelle retournent 403 si résidence en sommeil
✅ ANA refuse de créer une intervention sur une résidence en sommeil
✅ Fix bouton Planning : actif sur prete ET planning_actif (etat !== 'a_configurer')
✅ Migration 012 : ON DELETE CASCADE sur alertes.intervention_id et
   tournees_etapes.intervention_id — corrige le blocage FK lors de la régénération
   de planning (RPC planifier_interventions)
✅ Moteur IA réorganisation sur absence/congé (ANA) :
   - Déclencheur automatique : POST /api/absences crée une alerte
     'reorganisation_proposee' avec metadata JSONB (agent_id, période,
     intervention_ids) quand des interventions orphelines sont détectées
   - Route POST /api/ia/reorganisation : construit le contexte (orphelines +
     charge agents sur la période + contraintes contrats), appelle claude-sonnet,
     retourne plan JSON enrichi côté serveur (résidence_nom, date, créneau)
   - Panneau slide-in ReorganisationPanel (420px) : résumé ANA, cartes par
     intervention avec select agent modifiable, avertissements amber, barre de
     charge, footer sticky "✓ Appliquer (N)"
   - Route POST /api/ia/reorganisation/appliquer : UPDATE agent_id sur
     interventions redistribuées, UPDATE statut='annulee' sur annulations,
     DELETE alerte traitée — avec garde-fous auth + ownership
   - router.refresh() après application : alerte disparaît du dashboard,
     planning mis à jour
   - Fix bug silencieux : filtre congés corrigé 'approuve' → 'valide' dans
     le contexte ANA
   - GET /api/agents : nouvelle route retournant les agents actifs du manager
   - Migration 013 : ALTER TABLE alertes ADD COLUMN metadata JSONB
✅ Refonte tableau de bord manager (P2-1) :
   - Layout 2 colonnes desktop (Alertes 60% / Équipe 40%)
   - KPIs du jour : interventions / scans effectués / rapports reçus / points d'attention
   - Bloc alertes prioritaires : scans manquants +30min (rouge), alertes ANA,
     rapports en attente, commandes produits placeholder
   - Bloc équipe : agents groupés par statut (En retard / Pas scanné / En cours /
     Terminé / Absent / Disponible), groupes vides masqués
   - Bloc vert "Tout se passe bien" si 0 urgence
   - Alertes marquées lues au clic (PATCH /api/alertes/[id]/lue)
   - Fix NaN : nowTime via Intl.formatToParts (stable sur Vercel Edge Runtime)
✅ Statut 'validee' ajouté aux interventions (migration 014) :
   - v_conflits_planning corrigée (exclut 'validee' comme 'terminee')
   - Colonnes validee_par + validee_at sur interventions
✅ Validation rapport manager : bouton "Valider le rapport" sur page rapport,
   badge "✓ Validé" / "En attente" sur page rapports résidence
✅ Validation journalière agent :
   - Table journees_agent (migration 014) avec RLS manager
   - GET /api/agents/[id]/journee?date= : récapitulatif avec trajets inter-chantiers
     (heure_scan[N+1] − heure_fin[N]), trajets négatifs filtrés
   - POST /api/agents/[id]/journee/valider : upsert journees_agent + UPDATE
     interventions terminee → validee
   - JourneeAgentPanel (slide-in 420px) : segments chantiers + trajets + totaux +
     notes + bouton valider / badge validée
   - Accès depuis page détail agent /manager/charge/[id] (par jour)
   - Accès depuis page rapports résidence /manager/residences/[id]/rapports
   - Règle métier : domicile→1er chantier et dernier→domicile exclus du calcul
✅ Statut validee : vert foncé (#C0DD97/#27500A) + libellé "Validé" dans le planning
✅ RH export (P2-1b) :
   - Double barre sur /manager/charge : barre planifiée (existante) +
     barre réalisée (journees_agent validées), delta heures non productives en rouge
   - Récapitulatif hebdomadaire sur /manager/charge/[id] : tableau par jour
     (terrain + trajets + total), total réalisé vs contrat hebdo, delta
   - Export PDF RH mensuel (jsPDF) : en-tête Archipropre, infos agent,
     tableau journées validées, total réalisé vs contrat mensuel (× 4,33),
     delta heures non productives, signature manager
   - Modal sélecteur de mois (13 mois glissants)
   - Téléchargement direct : rapport-rh_[nom]_[année]-[mois].pdf

✅ Migration données production (session 22-23 juin 2026) :
   - Import 31 agents réels en base (auth.users + profiles + adresse_domicile +
     contrat_heures_hebdo) — emails : nom@archipropre-services.com / mdp : Archipropre2026
   - Suppression des 10 comptes démo (demo_@archipropre.fr) avec cascade complète
   - 127 résidences réelles importées (is_demo=false) depuis planning Excel Archipropre
   - 35 résidences démo taguées is_demo=true
     (à supprimer sur ordre : DELETE FROM residences WHERE is_demo=true)
   - Colonne notes_import ajoutée sur residences :
     'adresse_manquante' (7) | 'doublon_potentiel' (4) | NULL
   - Colonne adresse rendue nullable sur residences
     (migration allow_null_adresse_residences)
✅ Champ adresse_domicile dans le modal agent (AgentFormModal.tsx + route PATCH /api/agents)
✅ Bouton géocodage agents dans /manager/agents (depart_lat / depart_lng via /api/geocoder)
✅ Bouton géocodage résidences dans /manager/residences (lat / lng via /api/geocoder)
✅ Badges ⚠ Adresse manquante et 🔶 À vérifier doublon sur les cartes résidence
✅ Fix crash recherche résidences : (e.adresse ?? '').toLowerCase() au lieu de
   e.adresse.toLowerCase() (crash sur adresses null après migration nullable)

✅ Session 24 juin 2026 :

✅ Fiche détail résidence — /manager/residences/[id]/page.tsx (nouveau) :
   - Server Component (force-dynamic) + ResidenceDetailClient.tsx pour les parties interactives
   - En-tête : nom, adresse, badges état / sommeil / type client / notes_import
   - Affiche agent attitré et résumé contrat (montant + nb interventions/mois)
   - Grille de navigation : Planning / Rapports / Tâches / Contrat (modal) / QR Code
   - Bouton "← Retour" via router.back()
   - Garde-fou ownership : filtre .eq('manager_id', user.id)

✅ Planning manager — navigation au clic sur carte intervention :
   - planifiee / en_cours / non_demarree → /manager/residences/{residence_id}
   - terminee / validee → /manager/interventions/{id}/rapport (inchangé)
   - residence_id ajouté au SELECT Supabase et au type Intervention local
   - Fix bug Vue Mois : 'validee' ajoutée au lien "Voir →" (était 'terminee' seul)

✅ Page /manager/agents — refonte layout grille :
   - Cartes compactes : grille repeat(auto-fill, minmax(260px, 1fr))
   - Noms complets visibles (non tronqués), email tronqué
   - Stats par carte : interventions aujourd'hui / terminées / taux charge
   - Barre de recherche dans la toolbar
   - Binômes : conteneur span 2 colonnes avec sous-grille grid-cols-2

✅ Dashboard manager — bloc "Équipe aujourd'hui" :
   - N'affiche plus que les agents ayant au moins une intervention planifiée aujourd'hui
     (statut != 'annulee') — groupe "Disponible" supprimé
   - Message "Aucune intervention planifiée aujourd'hui" si aucun agent actif

✅ Champ mot de passe optionnel dans AgentFormModal (modal "Modifier l'agent") :
   - Input password en mode édition uniquement, vide par défaut (ne modifie pas si laissé vide)
   - Route PATCH /api/agents → auth.admin.updateUserById via SUPABASE_SERVICE_ROLE_KEY
   - Validation min 6 caractères côté client et côté serveur
   - Logs détaillés dans Vercel Functions pour débug (error.message, code, status, Object.entries)

---

## BUG CRITIQUE RÉSOLU — Connexion impossible agents importés (24 juin 2026)

⚠️ APPRENTISSAGE MAJEUR : les 31 agents importés le 22 juin (@archipropre-services.com)
ne pouvaient pas se connecter ET updateUserById échouait avec AuthRetryableFetchError.

**Cause racine** : lors d'un import en masse via INSERT SQL dans auth.users, plusieurs
colonnes de tokens ont NULL au lieu de chaîne vide. GoTrue (serveur Auth Supabase) plante
silencieusement à la connexion ET à l'appel admin API pour ces comptes.

**FIX OBLIGATOIRE après tout import d'agents via SQL :**
```sql
UPDATE auth.users
SET confirmation_token          = COALESCE(confirmation_token, ''),
    recovery_token              = COALESCE(recovery_token, ''),
    email_change_token_new      = COALESCE(email_change_token_new, ''),
    email_change                = COALESCE(email_change, ''),
    email_change_token_current  = COALESCE(email_change_token_current, ''),
    phone_change                = COALESCE(phone_change, ''),
    phone_change_token          = COALESCE(phone_change_token, ''),
    reauthentication_token      = COALESCE(reauthentication_token, '')
WHERE email LIKE '%@archipropre-services.com';
```

**Autres apprentissages auth :**
- `crypt('xxx', gen_salt('bf'))` en SQL direct NE fonctionne PAS avec Supabase Auth
  (hashage incompatible) — toujours passer par `auth.admin.updateUserById`
- Mot de passe minimum **6 caractères** (Supabase rejette en dessous — '2026' → rejeté)
- Les agents importés doivent avoir `user_metadata.email_verified = true`
- `AuthRetryableFetchError` = erreur réseau/fetch du client JS, PAS une erreur de données.
  Cause probable si persistant : SUPABASE_SERVICE_ROLE_KEY absente sur Vercel.

## Bugs connus à corriger
ℹ️ depart_lat/lng de Marie Dupont (agent test) à null — point par défaut siège
   à renseigner si on active un jour le choix d'agent le plus proche.
ℹ️ taches_intervention.validee (booléen) conservé en base mais plus utilisé
   → peut être supprimé lors d'une future migration de nettoyage
ℹ️ Données de test à nettoyer avant mise en production :
   - 35 résidences démo (is_demo=true) à supprimer : DELETE FROM residences WHERE is_demo=true
   - 7 résidences avec notes_import='adresse_manquante' à corriger manuellement
   - 4 résidences avec notes_import='doublon_potentiel' à vérifier
   - Contrat MACJ : montant_mensuel = 355 € HT (valeur de test actuellement)
   - taux_horaire_facturation_defaut : mettre à jour (actuellement 25 €/h)
   - Interventions ALTHEA (53 × Bat A + 53 × Container = 106) créées en dev B6e — à nettoyer
     avant mise en prod réelle. SELECT contrat_id, COUNT(*) FROM interventions GROUP BY contrat_id.
ℹ️ ALTHEA reconfigurée le 25/06 (agent Christian, zones, tâches, créneaux — 2 contrats actifs).
   À re-nettoyer avant mise en prod (106 interventions de test).
ℹ️ "Container" ALTHEA typé parties_communes au lieu de containers — non bloquant pour les tests,
   à corriger pour cohérence type_contrat.
ℹ️ Bloc "Comparaison des durées" (page rapport manager) : compare le temps réel
   GLOBAL mission à l'estimation d'UN SEUL bâtiment → écart trompeur en
   multi-bâtiments. Décision de conception à prendre (sommer l'estimation sur
   tous les bâtiments ? afficher autrement ?). Non bloquant.
ℹ️ Test terrain d'une mission NEUVE requis (le bug reconstruction n'est sorti
   qu'au test iPhone réel, pas en base).
ℹ️ Fichiers .claude/ et Agents.numbers non suivis dans le repo → vérifier qu'ils
   sont dans .gitignore.
ℹ️ v_charge_agent reste hardcodée sur la semaine courante (contournée sur
   /manager/charge par recalcul, mais la vue elle-même n'est pas corrigée — si
   d'autres écrans en dépendent pour une autre semaine, même problème).
ℹ️ Dashboard manager : les cartes détail "scan manquant"/"rapport en retard"
   (DashboardAlertes) restent par intervention/bâtiment (choix assumé). À
   regrouper par mission si ça devient bruyant en multi-bâtiments.

## À faire Phase 1 (dans l'ordre)

## À faire Phase 2 (dans l'ordre de priorité)

### P0 — Migration des données (priorité avant Phase 2)
À faire avant tout développement de nouvelles fonctionnalités :

1. Import agents depuis Organilogue via API
   - 42 agents actifs à récupérer (nom, email, fonction, téléphone)
   - Créer les comptes profiles dans Supabase + auth.users
   - Assigner rôle 'agent' + manager_id

2. Import résidences/clients depuis Organilogue via API
   - 150+ résidences actives à récupérer (nom, adresse, GPS)
   - Script d'import en masse via Supabase
   - Geocodage adresses manquantes via Nominatim

3. Saisie des tâches par résidence
   - Template Excel préparé (Archipropre_Template_Import_Residences_Taches.xlsx)
   - Ana et managers remplissent zone + tâche + durée + fréquence par résidence
   - Import SQL en masse depuis le fichier Excel rempli

4. Saisie des contrats par résidence
   - Montant mensuel, nb interventions/mois, créneaux, jours
   - À saisir dans l'app une fois les résidences importées

5. Suppression des comptes démo
   DELETE FROM auth.users WHERE email LIKE 'demo_%@archipropre.fr'

6. Mise à jour parametres_societe
   - taux_horaire_facturation_defaut : 28-34 €/h (à confirmer avec Ana)
   - adresse_siege : "123 Rue de la Bandido, 34160 Castries"

### P2-1 — Refonte tableau de bord manager ✅ LIVRÉ

### P2-1b — Heures réelles vs contractuelles + export RH ✅ LIVRÉ
Comparaison heures planifiées / réalisées / contractuelles par agent.
Les heures réalisées proviennent des journees_agent validées par le manager.

Niveau 1 — Double barre sur /manager/charge :
- Barre 1 (existante) : heures planifiées vs contrat
- Barre 2 (nouvelle) : heures réalisées validées vs contrat
- Delta "heures non productives" en rouge si réalisé < contrat
  (ex. contrat 35h, réalisé 28h → △ 7h non productives)
- N'apparaît que si au moins une journée validée sur la semaine

Niveau 2 — Récapitulatif hebdomadaire sur /manager/charge/[id] :
- Tableau par jour : statut validation + heures réalisées
- Total réalisé (validé) vs contrat hebdo vs delta
- Bouton "Préparer le rapport RH" → ouvre sélecteur de mois

Niveau 3 — Export RH mensuel (PDF imprimable) :
- Par mois civil, par agent
- Détail par semaine : jours travaillés, heures réalisées, trajets
- Total mensuel réalisé vs contrat mensuel (contrat_heures_hebdo × 4,33)
- Delta heures non productives (à la charge employeur)
- Validé et signé par le manager (nom + date)
- Format : PDF généré côté serveur, téléchargeable ou envoyable par email
- Remplace partiellement PEGASE pour la gestion des heures

Règle métier :
- Heures réalisées = nettoyage + trajets inter-chantiers (journees_agent.total_minutes_terrain + total_minutes_trajets)
- Heures non productives = contrat_heures_hebdo - heures_réalisées (si positif)
- Domicile→1er chantier et dernier→domicile exclus (déjà implémenté)
- Un delta négatif (agent a fait plus que son contrat) = heures sup à signaler

### P2-2 — Commandes produits agents (enrichi)
Liste globale de produits définie par le directeur (nom, catégorie, photo_url).
Agent coche ce qui manque depuis son app mobile.

Intégration parcours agent :
- Après validation de toutes les zones, avant envoi du rapport :
  écran "Contrôle du local produits" avec 2 options :
  "Tout est OK" → passe directement à l'envoi du rapport
  "Il manque des produits" → grille de photos produits à cocher
  (quantité optionnelle par produit)
- Commande rattachée à residence_id + intervention_id
- Alerte immédiate type 'commande_produit' sur dashboard manager

Dashboard manager :
- Bloc "Commandes produits" dans les alertes (actuellement placeholder)
- Page dédiée /manager/commandes : liste par résidence, statut, historique

Tables :
- produits (id, nom, categorie, photo_url, actif)
- commandes_produits (id, agent_id, produit_id, residence_id,
  intervention_id, quantite, statut, created_at)

### P2-3 — Contrat containers / agent spécialisé
Deux situations à gérer :
A) Containers inclus dans contrat principal : tâches taggées
   type='containers', agent dédié avec horaires atypiques (ex. 5h-7h,
   18h-21h), coût réel isolé même si non facturé séparément.
   → Permet au directeur de voir la rentabilité cachée par poste.
B) Contrat containers séparé : 2e contrat sur la résidence
   (type='containers'), propre agent, propres créneaux, propre tarif.
   Tâches containers retirées du contrat principal.
Dans les deux cas : tag 'containers' sur les tâches pour isoler
le coût réel (23€/h) vs facturation → révèle les pertes cachées.
Tables à créer/modifier : ajouter type_contrat sur contrats_residences,
ajouter type_tache sur taches_template.

### P2-4 — Agent obligatoire Annexe 7
Champs sur residences : agent_obligatoire_id (UUID nullable),
annexe7 (boolean, motif légal de reprise de contrat).
Comportement ANA : ne propose jamais un autre agent sauf absence.
En cas d'absence : ANA signale l'obligation légale explicitement,
cherche un remplaçant mais le manager doit valider manuellement.
Badge visuel "Annexe 7" sur la carte résidence et dans le planning.
Plusieurs résidences peuvent avoir un agent obligatoire.

### P2-5 — Notifications push PWA (intervention ponctuelle)
Notification push iPhone quand une intervention ponctuelle est créée
le jour même. Boutons dans la notification : "Accepter" / "Indisponible".
Si accepté → intervention confirmée au planning.
Si refusé + raison → ANA relance une suggestion automatiquement,
même workflow jusqu'à acceptation.
Facturation ponctuelle déclenchée après validation rapport manager.
Tech : Web Push API + Service Worker (déjà PWA).

### P2-6 — Découverte des lieux (vidéo résidence)
Vidéo filmée par le manager, uploadée dans Supabase Storage
(bucket 'videos_residences').
Accessible côté agent sur la fiche intervention sous
"Découvrir les lieux" — affiché uniquement si vidéo disponible
et si l'agent n'a jamais intervenu sur cette résidence.
Table : videos_residence (id, residence_id, url, created_by,
created_at, description).

### P2-7 — Écran temps réel /manager/live
Page dédiée conçue pour rester affichée en permanence sur écran bureau.
Manager : avancement chantiers en direct (tâches cochées en temps réel
via Supabase Realtime), agents sur le terrain, alertes scan manquant.
Directeur : CA généré mis à jour toutes les heures (tâches terminées
× taux facturation), coût réel dépensé (heures × 23€/h),
marge en direct, heures non productives (agent payé mais tâches finies),
bilan fin de journée automatique.
Tech : Supabase Realtime (déjà configuré) + polling toutes les 5 min
pour les KPIs financiers.

### P2-8 — Résilience IA
Si claude-sonnet indisponible :
- Message d'erreur explicite sur toutes les fonctions IA
- Fallback manuel sur TOUTES les fonctions IA :
  * Suggestion agent → sélecteur manuel avec score affiché
  * Réorganisation absence → tableau d'affectation manuelle
  * ANA copilote → message "IA temporairement indisponible,
    utilisez les actions manuelles"
- Modèle configurable via variable d'env ANTHROPIC_MODEL
  (défaut 'claude-sonnet-4-6') → mise à jour sans redéploiement code.
- Jamais de dépendance bloquante à un modèle spécifique.

### P2-9 — Passage au siège (intervention spéciale)
Le manager peut programmer un passage au siège pour un agent en 1 clic.
Cas d'usage : récupérer/rendre du matériel, réunion, briefing.

Création depuis 2 points d'accès :
- Planning manager : bouton "+ Passage siège" par agent
- Fiche agent /manager/charge/[id] : bouton dédié

Options à la création :
- Agent concerné
- Date
- Moment : "Avant sa 1ère intervention" / "Après sa dernière intervention" / "Créneau libre"
- Motif : Récupérer matériel / Rendre matériel / Réunion / Autre (texte libre)

Côté agent (dashboard mobile) :
- Carte spéciale "Passage au siège" avec adresse + bouton Waze
- Bouton "Effectué" simple (pas de scan QR, pas de tâches)
- Apparaît dans le planning J→J+7 comme les autres interventions

Stockage : nouveau type d'intervention ou table dédiée passages_siege
(id, agent_id, date, moment, motif, statut, created_by, created_at)
Adresse siège : depuis parametres_societe (champ a ajouter : adresse_siege)

### P2-10 — Workflow congés avec impact IA (spec, non implémenté)

#### Statuts congés
- Statuts possibles : 'en_attente' | 'valide' | 'refuse' | 'annule'
- Seul le statut 'valide' impacte le planning et le calcul de charge
- Statut 'en_attente' = invisible pour le moteur de planning (ANA)

#### Permissions
- Agent : peut soumettre (→ 'en_attente') et annuler ses propres demandes
- Manager / Directeur : peut soumettre, valider, refuser, et annuler

#### Fix modal congés existant (AgentAbsenceDrawer)
- Message "Dates obligatoires" : n'afficher qu'après tentative de soumission
  (useState `submitted`, afficher les erreurs seulement si submitted === true)
- Fusionner les 2 boutons selon le rôle :
  * Agent → un seul bouton "Soumettre la demande" (→ 'en_attente')
  * Manager/Directeur → bouton "Soumettre" + bouton séparé "Valider directement"

#### Bouton "Impact" (pré-validation par manager/directeur)
- Visible sur toute demande 'en_attente'
- Appelle /api/ia/reorganisation avec les interventions de l'agent sur la période
- Affiche : résidences impactées, heures à redispatcher, jours concernés
- Propose plan de réorganisation via ReorganisationPanel existant
- Bouton "Valider + appliquer" : valide le congé ET applique la réorganisation
  en une seule action atomique

#### Annulation congé — 2 cas

Cas A — annulation avant validation ('en_attente' → supprimé) :
- Suppression simple, aucun impact planning
- Pas d'analyse IA nécessaire

Cas B — annulation après validation ('valide' → 'annule') :
- Alerte automatique au manager : "Congé annulé — réintégration possible"
- Bouton "Impact réintégration" : analyse les interventions de la période
  qui avaient été réaffectées à d'autres agents
- Distingue : interventions récupérables (futures, réaffectées)
  vs interventions terminées (irrécupérables, agent n'avait pas travaillé)
- Propose plan inverse : remettre l'agent sur ses interventions d'origine
  si les agents remplaçants ne sont pas surchargés
- Manager valide ou ajuste manuellement

#### Notifications
- Agent → notification quand son congé est validé ou refusé
  (alerte en base, future push PWA P2-5)
- Manager → alerte quand un agent soumet une nouvelle demande

## P2-11 — Multi-contrats par résidence (EN COURS — backend migré, UI en construction)

### Modèle validé
Hiérarchie : Résidence → Contrat → Zone → Tâche (4 niveaux).
Une résidence a des contrats sur 2 axes :
- SIMULTANÉS (espace) : Bât A + Bât B + Containers en même temps
- SUCCESSIFS (temps) : contrat perdu en 2024 → nouveau contrat 2026

Statut d'un contrat (calculé, jamais stocké) :
- actif   : actif=true ET date_debut <= aujourd'hui <= date_fin
- futur   : actif=true ET date_debut > aujourd'hui
- termine : date_fin < aujourd'hui (garde son historique, n'impacte plus le planning)
- sommeil : actif=false ET dates en cours

Règles clés :
- On ne supprime JAMAIS un contrat avec historique (≥1 intervention) → sommeil obligatoire
- Suppression dure autorisée seulement si 0 intervention
- type_contrat enum : parties_communes | containers | espaces_verts
- containers/espaces_verts : coût réel TOUJOURS calculé même si montant=0 (perte cachée)
- badge "Offert 0€" si montant_mensuel=0 ; badge "perte cachée" si marge négative
- 1 QR par contrat ; un agent peut être attitré à plusieurs contrats d'une résidence
- agent_prefere_id et qr_code_token vivent désormais sur le CONTRAT (migré depuis residences)

### Schéma (migrations 015 + 016 — APPLIQUÉES en prod)
Migration 015 (schéma, non-destructif) :
- type_contrat_enum créé
- contrats_residences : + libelle TEXT, + type_contrat (default parties_communes),
  + agent_prefere_id UUID FK profiles, + qr_code_token TEXT
- zones_residence : + contrat_id UUID FK contrats_residences
- interventions : + contrat_id UUID FK contrats_residences

Migration 016 (données) :
- 162 résidences = 162 contrats (1 chacune) : 11 contrats réels actifs + 151 placeholders actif=false
- Les 11 contrats existants : agent + qr copiés depuis residences, type=parties_communes, libelle='Contrat principal'
- Les 151 sans contrat : contrat vide actif=false créé (date_fin = +3 ans, creneaux='[]')
- Toutes les zones (22) rattachées à leur contrat via residence_id
- ALTHEA (id 6537baf8-05ae-493e-9b3a-d404fa190a94) migrée et validée manuellement en premier
- ATTENTION migration future : les nouveaux contrats créés à la main doivent assigner
  leurs zones explicitement (la requête 016 liait par residence_id, OK car 1 contrat/résidence)

### TRANSITION SÉCURISÉE — principe
residences.agent_prefere_id et contrats_residences.agent_prefere_id sont synchronisés.
Double-écriture en place : ne JAMAIS les laisser diverger.
Le code bascule progressivement vers la lecture du contrat, residences reste un miroir.

### Avancement code (étapes 3.x — LIVRÉES)
- 3.1 ✅ Double-écriture affectation : /api/residences/affecter écrit dans residences
  ET contrats_residences (contrat parties_communes). Erreur du 2e UPDATE exposée (400),
  pas silencieuse. Limite connue : pas atomique sans RPC, mais désync visible si échec.
- 3.2 ✅ Génération planning lit agent_prefere_id depuis le contrat parties_communes actif
  (fallback residences pendant transition). Validation bloquante déplacée après fetch contrat.
  Requête contrat filtrée : residence_id + actif=true + type_contrat=parties_communes +
  plus récent. Testé ALTHEA : 209 interventions futures rattachées à Christian. Commit 2c74e92.
  → DÉPASSÉE le 25/06 (B6e) : la génération n'utilise plus ce "guess". Le contrat_id est
    désormais explicite (body { residenceId, contratId }). Le "plus récent" prenait le mauvais
    contrat en cas de 2 contrats parties_communes actifs simultanés (Bat A + Container).
- 3.3 ✅ Duplication zones (/api/zones/dupliquer) copie contrat_id de la zone source,
  fallback lookup contrat parties_communes si source NULL.

### UI multi-contrats — découpage B1→B6

Option B validée (refonte complète fiche résidence en hub), découpée en sous-étapes testables :

- B1 ✅ LIVRÉ : API GET /api/residences/[id]/contrats — liste contrats + statut_calcule
  (actif/futur/termine/sommeil) + nb_interventions + nb_zones + agent joint + champ actif.
  Calcul dates en Europe/Paris. Tri actif>futur>sommeil>termine. Testé ALTHEA.

- B2 ✅ LIVRÉ (commit 4ce7340) : fiche résidence affiche une carte par contrat (lecture seule).
  Badges statut, type, agent, montant, compteurs, "Aucune intervention planifiée", "Offert 0€".

- B2.5 ✅ LIVRÉ (commit 5fc388a) : accès fiche détail depuis la liste /manager/residences.
  components/manager/ResidenceCard.tsx : nom résidence → Link vers /manager/residences/[id]
  + chip "Fiche →" à côté du nom. Chaîne : page.tsx → ManagerResidencesClient → ResidenceCard.
  Note : commit local-only pendant quelques heures, push oublié — déployé en retard sur Vercel.
  Apprentissage : toujours vérifier git log origin/main après commit.

- B3 ✅ LIVRÉ (commit 681e209) : bouton "+ Ajouter un contrat" → AjoutContratModal.
  POST /api/residences/[id]/contrats. qr_code_token NON généré côté code —
  généré par trigger set_contrat_qr_token (migration 017) à l'INSERT.

- B4 ✅ LIVRÉ (commits 9823cd3 + 8b7601b) : GestionContratModal par-contrat + zone dangereuse.
  Fichiers : app/api/residences/[id]/contrats/[contratId]/route.ts (GET + PATCH + DELETE)
             app/manager/residences/[id]/GestionContratModal.tsx (nouveau composant)
  PATCH : 11 champs éditables (libelle, type_contrat, dates, montant, nb_interventions_mois,
    agent_prefere_id avec double-écriture residences si parties_communes, taux_horaire_facturation,
    creneaux_acceptes, jours_interdits, notes_specifiques, actif). JAMAIS qr_code_token.
  DELETE : garde-fou 409 route (COUNT interventions) + appel RPC delete_contrat_cascade (migration 018).
  Zone dangereuse contextuelle : "Supprimer définitivement" si nb_interventions=0,
    "Mettre en sommeil"/"Réactiver" (PATCH actif) si nb_interventions≥1.
  resolveAndCheck : ownership cookie auth → user.id → résidence (manager_id) → contrat (residence_id)
    AVANT tout appel admin/RPC. Testé ALTHEA : édition libellé OK, cascade validée.
  Architecture : Option 2 (nouveau composant, ContratModal existant INTACT pendant transition).
  Routes REST Option A : /api/residences/[id]/contrats/[contratId] (validée).

- B4.5 ✅ LIVRÉ (commit 5b292ff) : parcours contrat unifié.
  - AjoutContratModal enrichi : création COMPLÈTE (libelle, type, dates, montant,
    nb_interventions_mois, agent_prefere_id, taux_horaire_facturation toggle,
    creneaux_acceptes, jours_interdits, notes_specifiques) + bloc heures vendues live.
  - POST /api/residences/[id]/contrats accepte ces 11 champs (creneaux_acceptes/jours_interdits
    insérés en arrays natifs, pas stringifiés).
  - Ancien bouton "Contrat" RETIRÉ (débranché) de ResidenceDetailClient ET ResidenceCard.
    Fichiers components/manager/ContratModal.tsx + /api/contrats NON supprimés (dette après B6),
    juste débranchés. planning importe seulement le type Creneau (intact).

- B5.5 ✅ LIVRÉ (commit 966d229 + migration 019) : contrat_id écrit à la génération.
  - Migration 019 : CREATE OR REPLACE planifier_interventions — ajout contrat_id dans INSERT+SELECT,
    DELETE idempotent restreint à statut='planifiee' uniquement (avant : NOT IN terminee/en_cours).
    Raison : ne jamais supprimer validee (RH) ni annulee (intentionnel) ni non_demarree (historique).
    Liste blanche > liste noire.
  - Route /api/planning/generer : contrat_id: contrat.id ajouté au type InterventionRow et à
    chaque rows.push(). Miroirs binôme héritent contrat_id via spread {...r}.

- B6d ✅ LIVRÉ (commit cbacbaa) : tâches PAR CONTRAT.
  - taches/page.tsx accepte searchParams.contratId : zones filtrées par contrat_id,
    tâches via zone_id IN (zones du contrat). Sans param = comportement résidence inchangé.
  - /api/zones POST accepte contratId optionnel → contrat_id dans l'INSERT (avant : NULL).
  - TachesClient propage contratId à handleAddZone + titre "Tâches — <libelle>".
  - Bouton "Tâches" sur chaque carte contrat (?contratId=) dans ResidenceDetailClient.
  - lib/types.ts : ContratResidence.libelle ajouté (manquait depuis migration 015).
  - DETTE : le bouton "Tâches" résidence-level (grille du haut) crée encore des zones sans
    contrat_id (NULL) → à retirer en dette finale pour éviter zones orphelines.

- B6e ✅ LIVRÉ (commits 2b0852f + 7cf8ee3 + 090479d + migration 020) : planning PAR CONTRAT.
  - Migration 020 : DROP FUNCTION planifier_interventions(uuid,jsonb) PUIS CREATE nouvelle
    signature (uuid p_residence_id, uuid p_contrat_id, jsonb p_lignes). DELETE scopé
    AND contrat_id = p_contrat_id → régénérer un contrat ne touche plus les autres.
    GRANT EXECUTE TO service_role sur la nouvelle signature.
    (DROP nécessaire : changer la signature sans DROP = surcharge PostgreSQL = 2 fonctions.)
  - generer/route.ts : body { residenceId, contratId } requis ; résolution explicite
    .eq('id', contratId).eq('residence_id', residenceId) ; tâches via zones du contrat ;
    RPC avec p_contrat_id. Regen sans contratId → 400. DETTE agent commentée dans le code.
  - planning/page.tsx + PlanningClient : searchParams.contratId, interventions filtrées,
    body regen { residenceId, contratId }, header "Planning — <libelle>".
  - Bouton "Planning" sur chaque carte contrat (?contratId=).
  - TEST VALIDÉ ALTHEA : Bat A 53 interventions, Container 53 interventions.
    Régénérer Bat A laisse Container intact (DELETE scopé OK).

- B5 ✅ LIVRÉ (commit 077089b) : KPI bande en-tête fiche résidence.
  Voir section dédiée B5 ci-dessous.

- B6a ✅ LIVRÉ (commits fb80809, a464925, 8127236, b655043) : QR par contrat.
  Voir section dédiée B6a ci-dessous.

- B6b ✅ LIVRÉ (commits e35bc9a, 3fcc03d, a3fe8ea) : rapports par contrat.
  Voir section dédiée B6b ci-dessous.

- B5 ✅ LIVRÉ (commit 077089b) : KPI bande en-tête fiche résidence.
  Bande KPI dans l'en-tête ResidenceDetailClient : CA/mois · Coût/mois · Marge/mois (+taux%)
  + badge "⚠ Perte cachée". OPTION B validée : perte_cachee = true si AU MOINS UN contrat actif
  en marge négative, MÊME si marge globale positive.
  Calcul dans page.tsx (Server Component SSR), prop kpi passée au client.
  Route /rentabilite mode global enrichie flag perteCachee.
  FACTORISATION : lib/rentabilite.ts (calcMinutesAnnuelles, calcDureTotaux, calcCoutMensuel,
  KpiResidence) = source unique partagée page.tsx + route + RentabiliteModal.
  Validé ALTHEA : CA 458€ · Coût 42€ · Marge +416€ (90.9%) + badge perte cachée.

- B6a ✅ LIVRÉ (commits fb80809, a464925, 8127236, b655043) : QR par contrat (manager + agent).
  LE PLUS CORIACE. 5 bugs/apprentissages majeurs.
  MANAGER : bouton QR par carte contrat (PDF token DU CONTRAT + "ALTHEA — Bat A") ;
  bouton haut → PDF multi-pages tous QR contrats actifs. Helper renderQRPage.
  URL QR : {origin}/agent/scan?token={contrat.qr_code_token}.
  AGENT (scan/page.tsx restructuré) : token → contrats_residences (PAS residences) →
  intervention DU CONTRAT. Tâches scopées zones du contrat.
  LIBELLÉ CONTRAT ajouté : en-tête parcours agent, planning général manager, dashboard agent J→J+7.
  Migration 021 (version 20260625190943, renommée depuis 017 pour éviter conflit numérotation) :
  POLICY contrats_read_agent FOR SELECT USING (auth.uid() IS NOT NULL) sur contrats_residences.
  ⚠️ DETTE SÉCURITÉ : policy trop large, à resserrer.
  5 BUGS RÉSOLUS :
  1. BUG ZONES pre-B6a : scan insérait tâches de TOUTES les zones résidence (taches_template
     WHERE residence_id). Fix : zones WHERE contrat_id → tâches WHERE zone_id IN (ces zones).
  2. RLS MANQUANTE : agents ne pouvaient lire contrats_residences → "QR non reconnu".
     Fix : migration 021. Policy FOR ALL précédente (manager OR directeur) bloquait les agents.
  3. RESCAN en_cours : DELETE+INSERT ne se déclenchait qu'à planifiee→en_cours. Fix :
     stale-detection sur chemin en_cours (rebuild si zone hors-contrat, sinon préserve progrès).
  4. TOKEN PARTAGÉ : Bat A = token résidence (migration 016 copy). Ancien code trouvait Bat A
     par coïncidence, Container jamais trouvé. Les 2 fonctionnent maintenant via contrats_residences.
  5. CACHE PWA : sert ancien code après déploiement. ⚠️ DETTE : versioning service worker.
     En dev : Safari onglet normal, PAS PWA installée. Tester sur archipropre-app.vercel.app (prod).
  VALIDÉ : scan Bat A → Hall seul ; scan Container → Local Container seul ; étanche 2 sens.
  Cleanup direct DB : tache "Nettoyage Poubelles / Local Container" retirée de l'intervention
  47668efb (taches_intervention.zone_nom absent des zones du contrat → DELETE SQL direct).
  FIX ALERTES scan_hors_planning (commit 535b4ab) :
  - Message enrichi : "Christian Marquant a scanné le contrat Container (ALTHEA) hors planning
    le 25/06 à 20h26." — agent_nom + residence_nom + contrat_libelle stockés dans metadata JSONB
    à la création (point-in-time, pas de join au render). residences SELECT + nom ; profiles
    SELECT ajouté pour prenom+nom de l'agent.
  - Dédoublonnage : avant INSERT, check PostgREST .filter('metadata->>agent_id','eq',user.id)
    + contrat_id + date + lue=false → si alerte non lue existante → skip. 1 alerte max par
    (agent, contrat, jour). Pas de compteur.
  - Nettoyage DB : 67 alertes de test supprimées (contrat Container ALTHEA).

- B6b ✅ LIVRÉ (commits e35bc9a, 3fcc03d, a3fe8ea) : rapports par contrat.
  DISTINCTION DEUX OBJETS RAPPORT (validée avec Julien) :
  - OBJET 1 — RAPPORT D'INTERVENTION (par contrat) : 1 par intervention terminee/validee,
    lié à un contrat via contrat_id. Contenu : tâches+photos+durée de CETTE intervention.
    Listé par la page rapports résidence, filtrable ?contratId=. Base du futur rapport client P3-2.
    Bouton "Voir" → /manager/interventions/[id]/rapport.
  - OBJET 2 — RAPPORT JOURNALIER AGENT (journees_agent) : agrège journée complète agent
    TOUS contrats/résidences + trajets inter-chantiers (temps payé). PAS de contrat_id.
    Sert à la paie/RH UNIQUEMENT. Reste dans charge/[id] / validation journalière.
    NE DOIT PAS apparaître dans la page rapports filtrée par contrat.
  Implémenté :
  - rapports/page.tsx : liste interventions (objet 1), accepte searchParams.contratId optionnel,
    filtre contrat_id, récupère libellé contrat, header "Rapports — <libellé>" si filtré,
    retour vers fiche résidence si filtré.
  - SELECT inclut contrats_residences(libelle) → libellé affiché en teal par ligne.
  - En vue globale : libellé visible ; en vue filtrée : masqué (redondant avec header).
  - Bouton "Rapports" par carte contrat (?contratId=) dans ResidenceDetailClient.
  - RETRAIT bouton RapportsActions ("Journée de <prenom>", objet 2) de cette page (a3fe8ea) —
    polluait visuellement la page et faisait croire à l'utilisateur que les rapports listés
    étaient des journées agent.
  NOTA : RapportsActions + JourneeAgentPanel restent intacts dans charge/[id] (leur contexte).

- B6c ✅ LIVRÉ (commits f9b03e6 + 0d15336 + 412d10c — poussés en prod) :
  Rentabilité 2 NIVEAUX validée en prod sur ALTHEA — chiffres exacts :
  · Vue GLOBALE : CA 458 €/mois, coût estimé 42 €, marge +416 € (90.9 %), heures estimées 1h48, heures vendues 18h19. Plus de "Aucun contrat actif".
  · Bat A (par contrat) : CA 458 €, coût 25 €, marge +433 € (94.6 %), estimées 1h05, vendues ~18h.
  · Container (par contrat) : CA 0 €, coût 17 €, marge -17 €, badge "Perte cachée", vendues "— (contrat offert)".
  · CA et heures DIFFÉRENTS par contrat = bug multi-contrats maybeSingle() DÉFINITIVEMENT MORT.

  Chronologie commits (et leçon non-push) :
  - f9b03e6 : 1re version — bouton haut retiré + ajouté par carte + route scopée. NON POUSSÉ →
    prod tournait encore sur l'ancien code, "Aucun contrat actif" persistait. Spec aussi changée.
  - 0d15336 : changement spec + correction push. Restaure le bouton du haut (vue globale),
    route agrège tous les contrats, state discriminé. POUSSÉ.
  - 412d10c : heures vendues. NON POUSSÉ un moment → ligne absente en prod jusqu'au push.
  → Ces 3 ratés ont causé la décision d'auto-push systématique (voir Key learnings).

  Architecture 2 niveaux :
  - Bouton "Rentabilité" grille HAUT = vue GLOBALE = somme de tous les contrats actifs.
    Header modal : "Tous les contrats — vue globale".
  - Bouton "Rentabilité" sur chaque CARTE contrat = vue par contrat.
    Header modal : libellé du contrat (ex. "Bat A").
  - State discriminé dans ResidenceDetailClient :
    `{ contratId: string | null } | null` — null=modal fermé, {null}=global, {id}=par contrat.
    Évite la collision de l'ancien state booléen `showRentabilite`.

  Route /api/residences/[id]/rentabilite :
  - SANS contratId (mode global) : charge tous les contrats actifs, somme les montant_mensuel,
    charge toutes leurs zones/tâches, filtre les interventions sans contrat_id.
    Plus de maybeSingle() → bug multi-contrats tué.
  - AVEC contratId (mode contrat) : scope zones via contrat_id, tâches via zone_id IN [...],
    interventions filtrées par .eq('contrat_id', contratId).

  Bloc HEURES dans RentabiliteModal (commit 412d10c) :
  - Section "Heures" avec 2 lignes : "⏱ Estimées" (durées tâches via calcDureTotaux) +
    "💰 Vendues" (montant_mensuel ÷ taux_horaire_facturation effectif).
  - Taux effectif = contrat.taux_horaire_facturation ?? parametres_societe.taux_horaire_facturation_defaut ?? 25.
    Identique à la formule de GestionContratModal (cohérence UI).
  - Calcul côté serveur (heuresVenduesMois renvoyé par la route) pour éviter division par zéro côté client.
  - Contrat offert (CA=0) → "— (contrat offert)".
  - Mode global : somme des heures vendues de tous les contrats actifs.
  - Colonnes Semaine / Mois / Année dans les deux lignes.

  Perte cachée (contrat offert) :
  - Badge "⚠ Perte cachée" rouge en haut du modal si CA=0 et coût>0.
  - Coût et marge affichés quand même (pas masqués).
  - "CA = 0 € — perte = coût intégral" sous la section Estimé.

  Fallbacks taux uniformisés à 23 (était 22 dans directeur/parametres/route.ts,
  directeur/rentabilite/page.tsx et ?? 0 dans RentabiliteModal) :
  - Tous les fallbacks en dur → 23 (coût interne Archipropre).
  - Le code lit toujours parametres_societe.taux_horaire_agent en priorité, 23 = secours si absent.
  - Fichiers corrigés : app/api/directeur/parametres/route.ts,
    app/directeur/rentabilite/page.tsx, RentabiliteModal.tsx.

  DETTE cosmétique / lisibilité :
  - Message "pas encore de données réelles" dit "ce contrat" même en mode global → cosmétique.
  - Les 3 blocs (Heures / Estimé € / Réel) commencent à charger → envisager tableau comparatif
    unique Temps vendu / estimé / réel à terme.

### Décisions & schéma P2-11 (session 25 juin 2026)

Migrations appliquées :
- 017 : triggers QR token (INSERT génère, UPDATE bloque → qr_code_token immutable côté DB)
  `set_contrat_qr_token` BEFORE INSERT, `lock_contrat_qr_token` BEFORE UPDATE
- 018 : RPC `delete_contrat_cascade(p_contrat_id UUID)` SECURITY DEFINER
  Ordre : self-ref NULL sur tache_liee_id → vérification bloquante taches_intervention
  → DELETE taches_template → DELETE zones_residence → DELETE contrats_residences
  GRANT EXECUTE ON FUNCTION delete_contrat_cascade(UUID) TO service_role
- 019 : CREATE OR REPLACE planifier_interventions(p_residence_id uuid, p_lignes jsonb)
  Changements : ajout contrat_id dans INSERT/SELECT ; DELETE limité à statut='planifiee'
  (avant : NOT IN 'terminee','en_cours' — trop large, supprimait validee/annulee/non_demarree).
  Règle : liste blanche (= 'planifiee') > liste noire pour le DELETE de régénération.
- 020 : DROP FUNCTION planifier_interventions(uuid,jsonb)
       + CREATE planifier_interventions(p_residence_id uuid, p_contrat_id uuid, p_lignes jsonb)
  Changement signature : 3 paramètres au lieu de 2. DROP obligatoire avant CREATE car
  PostgreSQL crée une surcharge sans DROP (2 fonctions coexistantes = bug silencieux).
  DELETE scopé : AND contrat_id = p_contrat_id → isolation totale entre contrats d'une même résidence.
  GRANT EXECUTE ON FUNCTION planifier_interventions(uuid, uuid, jsonb) TO service_role.

GÉNÉRATION DE PLANNING = PAR CONTRAT (décision actée 25/06 — B6e) :
- Chaque contrat génère SON planning depuis SES créneaux + SES zones/tâches + SON agent.
- Le contrat_id est EXPLICITE (body { residenceId, contratId } obligatoire), jamais deviné.
- Raison : avec Bat A + Container actifs simultanément, le "plus récent" prenait le mauvais.
  Confirmé en test ALTHEA.
- Regen sans contratId → 400 (force l'usage par contrat depuis l'UI).
- DELETE scopé par contrat_id (migration 020) : isolation totale entre contrats.
- DETTE restante : agent = contrat.agent_prefere_id ?? res.agent_prefere_id (fallback résidence
  peut être faux si un contrat a son propre agent). Commentaire dans generer/route.ts.

Règles métier figées :
- qr_code_token = immutable après création (trigger 017 BEFORE UPDATE lève EXCEPTION)
- suppression dure = interdit si ≥1 intervention (garde-fou double : route + RPC)
- toute incohérence DB (taches_intervention orphelines) → la RPC PLANTE et le signale
  (pas de nettoyage silencieux — "pas de bug silencieux sur ce projet")
- double-écriture agent_prefere_id : PATCH parties_communes actif → réplique residences
- actif=false = "sommeil" ; le contrat conserve son historique et ses zones

Structure routes REST P2-11 (validée) :
- GET/POST  /api/residences/[id]/contrats
- GET/PATCH/DELETE  /api/residences/[id]/contrats/[contratId]
- (futur B6) /api/residences/[id]/contrats/[contratId]/qr
- (futur B6) /api/residences/[id]/contrats/[contratId]/dupliquer

### DETTE FINALE P2-11 (B6 terminé — à traiter)
- Supprimer /api/contrats/route.ts (ancienne route upsert mono-contrat) — débranchée.
- Supprimer components/manager/ContratModal.tsx (ancienne modal résidence-centric) — débranchée.
- Supprimer le bouton "Contrat" dans la grille nav ResidenceDetailClient.tsx (ouvre ContratModal).
- Retirer le bouton "Tâches" résidence-level (grille du haut) — crée des zones orphelines
  (contrat_id NULL). À supprimer : seul chemin restant hors contrat.
- Retirer la grille du haut (Planning/QR résidence-level) — NOTE : GARDER intentionnellement :
  · Rentabilité globale (vue agrégée de tous les contrats, légitime)
  · Rapports global (vue tous les rapports de la résidence, cohérente)
  · QR Codes multi (PDF multi-pages tous contrats actifs, utile en impression batch)
- Régler fallback agent dans generer/route.ts :
  effectiveAgentId = contrat.agent_prefere_id ?? res.agent_prefere_id
  (fallback résidence peut être faux pour un contrat avec son propre agent).
- Re-typer "Container" ALTHEA : type_contrat = 'containers' au lieu de 'parties_communes'.
  → ✅ FAIT (nettoyage base 14/07/2026, SQL Editor).
- Interventions de test ALTHEA (106 = 53×Bat A + 53×Container) → à nettoyer avant prod.
  → ✅ FAIT (nettoyage base 14/07/2026 : 366 interventions ALTHEA supprimées avec leurs
  FK — taches_intervention, photos_zone, zones_intervention, alertes. Voir « Key learnings »).
- Modal rentabilité mode global : texte "pas encore de données réelles pour ce contrat" →
  corriger en "pour cette résidence" quand contratId === null (cosmétique).
- Libellé modal rentabilité global "ce contrat" → "ces contrats" dans d'autres occurrences.
- Resserrer RLS contrats_read_agent (migration 021 — POLICY trop large : auth.uid() IS NOT NULL
  = tout utilisateur authentifié peut lire tous les contrats). Resserrer à manager_id ou
  agent attitré.
- Versioning service worker PWA (cache sert ancien code après déploiement).
  → ✅ FAIT (Item E MVP, commit `fe18e66` — `scripts/generate-sw.js`, voir section MVP JUILLET 2026).
- DETTE TRAÇABILITÉ MIGRATIONS : triggers QR (017) + migrations 018-020 existent en prod
  (SQL Editor Supabase) mais leurs fichiers locaux 018/019/020 ne correspondent pas
  exactement (vérifier que les RPC en prod matchent les fichiers). À régulariser proprement.
- Nettoyer interventions de test ALTHEA avant mise en prod réelle.
Avant suppression des fichiers : vérifier avec grep qu'aucun autre fichier ne les référence.

### Reste backend non encore basculé (après l'UI)
- Scan QR (app/agent/scan/page.tsx) ← FAIT en B6a : lit contrats_residences.qr_code_token
  (plus residences.qr_code_token). Migration 021 : agents peuvent lire contrats_residences.
- Fiche résidence : qr_code_token résidence-level conservé en base (synchronisé avec Bat A),
  mais la logique scan+PDF utilise désormais contrats_residences.qr_code_token.

Ne pas oublier de mettre à jour cette section ET le bloc "⚡ ÉTAT ACTUEL" du haut
à chaque sous-étape B livrée.

## Feature : Contrôle final agent + Commande produits (session 28 juin 2026)

### Parcours agent — nouvel écran intercalaire

Position : après validation de toutes les zones, avant envoi rapport.
Déclencheur : `peutFinaliser = zones.length > 0 && zonesCompletes >= 1`
(au moins une zone complète = tâches traitées + ≥1 photo).
Note : `toutesZonesComplete` conservé pour le badge header uniquement.

Fichier : `app/agent/intervention/[id]/controle-final/page.tsx`

Flux corrigé (3 bugs résolus) :
- Bug 1 (6879ed0) : redirect vers `/agent/planning` (inexistant) → corrigé en `/agent/dashboard`
- Bug 2 (6879ed0) : alerte `rapport_soumis` non créée → nouvelle route `POST /api/interventions/[id]/rapport`
- Bug 3 (05eade7) : `handleFinaliser` bloqué par `await supabase.update()` sur mobile réseau dégradé
  → navigation synchrone, mise à jour `statut→terminee` déplacée dans `/api/interventions/[id]/rapport`

Flux final :
  Zones validées → handleFinaliser() sync → router.push controle-final
  → [chariot photo optionnel] + [produits optionnel]
  → "Envoyer le rapport"
  → POST /commande (si signalements)
  → POST /rapport (statut terminee + heure_fin + alerte rapport_soumis)
  → router.push /agent/dashboard

### Migration 022 — tables commande produits

Tables créées (prod) :
- `produits` (id, nom, categorie, photo_url, actif, ordre)
  12 produits Archipropre pré-remplis
  RLS : lecture tous authentifiés, écriture directeur uniquement
- `commandes_produits` (id, intervention_id, agent_id, residence_id,
  contrat_id, statut en_attente/commande/livre)
- `lignes_commande` (id, commande_id, produit_id, type_ligne produit/ampoule,
  quantite, localisation, photo_avant_path, photo_apres_path)
- `photos_chariot` (id, intervention_id, agent_id, storage_path)

Buckets Storage créés :
- `photos-chariot` (privé)
- `photos-ampoules` (privé)
- `photos-produits` (PUBLIC — agents voient les photos catalogue sans auth)

### Routes API commande produits

- `GET /api/produits` — catalogue actif trié par ordre (agents)
- `POST /api/interventions/[id]/chariot` — upload photo chariot
- `POST /api/interventions/[id]/chariot-ampoule` — upload photo ampoule (retourne storage_path)
- `POST /api/interventions/[id]/commande` — crée commande + lignes + alerte `commande_produit` manager
- `POST /api/interventions/[id]/rapport` — statut terminee + heure_fin + alerte rapport_soumis
- `PATCH /api/commandes/[id]/statut` — manager met à jour en_attente→commande→livre
- `GET /api/directeur/produits` — liste catalogue (directeur)
- `POST /api/directeur/produits` — création produit (ordre auto MAX+1)
- `PATCH /api/directeur/produits/[id]` — édition partielle
- `DELETE /api/directeur/produits/[id]` — bloqué 409 si référencé dans lignes_commande
- `POST /api/directeur/produits/[id]/photo` — upload bucket photos-produits, photo_url mis à jour
- `GET /api/commandes/[id]/photos` — signed URLs photos ampoule (1h)

### Catalogue directeur — /directeur/catalogue (commit 05baddb)

- Tableau avec miniature (placeholder emoji 🧴/🧻/🪣 si photo_url null)
- Upload photo au hover (spinner pendant upload)
- Badge catégorie coloré, toggle actif/inactif en un clic
- Modal création/édition (nom requis, catégorie, ordre optionnel)
- Onglets filtre côté client : Tous / Produits / Consommables / Matériel
- DELETE 409 → message + proposition désactiver à la place
- Toasts succès/erreur bas-droite
- Entrée nav directeur : "📦 Catalogue produits" entre Rentabilité et Paramètres

### P2-9 — Passage bureau + Réappro dashboard (commits f6f4172 + 5809da0)

Migration 023 — table `passages_siege` :
  id, agent_id, manager_id, commande_id FK nullable,
  date, heure_prevue time, motif, statut (planifie/confirme/effectue/annule),
  est_livraison_manager boolean, heure_effectue timestamptz

Note : `parametres_societe.adresse_siege` ajouté (défaut '123 Rue de la Bandido, 34160 Castries')

Routes API P2-9 :
- `GET /api/manager/commandes` — commandes en_attente/commande avec lignes+agent+résidence
- `POST /api/passages-siege` — INSERT + UPDATE commande→commande + alerte passage_bureau agent
- `POST /api/passages-siege/[id]/effectuer` — statut effectue + commande→livre
  + clôture journée si plus d'interventions (UPSERT journees_agent)
  + alerte manager commande_livree
- `POST /api/ia/suggestion-passage` — claude-sonnet-4-6, contexte planning du jour,
  retourne { heure_suggeree, position, justification }, fallback 07:30 si IA indisponible

Règles métier P2-9 (figées) :
- Passage bureau en 1er RDV → heure_debut_journee = heure du passage bureau
- Passage bureau en dernier → bouton "Commande récupérée" = heure_fin journée
- Passage bureau en milieu → trajet inter-chantiers normal
- Dans tous les cas : inclus dans journees_agent.total_minutes_terrain
- est_livraison_manager=true → carte dans planning manager, PAS dans planning agent

Dashboard manager — bloc "Réapprovisionnement" (commit 5809da0) :
- Position : entre "Points d'attention" ET "Équipe aujourd'hui" (colonne gauche)
- Polling toutes les 120s
- Carte statut en_attente : bouton "Voir la commande →" → CommandeDetailDrawer
- Carte statut commande : bouton "Planifier un retrait →" + "Je livre moi-même"
  si agent.mode_deplacement ∈ {tramway, velo}
- CommandeDetailDrawer (slide-in droite 420px, pattern JourneeAgentPanel) :
  liste produits avec cases à cocher visuelles, photos ampoule signées,
  footer : PDF téléchargeable + bouton "Commande prête" (si en_attente)
- PDF préparation : jsPDF manuel, header ARCHIPROPRE, tableau produits + checkbox □,
  signalements ampoules, signature manager
  Nom fichier : preparation-[slug]-[YYYY-MM-DD].pdf
- PlanifierModal : date + heure + motif pré-rempli + bouton "🤖 Suggérer IA"
  (POST /api/ia/suggestion-passage) + toggle "Je livre moi-même"

Dashboard agent — carte passage bureau :
- Apparaît dans planning J→J+7, triée par heure avec les interventions
- Icône 📦 + "Passage au bureau" + heure + motif + adresse siège + Waze
- Bouton "Commande récupérée ✓" → POST effectuer → message clôture si dernier event

### Apprentissages session 28 juin 2026

**await réseau bloquant sur mobile :**
Un `await supabase.update()` dans un handler de navigation peut bloquer
indéfiniment sur réseau dégradé (sous-sol, parking).
→ Règle : les fonctions de navigation (router.push) doivent être synchrones.
  Déplacer les opérations DB dans la route API appelée après navigation.

**peutFinaliser vs toutesZonesComplete :**
- `toutesZonesComplete` = toutes zones (tâches + photo) → pour badge header
- `peutFinaliser` = ≥1 zone complète → pour le bouton "Valider le rapport final"
  Ne jamais utiliser toutesZonesComplete pour bloquer un bouton de navigation.

**PostgREST jointures many-to-one :**
Toujours Array.isArray() + [0] pour les FK joins (profiles, residences, etc.)
même quand on s'attend à un seul objet — PostgREST retourne toujours un array.

---

### P2-12 — Scan hors planning (spec, non implémenté — à cadrer avec Ana)
Scan QR contrat sans intervention prévue ce jour.
B6a détecte déjà + double alerte (agent + manager, alerte 'scan_hors_planning' metadata JSONB)
SANS rien autoriser (scan bloqué). À cadrer avec Ana : autorise-t-on l'intervention ?
3 postures possibles :
1. BLOQUANT : scan refusé, agent voit "Pas d'intervention prévue aujourd'hui".
2. PERMISSIF TRACÉ : crée une intervention extra, alerte manager pour validation a posteriori.
3. PERMISSIF + VALIDATION MANAGER : crée une intervention extra EN ATTENTE de validation
   (manager approuve ou refuse depuis son dashboard).
Question quelle intervention planifiée elle consomme (anticipation futur créneau →
retrait de l'origine évite double comptage) ou est-ce une extra ?
Réutiliser moteur ANA (cousin P2-10 : congés → analyse impact).

### P2-13 — Tâches partagées en binôme (spec, non implémenté — à cadrer)
Les agents se RÉPARTISSENT les tâches entre eux (confirmé Julien). PAS de synchro miroir,
mais UNE SEULE liste tâches/zones/photos PARTAGÉE. Comportement visé :
- 2 interventions restent dédoublées (charge/paie facteur 0.5).
- taches_intervention + zones_intervention + photos_zone rattachées à
  une intervention "maître" commune (ou identifiée par couple contrat+date).
- Premier agent qui coche une tâche = fait pour le binôme entier.
- Un seul rapport par intervention-résidence (pas 2 rapports quasi-identiques).
À cadrer : désignation de l'intervention "maître" (premier à scanner ?),
impact sur le rapport manager (un seul affiché ou fusion), affichage côté agent
(chaque agent voit les coches de l'autre en temps réel ?).
Tech probable : Supabase Realtime sur taches_intervention + intervention_id partagé.

### P2-14 — Contrôle géographique 200m (✅ DÉJÀ IMPLÉMENTÉ en prod)

Avant : spec non implémentée, listée comme item futur.
→ Constaté le 14 juillet 2026 : déjà en prod depuis une session précédente.

**Implémentation existante :**
- `app/agent/scan/page.tsx` (lignes ~60-81 et ~260-267) : géolocalisation demandée à
  l'ouverture de la page de scan.
- `lib/geo.ts` (fonction `distanceMetres`) : calcul Haversine `distanceMetres(geoloc, residence.lat/lng)`.
- Alerte `hors_zone` insérée dans la table `alertes` **uniquement au premier scan** si la
  distance dépasse 200 m (guard `statut='planifiee'` — pas de doublon sur les scans suivants).
- Échec/refus de géolocalisation = `catch` silencieux non bloquant : le scan s'effectue
  quand même sans contrôle géographique (dégradé gracieux).

**Confidentialité (constaté le 14/07) :** ne stocke JAMAIS la position de l'agent —
le calcul de distance se fait côté client, seuls le booléen hors-zone + la distance
approximative partent en `metadata`. La note RH transmise à l'avocat/prud'hommes décrit
ce dispositif exact (contrôle de présence sans traçage de localisation).

Aucune migration nécessaire (la colonne `type` de la table `alertes` acceptait déjà
`hors_zone`). Aucune action requise.

## MVP JUILLET 2026

**Tag de sauvegarde :** `pre-mvp-juillet2026` (visible sur origin)

**Objectif :** Sécuriser le terrain — masquer les features instables, simplifier l'UX
pour les agents sur le terrain, préparer les PWA installées à recevoir les mises à jour
automatiquement.

**Règle absolue :** on MASQUE, on ne supprime RIEN.
Réactivation d'une feature = `FEATURES.nomFlag = true` dans `lib/features.ts` + push.

### Feature flags — `lib/features.ts`

| Flag | Valeur MVP | Ce qui est masqué |
|---|---|---|
| `anaCopilote` | `false` | Bouton flottant ANA, CopilotePanel, ReorganisationPanel, alertes ANA dashboard |
| `suggestionIA` | `false` | Boutons "Obtenir une suggestion IA" (AgentAttitreModal, PlanifierModal) |
| `rentabilite` | `false` | Boutons + modal Rentabilité (fiche résidence, cartes contrat) + page /directeur/rentabilite |
| `catalogueProduits` | `false` | Nav directeur + page /directeur/catalogue |
| `commandesProduits` | `false` | Bloc Réappro dashboard, CommandeDetailDrawer, étapes chariot+produits contrôle-final agent |
| `passagesSiege` | `false` | Boutons "+ Passage siège", PlanifierModal retrait, carte passage bureau agent |
| `exportRhPdf` | `true` | Export RH mensuel — conservé actif |

`SEUIL_RETARD_SCAN_MIN = 15` (était 30 en dur dans le code).

### Bornes planning agent

Avant : aujourd'hui → J+7.
→ MVP : lundi semaine courante → dimanche semaine suivante (14 jours glissants, ancrage lundi).
Calcul via `Intl.DateTimeFormat('en-CA', { weekday: 'short' }).formatToParts()` + map ISO day.
Les jours passés s'affichent en lecture seule ; bouton Scan désactivé si !isToday (inchangé).
Fichier : `app/agent/dashboard/page.tsx` (fonctions `mondayOfWeek` / `sundayOfNextWeek`).

### Service Worker versionné

- **Avant :** next-pwa v5 installé mais NON configuré (aucun SW actif en production).
- **Approche abandonnée (commit `76a8305`) :** SW servi depuis une route API `app/api/sw/route.ts`.
  → Remplacée le 14 juillet 2026 (commit `fe18e66`) par le pattern generate-sw.js
  (aligné sur l'autre projet Next.js de Julien). Raison : script de build explicite,
  fichier `public/sw.js` standard à la racine, hooks npm — plus simple à maintenir.
- **→ MVP (approche retenue) :** `public/sw.js` généré au build par `scripts/generate-sw.js`.
  - Hooks npm `predev` + `prebuild` (`node scripts/generate-sw.js`) → régénère avant chaque
    dev/build. Vercel exécute `npm run build` donc `prebuild` se déclenche à chaque déploiement.
  - `CACHE_VERSION` = `VERCEL_GIT_COMMIT_SHA` (fallback `VERCEL_DEPLOYMENT_ID`, puis `local-<timestamp>`).
    Change à chaque déploiement → nouveau contenu SW → détection navigateur.
  - `skipWaiting()` à l'installation → activation immédiate.
  - `clients.claim()` + purge des anciens caches `archipropre-*` à l'activation.
  - `public/sw.js` est gitignoré (artefact de build régénéré par `prebuild`).
  - Client : `components/ServiceWorkerUpdater.tsx` enregistre `/sw.js` et écoute `controllerchange`.
    - Auto-reload si aucun champ de saisie actif.
    - Toast "Nouvelle version disponible — Mettre à jour" sinon.
  - next-pwa NON activé (incompatible Next.js 16 Turbopack — webpack plugin) ; reste en dépendance
    non utilisée (on ne supprime rien).

**Pour vérifier la propagation :** DevTools → Application → Service Workers → colonne "Source"
(doit afficher la nouvelle date après un déploiement Vercel) ; la valeur `CACHE_VERSION` en tête
de `public/sw.js` doit correspondre au déploiement. Ou cliquer "Update" manuellement.

### Auto-refresh dashboard manager

`components/manager/DashboardRefresh.tsx` — `useEffect` + `setInterval(router.refresh, 120_000)`.
Rafraîchit les données Server Component toutes les 2 minutes sans rechargement complet.

### Commits MVP

- **Tag** : `pre-mvp-juillet2026`
- **Item B** (feature flags) : `3f8ff99` — "mvp: feature flags — fonctionnalités hors MVP masquées"
- **Item C** (seuil 15 min + auto-refresh) : `c39e46a` — "mvp: alerte retard scan à 15 min + auto-refresh dashboard 120s"
- **Item D** (planning agent semaine courante+suivante) : `41d31d3` — "mvp: planning agent étendu semaine courante + suivante"
- **Item E** (SW versionné) : `fe18e66` — "mvp: versioning service worker (generate-sw.js) — remplace route API"
  (remplace l'approche route API `76a8305`)
- **Item F** (ce fichier) : commit suivant — "mvp: CONTEXT.md — état MVP + SW generate-sw.js + P2-14 corrigé"

### Correctifs post-MVP — masquage financier

- **Bandeau CA/Coût/Marge/Perte cachée** (fiche résidence) masqué par `FEATURES.rentabilite`.
  Le calcul KPI est **court-circuité côté serveur** (`page.tsx`) quand le flag est off :
  les chiffres ne sont même pas envoyés au client (commit `513ad06`).
- **Formule financière** (`montant ÷ taux ÷ nb`) masquée sur la page rapport manager :
  la colonne « Contractuelle » est retirée quand le flag est off, colonnes **Estimée /
  Réelle conservées** (info opérationnelle, non financière) ; durée contractuelle non
  calculée si flag off (commit `0c45597`).
- **Ligne de démarcation actée :** ce qui révèle la rentabilité Archipropre (coût interne
  23 €/h, marge, taux horaire interne) = **masqué** ; le **montant mensuel du contrat**
  (prix facturé au client) = **reste visible** côté manager.
- Note d'audit (pré-vol 15/07) : le **taux horaire de facturation** reste visible dans les
  formulaires d'admin contrat (AjoutContratModal « Base société », onglet Paramètres,
  GestionContratModal éditable). À trancher si on le considère sensible (borderline —
  c'est du pricing client, pas la marge interne).

### Item C — seuil retard scan (précision)

Passé de **30 → 15 min**. Toujours **calcul serveur au chargement** (pas d'alerte stockée
en base), + composant client `DashboardRefresh` (`router.refresh()` toutes les 120 s).

### Item D — planning agent (précision)

Bornes passées de `today→J+7` à **lundi semaine courante → dimanche semaine suivante**.
Jours passés en **lecture seule** comme les futurs ; **seul le jour J est scannable**.
Vérifié en live (pré-vol 15/07) : bornes 13→26 juillet, flèches désactivées aux bornes,
dates hors-plage ramenées à la borne.

### Item E — Service Worker (précision « avant »)

Avant : `/sw.js` renvoyait **404**, aucun versioning, le cache PWA servait l'ancien code
après déploiement. Pattern `generate-sw.js` emprunté au projet **Barns Wolf**. La route
`app/api/sw/route.ts` a été créée puis supprimée dans le même range (échafaudage).
**DETTE traçabilité SW = close.** Vérifié en live (pré-vol 15/07) : `/sw.js` → 200
`application/javascript`.

## LOT 2 — Liste résidences en tableau dense

Refonte grille de cartes → **tableau dense**. Commits : `77397fe` (tableau) + `9170efd`
(pagination) + `e62ea2f` (vérif carte).

- **6 colonnes** : Résidence + adresse / État / Type / Contrats (nb actifs, « — » sinon) /
  Agent attitré / Actions. **Ligne entière cliquable → fiche.** Hauteur 56 px,
  ~12-14 lignes/écran. **Header sticky**, tri Nom/État/Agent, badge `notes_import`
  (AlertTriangle amber, title au survol).
- **Menu ⋯** (Affectation / QR / Fiche) réutilise `AgentAttitreModal` + `downloadQRCodePDF`.
- Select « Tous statuts » **supprimé** (doublon des chips d'état), « Tous types » **conservé**.
- **Pagination 50/page** : filtrage/tri appliqués AVANT la pagination, retour page 1 au
  changement de filtre, barre masquée si ≤ 1 page.
- **Colonne Contrats = contrats ACTIFS** (choix acté : évite le bruit des 151 placeholders
  inactifs auto-créés).
- **BUG corrigé :** la colonne agent lisait `residences.agent_prefere_id` (null) au lieu de
  la source contrat → réaligné sur `_etat.nom_agent_attitre` (cohérent avec P2-11).
- **`ResidenceCard.tsx`** : composant **plus utilisé** MAIS pas orphelin — il exporte les
  types `EtatResidenceInfo` / `ResidenceEtat` importés par 4 fichiers. **NON supprimé**
  (à noter : `PlanifierInterventionModal` n'est monté que par ce composant orphelin +
  `CopilotePanel` gated → création manuelle d'intervention sans point d'entrée UI, voir dette).

## LOT 3 — Wizard config résidence + page contrat à onglets

Commits : `028f263` (checklist) + `57a4cdc` (page contrat onglets) + `ae6c6b2` (fil
d'Ariane) + `4b22daa` (fix1) + `a07af0b` (fix2).

**Checklist de configuration guidée** sur la fiche résidence (état « à configurer ») :
4 étapes numérotées avec état ✓ (fait) / • (courant) / ○ (en attente) :
① Créer le contrat → ② Zones + tâches → ③ Affecter un agent → ④ Générer le planning.
Étapes ②③④ **verrouillées** tant que ① n'est pas faite (tooltip « Créez d'abord le
contrat »). La checklist **disparaît** quand les 4 sont vertes → affichage normal.
États **calculés côté serveur** (`page.tsx`), routes existantes réutilisées, multi-contrats
= une checklist par contrat non terminé.

**Page détail contrat :** `app/manager/residences/[id]/contrats/[contratId]/page.tsx`
(Server Component, `force-dynamic`, garde-fou ownership `manager_id`). Onglets
**Planning · Tâches · Rapports · Paramètres** (pas de Rentabilité, flag off).
- **Décision architecturale (Option 1 validée) :** les onglets = **liens vers les pages
  existantes filtrées `?contratId=`**, zéro duplication de logique.
- **En-tête partagé** `components/manager/ContratHeader.tsx` (fil d'Ariane + badges
  statut/type + onglets + QR), **monté par les 4 pages** quand `?contratId=` présent.
- Onglet **Paramètres** = résumé en page + `GestionContratModal` en modal (choix sûr, pas
  de refacto du modal).
- **Carte contrat** (fiche résidence) devenue **entièrement cliquable → page contrat** ;
  boutons Planning/Tâches/Rapports/Gérer **retirés** de la carte (dans les onglets
  maintenant), seul le **QR** reste.

**Fil d'Ariane manager :** `components/manager/Breadcrumb.tsx`. Remplace les `router.back()`
qui perdaient le contexte. Format **Résidences › [Résidence] › [Contrat] › [Onglet]**,
dernier segment non cliquable.

**fix1 (`4b22daa`) — étape ④ « planning généré » :**
Avant : `step4 = ≥1 intervention FUTURE` → une résidence opérationnelle dont le dernier
planning est passé réaffichait la checklist.
→ Changé le 14/07 : `step4 = ≥1 intervention non-annulée, toutes dates confondues`
(`.neq('statut','annulee')`). Dès qu'un planning a été généré une fois, l'étape est verte.
Raison : « future » faisait « redevenir à configurer » une résidence active.

**fix2 (`a07af0b`) — double bandeau :**
En contexte contrat (`?contratId=`), les bannières internes `#0A2E5A` de `PlanningClient` /
`TachesClient` sont **masquées** (ContratHeader coiffe déjà). Infos utiles (agent, créneaux,
Régénérer) conservées sur une **barre claire** sous ContratHeader. Sans `contratId`,
bannières résidence-level inchangées.

### DETTE Lot 3 (non traitée, à noter)

- Étape ③ ne synchronise l'agent que sur le contrat **parties_communes** (via
  `/api/residences/affecter`). Contrat `containers`/`espaces_verts` : l'étape ③ ne passerait
  pas au vert par ce modal. Non bloquant (placeholder = parties_communes par défaut).
- Onglet **Paramètres** reste un **modal**, pas un formulaire 100 % en page.
- **Création manuelle d'intervention sans point d'entrée** (constaté pré-vol 15/07) :
  `PlanifierInterventionModal` n'est monté que par `ResidenceCard` (orphelin) + `CopilotePanel`
  (ANA off) → aucun bouton accessible, alors que le modal + `/api/interventions/creer-ponctuelle`
  existent. À rebrancher si la création manuelle est dans le périmètre.
  → ✅ **CORRIGÉ** (Item 1, `d03ec2d` — voir « Session corrections pré-lancement »).
- **Agent désactivé peut se connecter** (constaté pré-vol 15/07) : la garde d'auth agent ne
  vérifie pas `actif`. À cadrer.
  → ✅ **CORRIGÉ** (Item 2, `12500c4` — comptes désactivés bloqués, 3 rôles).

## Session corrections pré-lancement (15/07/2026)

**Pré-vol fonctionnel complet réalisé** : audit navigation live des 3 rôles
(agent / manager / directeur). **6 corrections livrées** (build + push par item).

- **Item 1 (`d03ec2d`) — Création manuelle d'intervention REBRANCHÉE.** Bouton
  « Nouvelle intervention » sur la fiche résidence (`ResidenceDetailClient`),
  visible si `peutPlanifier = contrats.some(c => c.actif && c.agent_prefere_id)`,
  indépendant du mode config. Ouvre le `PlanifierInterventionModal` existant
  (réutilisé, non réécrit) : date/heure/récurrence → agent **actif** scoré →
  confirmation → `POST /api/interventions`. Le point d'entrée avait disparu au
  LOT 2 (`ResidenceCard` rendu orphelin par le tableau). Vérifié en live :
  intervention créée, visible dans le planning résidence ET global.
  **LIMITE CONNUE :** le modal crée au niveau **résidence** (`contrat_id=null`),
  donc l'intervention manuelle n'apparaît PAS dans les onglets planning **par
  contrat** (qui filtrent par `contrat_id`). Acceptable MVP ; à faire évoluer
  post-lancement si besoin (rattacher la création manuelle à un contrat précis).
- **Item 2 (`12500c4`) — Comptes désactivés (`actif=false`) BLOQUÉS à la connexion, 3 rôles.**
  `signOut` + redirect `/login?error=disabled` + message « Compte désactivé.
  Contactez votre responsable. » **Nuance technique :** le `signOut` fiable se fait
  côté page login (un Server Component ne peut pas effacer le cookie d'auth de
  façon fiable) + garde dans les 3 layouts + check au submit. Raison métier :
  agent qui quitte la société = accès coupé.
- **Item 3 (`55b90bd`) — FAB « + » création résidence** (placeholder `alert`) retiré
  (création de résidence hors MVP).
- **Item 4 (`3b7d9aa`) — Bouton « Contacter »** (alertes scan manquant) : `tel:<numéro
  agent>` si dispo, masqué sinon (avant : `tel:` vide).
- **Item 5 (`cc4f5a7`) — Message planning vide clarifié :** « Aucune intervention
  d'agent actif cette semaine » quand les seules interventions de la période
  appartiennent à des agents inactifs (détection serveur via `createAdminClient`).
- **Item 6 (`1f774c7`) — Agents inactifs masqués par défaut** sur `/manager/agents`
  ET `/directeur/agents` (même composant `AgentsClient`). Filtre « Afficher/Masquer
  les inactifs (N) ». But : la directrice ne confond pas un compte désactivé
  (ex. Marie Dupont) avec un agent réel. Affichage seulement.

### Faux problèmes du pré-vol, levés

- **« Incohérence planning 0 vs 148 »** (🟠-1 du pré-vol) : **PAS un bug RLS.** Le
  « 0 » sur `/manager/planning` était un **cache RSC obsolète**. Le planning global
  affiche bien les interventions d'agent actif ; il n'exclut que les agents
  **inactifs** (voulu). Confirmé en créant une intervention d'agent actif →
  apparaît bien partout.
- **« Login agent cassé »** : levé — `agent@archipropre.fr` / `Archipropre2026`
  fonctionne (le mot de passe du brief était erroné).
- **Taux horaire de facturation visible dans les forms admin contrat : DÉCISION
  ACTÉE = on le GARDE.** C'est du pricing client (comme le montant mensuel), fixé
  par le manager, PAS de la rentabilité interne. **Ligne de démarcation confirmée :**
  rentabilité Archipropre (coût 23 €/h, marge, taux interne) **masquée** ; prix
  client (montant mensuel, taux de facturation) **visible** côté manager.

### DETTE ARCHITECTURE découverte : `interventions_planifiees`

La table `interventions_planifiees` **N'EST PAS legacy/morte** comme supposé.
Encore **lue ET écrite** :
- `app/api/planning/valider/route.ts` : lecture + écriture (SELECT/DELETE ~40-74,
  **INSERT ~133**) — flux **VALIDATION DE PLANNING** côté directeur.
- `app/directeur/planning/page.tsx:86` : lecture.
- `supabase/migrations/001_initial.sql:119` : définition + RLS.

**DEUX tables de planning coexistent** : `interventions` (parcours agent P2-11 :
scan → zones → rapport) et `interventions_planifiees` (validation directeur).
**RISQUE :** le directeur peut valider un planning dans une table que le parcours
agent ne lit pas. **NE PAS truncate/supprimer cette table.** DETTE à clarifier
post-lancement : migrer `valider/route.ts` + `directeur/planning` vers
`interventions`, OU documenter le rôle distinct de chaque table.

## CHANTIER BÂTIMENTS — ÉTAPES LIVRÉES (17 juillet 2026)

Chantier "niveau bâtiment" **terminé fonctionnellement**. Spec de référence :
`docs/CONCEPTION_BATIMENTS.md` (déposé dans le repo). Modèle final :
Résidence → Contrat → [Bâtiment = étiquette texte sur zone] → Zone → Tâche.

### Décisions de modèle (fermes)
- Bâtiment = champ texte `zones_residence.batiment` (PAS de table). 1 QR/résidence,
  pas de facturation par bâtiment → le bâtiment ne fait que regrouper les zones.
- Contrat commercial reste UNIQUE par résidence. Le « quand » (fréquence+jours)
  reste sur la TÂCHE.
- Template standard « copropriété » en code (`lib/templates/`) : 6 zones (Hall/
  Ascenseur, Palier, Escalier service, SAS/Sous-sol, Garage, Extérieur) × 5
  tâches (Toiles, Dépoussiérage, Vitres, Poubelles, Sol = protocole 5 doigts).
  Registre extensible pour futurs templates (tertiaire…) sans table.
- Durée : prorata PONDÉRÉ (coefficient par zone : normale=1, containers=0.5),
  calculé à la volée depuis le volume horaire (montant÷taux). Repli : durée
  explicite par zone si saisie (puces cliquables 5/10/15/20/30/45/60min + Auto).
- Compteur de contrôle : volume vendu/semaine vs total saisi, détail par jour,
  non bloquant si dépassement.
- Enchaînement : bâtiments d'un même jour enchaînés dans la fenêtre du créneau
  (Bât A 8h→9h30, Bât B 9h30→…).
- Saisonnier : HORS PÉRIMÈTRE, repli via multi-contrats datés.

### Migrations appliquées en prod
024 (`zones_residence.batiment TEXT NULL`), 025 (`zones_residence.coef_duree
NUMERIC DEFAULT 1`), 026 (`zones_residence.duree_minutes INTEGER NULL`), 027
(`interventions.batiment TEXT NULL`), 028 (RPC `planifier_interventions`
CREATE OR REPLACE : ajout `batiment` INSERT/SELECT + `CURRENT_DATE` →
`(now() AT TIME ZONE 'Europe/Paris')::date`, DELETE inchangé, ancienne def
documentée en commentaire pour rollback).

### Commits clés du chantier
`d96edf8` étape1 (migration batiment), `fac9278` étape2 (template code),
`f02b992` étape3 (champ batiment formulaire zone), `9d1b255` étape4 (regroupement
affichage), `75febd5` étape5 (bouton « Ajouter bâtiment standard »), `1286a0d`
étape6 (action groupée jours), `79aca9b` étape6bis (bâtiments repliables),
`d7e9325` étape7 (`lib/prorata.ts` calcul), `b70551c` étape8a (colonne coef_duree),
`0a66d52`+`cfbddc1` étape8b1/8b2 (durée par zone puces + compteur contrôle),
`dd70e12`+`45a67e0`+`2c0e29f` (polish jours : en-tête bâtiment, pré-sélection modal,
puces lisibles Lun/Ven), `41e5684` (bâtiment dans vue Par jour), `603c18e` étape8b3
(durée par zone + enchaînement génération), `ff7d43e` (**FIX date UTC génération** —
4 endroits, Europe/Paris), `7399837` étape8b4 (colonne batiment + RPC + affichage
planning manager).

### Parcours agent multi-bâtiments (sous-étapes 9)
`396ab3c` 9a (scan lit TOUTES les interventions du jour, plus `.limit(1)`),
`94ca530` 9e (démarrage global : `heure_scan`+`en_cours` sur toutes au scan),
`2be1ac1` 9b (écran niveau 1 `/agent/mission/[contratId]` : liste bâtiments du
jour), `a776294` 9c (scope zones par bâtiment → résout la fusion des zones
homonymes), `d5d8f13` 9f (validation PAR ZONE + panneau « ? » consultatif +
« signaler un problème »), `89fdd73` 9j (dashboard agent regroupé par résidence :
1 carte PRIEURE au lieu de 9, KPI comptent les missions), `d628106` 9g (bouton
« Envoyer le rapport » au niveau mission, actif quand tous bâtiments prêts —
mono-bâtiment garde le bouton sur l'écran intervention), `d6e3c9a` 9h (clôture
GROUPÉE : UPDATE toutes les interventions du jour, même heure_fin, temps
global, 1 seule alerte `rapport_soumis` avec `intervention_id=null`+metadata),
`3f51e8a` 9i (rapport manager option A : chaque page bâtiment montre ses zones +
le temps global mission + chips navigation entre bâtiments), `72a9a2f` (**FIX
reconstruction** : la boucle de reconstruction `taches_intervention` tourne sur
TOUS les bâtiments de la mission, pas juste `intersJour[0]`).

### Modèle parcours agent validé (mockup validé avec Julien)
- Scan QR → chrono démarre (temps GLOBAL résidence, un seul démarrage, jamais
  par bâtiment — sinon le 2e bâtiment hériterait du temps du 1er).
- Écran niveau 1 : liste des bâtiments du jour (cartes cliquables, état Prêt/
  À faire/En cours, compteur X/Y zones exact). Mono-bâtiment → PAS d'écran
  niveau 1, route directe vers l'intervention.
- Clic bâtiment → écran niveau 2 : zones du bâtiment, validation PAR ZONE (Photo
  + Valider), PAS tâche par tâche. Le « ? » ouvre un panneau consultatif des 5
  tâches + « signaler un problème » (réutilise `statut_tache='non_realisee'`+commentaire).
- Tous bâtiments prêts → « Envoyer le rapport » (niveau 1) → clôture toute la
  mission, 1 seul rapport résidence, temps global.
- Rapport manager : N pages (une par bâtiment, option A), chacune ses zones+photos
  + temps global mission affiché + navigation entre bâtiments.

## FEATURE : IDENTIFIANT AGENT SANS EMAIL (17 juillet 2026)
Beaucoup d'agents terrain n'ont pas d'email. Domaine technique interne
`@archipropre.local` : l'agent saisit un identifiant simple (« andre »), le système
complète en `andre@archipropre.local` de façon transparente (création, connexion,
affichage masque le suffixe). Les vrais emails (`@archipropre-services.com`)
continuent de fonctionner. Testé : André se connecte avec « andre » + mot de passe.

## FEATURE : NAVIGATION SEMAINE PAGE CHARGE (17 juillet 2026 — commit `fde35a7`)
`/manager/charge` : flèches ← → + « Semaine courante », tous les indicateurs
recalculés par semaine. **DÉCOUVERTE :** `v_charge_agent` est codée en dur sur
`date_trunc('week', CURRENT_DATE)` → impossible à filtrer sur une autre semaine.
Remplacé la dépendance à la vue par un recalcul direct de la même formule depuis
les tables sources (`interventions`, `conges`, `absences`, `profiles`), paramétré par
semaine. Recalcul vérifié identique à la vue sur la semaine courante. Bornes
lundi→dimanche en Europe/Paris (pattern noon-anchor, pas de bug UTC).

## FIX MAJEUR : double comptage temps journée agent (17 juillet 2026 — commit `bf6e47a`)

**BUG trouvé au test terrain iPhone** (impact direct PAIE/RH) : le panneau
« Journée de [agent] » (`JourneeAgentPanel`) et le calcul RH additionnaient le
temps de CHAQUE intervention. Depuis 9h, les N interventions d'une mission
multi-bâtiments partagent le même `heure_scan`/`heure_fin` (temps global) →
le total empilait N fois le même temps (PRIEURE : 9 × 3h59 = **35h51 au lieu
de 3h59**). **Aucune donnée RH corrompue avant le fix** (`journees_agent`
n'avait que 2 lignes saines, la journée PRIEURE concernée n'avait pas encore
été validée — vérifié en base avant correction).

Correction :
- `lib/journeeAgent.ts` (nouveau) : `calculerJourneeAgent()` — regroupe les
  interventions par MISSION (`contrat_id ?? id`, même critère que 9g/9h/9j),
  un segment PAR MISSION, durée comptée UNE fois, trajets inter-chantiers
  recalculés ENTRE missions (pas entre bâtiments d'une même mission).
- `GET /api/agents/[id]/journee` : utilise cette fonction — affiche
  « PRIEURE (9 bâtiments) 3h59 » au lieu de 9 lignes à 3h59 chacune.
- **GARDE-FOU serveur** `POST /api/agents/[id]/journee/valider` : ne fait
  plus confiance au total envoyé par le client — recalcule côté serveur avec
  la même fonction (`lib/journeeAgent.ts`) avant d'écrire dans
  `journees_agent` (donnée de paie). GET et validation ne peuvent plus diverger.
- `JourneeAgentPanel.tsx` : n'envoie plus les totaux au serveur (seulement
  `date` + `notes`).
- `/manager/charge`, `/manager/charge/[id]`, export RH PDF (`lib/rapportRH.ts`) :
  **non touchés** — ils relisent `journees_agent`, corrigés en cascade dès
  qu'une validation utilise le nouveau calcul.

Vérifié (simulation avec les vraies données PRIEURE du 17/07, sans écrire en
base) : PRIEURE → 1 segment, 239 min (3h59) au lieu de 2151 min (35h51) ;
témoin mono-bâtiment → résultat inchangé (non-régression) ; journée avec 2
missions distinctes le même jour → chaque mission comptée séparément (239 +
30 min) + trajet inter-missions recalculé correctement (14 min).

## FINITIONS DASHBOARD MANAGER MULTI-BÂTIMENTS (17 juillet 2026)

- **`8aab1a6`** : compteurs dashboard manager par MISSION (pas par
  intervention/bâtiment). `groupMissions()` — clé `agent_id::(contrat_id ?? id)`,
  même critère que 9g/9h/9j/journée agent. Les KPI `totalJour`/`scansEffectues`/
  `rapportsRecus` + le bloc Équipe comptent désormais des missions. André = 1
  mission PRIEURE → 1/1/1, plus 9. **Validé en prod** (capture dashboard : 1
  intervention / 1 scan / 1 rapport, André "Terminé").
  **DÉCOUVERTE :** le statut "Terminé" ne reconnaissait pas `'validee'`
  (seulement `'terminee'`) → une mission validée RH retombait en "pas encore
  scanné". Corrigé dans `statutMission()` : `'validee'` traité comme
  `'terminee'`. C'était la cause réelle du bug "pas encore scanné" observé
  après validation de journée.
  **Hors scope volontaire :** les cartes détail "scan manquant"/"rapport en
  retard" (`DashboardAlertes`) restent par intervention (savoir quel bâtiment
  précis est en retard reste une info utile).

- **`04a3467`** : alerte hors zone (scan > 200 m) enrichie. `metadata` JSONB
  point-in-time (agent_id/nom, residence_id/nom, distance_m, date, heure) à la
  création, même convention que `scan_hors_planning` (B6a). Message :
  *"André Sabatier a scanné PRIEURE à 8913 m de la résidence le 17/07 à
  16h47."* Code vérifié correct ; l'alerte de test qui paraissait non enrichie
  était simplement antérieure au déploiement du fix (le fix ne réécrit pas les
  alertes déjà émises). Alerte existante enrichie manuellement en base
  (distance recalculée depuis `interventions.geoloc_lat/lng` déjà stocké) pour
  vérification immédiate. Toute future alerte hors zone utilisera le format
  enrichi automatiquement.

## RAPPORT SYNDIC (P3-2) — LIVRÉ (17 juillet 2026)

Premier morceau de la Phase 3 (espace/rapport client). Différenciateur
commercial face à Organilogue.

### Cadrage validé avec Julien avant conception
- Rapport PAR RÉSIDENCE (fusion multi-contrats par défaut, séparable si
  demandé), sur une période (mois ou entre 2 dates).
- Deux niveaux : récap général (chiffres factuels + calendrier mensuel avec
  VRAIES DATES, jamais d'heure) + détail par bâtiment (dates de passage, zones
  traitées, photos).
- JAMAIS de %, JAMAIS de conformité chiffrée (risque d'afficher un mauvais %
  si planning jamais généré un mois donné — angle mort identifié à l'audit) :
  toujours un chiffre factuel ("41 passages réalisés").
- Tâches non réalisées : affichées SEULEMENT si commentées/justifiées par le
  manager (jamais listées brutes).
- Interdits absolus dans tout le payload/PDF/lien : durée, heure, coût, marge,
  taux horaire, montant — vérifié explicitement à chaque étape (recherche de
  `heure|duree|montant|taux|cout|marge` dans le JSON produit).
- Export : PDF (condensé, sans photos par défaut, toggle avec photos) + lien
  web sécurisé (photos toujours incluses, snapshot figé).

### Découpage livré (S1→S5)

- **S1** (commit `0e31277`) : route `GET /api/residences/[id]/rapport-syndic?debut=&fin=&contratId=`
  — payload étanche (résidence, période, `nb_passages` factuel, bâtiments avec
  `dates_passage`/`zones_traitees`/`photos`/`taches_non_realisees`). Zones
  traitées DÉRIVÉES de `taches_intervention`+`photos_zone` (règle
  `zoneComplete`), PAS de `zones_intervention` (non fiable — cas réel trouvé
  sur Bât A PRIEURE où une zone complète n'avait pas de ligne
  `zones_intervention`). Passages comptés PAR MISSION (cohérent avec le reste
  du chantier bâtiments).
- **S2** (commit `1288df6`) : page `/manager/residences/[id]/rapport-syndic`
  (UI manager), sélecteur période (mois glissant ou 2 dates), rendu selon
  mockup validé. Bouton "Rapport syndic" ajouté à la grille nav résidence.
- **S3** (commit `a4a6ed7`) : vraies photos (signed URLs générées DANS la
  route S1, jamais stockées, jamais mises en cache — cohérent avec le principe
  déjà établi ailleurs dans le projet). Toggle "Avec photos" (actif par
  défaut), état client, pilote aussi le PDF.
- **S4** (commit `008eba9`) : export PDF (`lib/rapportSyndic.ts`, même pattern
  jsPDF que `lib/rapportRH.ts`). Version CONDENSÉE (pas le détail exhaustif).
  Sans photos par défaut (léger), avec photos si toggle actif (recompressées
  côté client, canvas ~360px qualité 0.6). Accents français vérifiés au niveau
  octet (encodage WinAnsi correct). Marqueur "!" au lieu du triangle Unicode
  qui casse jsPDF (leçon déjà connue, réappliquée).
- **S5** (commit `671806b`) : lien web sécurisé, ARCHITECTURE OPTION A
  (validée par audit dédié avant implémentation) :
  - Table `rapports_syndic_liens` (migration 029) : `token` (uuid unique,
    colonne séparée de `id`, même pattern que `qr_code_token`),
    `residence_id`, `contrat_id` nullable, `periode_debut`/`fin`, `snapshot`
    JSONB (= payload S1 figé), `avec_photos`, `actif` (flag révocation),
    `created_by`, `created_at`, `revoked_at`.
  - RLS ACTIVÉE, ZÉRO POLICY anon/authenticated (deny total intentionnel) —
    tout accès passe par du code serveur (`createAdminClient` + vérifs
    explicites). Point de sécurité critique identifié à l'audit : une policy
    qui semblerait anodine (`FOR SELECT USING actif=true`) permettrait de
    LISTER tous les tokens actifs via PostgREST — à ne jamais faire.
  - Snapshot FIGÉ à la génération (photos incluses en chemin brut ; si
    `avec_photos=false`, les entrées photos sont RETIRÉES PHYSIQUEMENT du
    JSON, pas juste masquées côté affichage — défense en profondeur).
  - `lib/rapportSyndicData.ts` (nouveau) : `construireRapportSyndic()` +
    `signerPhotos()` — SEULE source de vérité, partagée par S1/création de
    lien/page publique. Aucun risque de divergence.
  - Page publique `app/rapport/[token]/page.tsx` : Server Component, PAS de
    session, résout `token`+`actif=true` AVANT tout, message générique unique
    si invalide (aucune distinction révoqué/inexistant — testé et confirmé :
    pas de faille d'énumération). `force-dynamic`, meta `noindex`. Photos
    signées à la volée UNIQUEMENT après validation du token.
  - **FIX PRÉALABLE OBLIGATOIRE** : `middleware.ts` redirigeait TOUT vers
    `/login`, y compris `/rapport/[token]` — corrigé en excluant `rapport` du
    matcher (même mécanisme que `api`/`manifest.json` déjà exclus). Sans ce
    fix, le lien n'aurait JAMAIS fonctionné pour un syndic sans compte. Fait
    en premier, avant le reste de S5.
  - Bonus non demandé mais utile : GET/PATCH liste+révocation des liens,
    exposé dans `RapportSyndicClient` ("Liens générés" + bouton Révoquer) —
    sans ça la révocation aurait été inaccessible depuis l'UI.
  - Vérifié en navigateur réel (serveur dev, sans session, car page publique
    par nature) : rendu correct + vraies signed URLs générées sans session ;
    révocation testée (`actif=false` → message générique immédiat) ; token
    aléatoire inexistant → même message générique (pas de faille
    d'énumération).

## Ordre de configuration (session Ana)

Séquence obligatoire (l'étape ③ du wizard résidence dépend des agents existants) :
1. **Paramètres société** : taux agent (coût interne) 23 €/h, taux facturation défaut
   (**à trancher 28-34 €**), adresse siège.
2. **Agents** : actif, heures contrat, mode de déplacement, adresse perso + géocodage, binômes.
   Champs tous présents/éditables dans `AgentFormModal` (accessible côté manager ET directeur).
3. **Résidences** via le wizard (checklist LOT 3).

## Key learnings — juillet 2026

### INCIDENT `is_demo` (14/07/2026) — GRAVÉ

Le flag `is_demo=true` avait été posé **à tort** sur **35 résidences** lors de l'import de
juin, dont **TOUS les vrais clients** (SCI MACJ, Home Inside, cabinets médicaux Grabels,
syndics Nexity/Richter/FDI, agences MMA…). Un `DELETE FROM residences WHERE is_demo=true`
aurait supprimé **le portefeuille client entier**. Détecté juste avant exécution en listant
les noms avant de supprimer.

→ **RÈGLE ABSOLUE :** `is_demo` n'est PAS fiable, ne **JAMAIS** l'utiliser comme critère de
suppression. Toujours `SELECT nom/adresse` **AVANT** tout `DELETE` de masse, lire la liste,
valider une par une. Correctif appliqué : `UPDATE residences SET is_demo=false WHERE
is_demo=true` (neutralisation du flag).

### Nettoyage base MVP (14/07/2026)

Exécuté en **SQL Editor** (pas de CLI Supabase) :
- **366 interventions de test ALTHEA supprimées** (+ `taches_intervention`, `photos_zone`,
  `zones_intervention`, `alertes` liées, **dans cet ordre FK**).
- Contrat **Container ALTHEA** (`4aabed0b-…`) **retypé `containers`**.
- **5 résidences de test supprimées** (Barns Wolf, Julien Barange, Lolo, Xavier Rennwald,
  Restaurant O3 — 1 contrat chacune, 0 intervention → contrat puis résidence).
- État final : **157 résidences, 0 intervention.**
- Compte test `agent@archipropre.fr` (**Marie Dupont**) **désactivé** (`actif=false`), pas
  supprimé (historique FK). Note pré-vol 15/07 : ce compte se connecte avec le mot de passe
  `Archipropre2026` (≠ Test1234!) ; il est vide (0 résidence/0 intervention) → pour une démo
  agent peuplée, utiliser Christian (inactif, à réactiver) ou affecter+générer sur Marie.

**Complément 15/07 — Marie Dupont (`agent@archipropre.fr`, id `c9ae0702-…`) :** tentative de
**suppression bloquée par FK** sur `interventions_planifiees` (158 lignes legacy). **Décision :
garder désactivé** (`actif=false`). Neutralisé fonctionnellement par **Item 2** (bloqué à la
connexion) + **Item 6** (masqué de la liste agents). Suffisant — pas de suppression forcée.

### Gouvernance post-lancement (décidée, à appliquer dès mise en prod agents)

- **Passer Supabase en Pro AVANT le lancement**, sur le projet **Archipropre
  `qszexdcyzlknokpaccnw`** (PAS Barns Wolf). Raisons : backups quotidiens + fin des
  **pauses auto Free** — le projet s'est mis en pause le **13/07** (cause du « mot de
  passe incorrect » observé). Le Free suffit en capacité (~6 % utilisé) mais pause auto
  + zéro backup = plan de dev, pas de prod.
- **Workflow branches + preview Vercel** : ne plus push direct sur `main` une fois les agents
  en prod. Dev sur branche → preview → validation → merge `main`.
- **Migrations** : jamais un jour ouvré, backup manuel avant, toujours « ajouter jamais
  casser » (double-write pour les transitions destructives).

### Autres apprentissages (15/07/2026)

- **FK cachées avant suppression :** un compte « de test » peut être référencé par des tables
  **legacy insoupçonnées** (ici `interventions_planifiees`). Toujours compter les références
  dans **TOUTES** les tables liées (`interventions`, `journees_agent`, `contrats`, `residences`,
  ET les tables legacy) avant un `DELETE` de profil. Volume inattendu → **garder désactivé**
  plutôt que forcer la suppression.
- **Cache RSC Next.js :** un « 0 intervention » en prod peut être un **cache RSC obsolète**,
  pas un bug de données. Vérifier en **SQL direct** avant de conclure à un bug RLS.
- **Christian Marquant a DEUX comptes distincts** (un rôle par compte) :
  `manager@archipropre.fr` (accès **manager**) + `marquant@archipropre-services.com`
  (rôle **agent**, id `1d46fd73-…`, actuellement `actif=false`). Reflète sa double casquette
  manager + terrain — ne pas confondre les deux comptes.

### Chantier bâtiments (17 juillet 2026)

- **Bât I de PRIEURE a une config VOULUE différente** (6 zones actives le vendredi,
  pas seulement le hall comme les 8 autres bâtiments). Ne pas « corriger ».
- **Les vérifications « en base par simulation » de Claude Code confirment la logique
  SQL mais PAS le parcours réel.** Bug reconstruction (`72a9a2f`) présent depuis 9c,
  invisible en base (on testait toujours Bât A), sorti seulement au scan iPhone
  réel de Julien. → Toujours faire un test terrain iPhone pour les parcours agent.
- **Changer signature/comportement d'une RPC :** CREATE OR REPLACE additif, signature
  identique, ne pas toucher le DELETE (partie sensible), documenter l'ancienne
  def pour rollback (fait en migration 028).
- **Réparer un état déjà cassé ≠ corriger le bug :** le fix reconstruction protège
  les futures missions, mais un rescan ne répare pas un état déjà `en_cours`+vide
  (`shouldRebuildTaches` ne se déclenche pas). PRIEURE a été réparée à la main en
  base pour permettre la vérif immédiate.
- **PIÈGE multi-bâtiments (temps réel partagé) :** tout temps RÉEL partagé entre
  interventions d'une mission (`heure_scan`/`heure_fin` identiques depuis 9h)
  doit être compté PAR MISSION (grouper par `contrat_id ?? id`), jamais par
  intervention. Le planifié (`heure_debut_prevue`/`heure_fin_prevue`, distinct
  par bâtiment) n'a PAS ce problème — à ne pas confondre lors d'un futur calcul
  sur les interventions.
- **Donnée PAIE/RH : toujours recalculer côté serveur à la validation**, ne
  jamais faire confiance à un total envoyé par le client (garde-fou). Un bug
  d'affichage ne doit jamais pouvoir corrompre une donnée de paie persistée.
- **RÈGLE GÉNÉRALE multi-bâtiments** (généralise le piège ci-dessus) : PARTOUT
  où on compte/somme quelque chose lié aux interventions (compteurs, temps,
  scans, rapports), regrouper D'ABORD par mission (`contrat_id ?? id`).
  Compter par intervention = gonfler par le nombre de bâtiments. Appliqué :
  journée agent (`bf6e47a`), dashboard agent (9j), dashboard manager (`8aab1a6`).
- **Statuts : `'validee'` doit être traité comme `'terminee'` partout où on
  teste « est-ce fini »** — la validation RH ne porte que sur des
  interventions déjà terminées, donc `'validee'` est un sur-ensemble de
  `'terminee'`, jamais un état distinct à exclure.
- **Un fix d'alerte enrichie ne réécrit pas les alertes déjà émises**
  (metadata point-in-time à la création) — toujours vérifier l'horodatage de
  l'alerte vs. celui du déploiement avant de conclure à un bug de code.

### Rapport syndic (P3-2, 17 juillet 2026)

- **`zones_intervention` n'est pas fiable à 100 % comme source de « zone
  traitée »** (peut manquer une ligne même si la zone est complète) — toujours
  dériver depuis `taches_intervention` + `photos_zone` (règle `zoneComplete`)
  pour tout rapport/export qui a besoin de savoir « cette zone a-t-elle été
  traitée ».
- **Indicateur « conformité % » envoyé à un tiers externe (syndic) :
  dangereux** si le calcul du « prévu » a un angle mort (ex. planning jamais
  généré). Préférer un chiffre factuel brut à un pourcentage qui peut mal
  représenter la réalité.
- **Page PUBLIQUE sans authentification** (nouveau pattern dans ce projet) :
  - RLS avec ZÉRO policy anon = seule architecture sûre pour une table
    consultée par token secret — une policy « innocente » peut permettre de
    lister tous les enregistrements via PostgREST.
  - Toujours vérifier le middleware global AVANT de construire une route
    publique — un middleware d'auth généraliste peut bloquer silencieusement
    une route censée être publique.
  - Snapshot figé + signature de fichiers à la volée (jamais stockée) permet
    de combiner « contenu qui ne change jamais » avec « accès fichiers qui
    expire proprement » (la révocation reste réellement effective,
    contrairement à un bucket public ou une signed URL longue durée).
  - Le message d'erreur d'un lookup par token doit être IDENTIQUE dans tous
    les cas d'échec (révoqué / inexistant / malformé) — ne jamais laisser une
    différence de message devenir un oracle d'énumération.

## À faire Phase 3

### P3-1 — Espace client (4e rôle)
Rôle 'client' avec RLS très restrictive (sa résidence uniquement).
Accès : rapports d'intervention, photos (en ligne uniquement),
tableau récapitulatif (nb interventions, nb tâches hebdo/mensuel).
JAMAIS : durées, coûts, données internes.

### P3-2 — Rapport client
Deux formats générés par le manager :
A) PDF : tâches réalisées + date, tableau récapitulatif,
   liste tâches non réalisées avec commentaire validé manager.
   Jamais de photos dans le PDF (trop lourd).
B) Lien web sécurisé (token unique, sans auth) :
   même contenu + photos consultables en ligne.
Périodicité : journalier, hebdomadaire, mensuel, trimestriel, annuel.
Pour mensuel+ : pas de photos (volume), uniquement tableaux + stats.
Envoi par email depuis l'app (SMTP ou Resend).

### P3-3 — Devis + facturation
Éditeur de devis depuis la fiche résidence.
Facturation automatique intervention ponctuelle après validation rapport.
Intégration API Qonto (factures électroniques) à évaluer.
Remplace PEGASE pour la partie facturation.

### P3-4 — Éditeur de contrat
Génération de contrat PDF depuis l'app (remplace Organilogue).
Signature électronique client.
Archivage dans Supabase Storage.

### P3-5 — Mode offline agent (PWA)
Permettre à l'agent de travailler sans réseau et synchroniser au retour.
Priorité : critique pour l'adoption terrain (perte réseau fréquente en sous-sol,
parkings, locaux techniques).

Ce qui doit fonctionner offline :
- Consultation planning J→J+7 (chargé en cache au login)
- Validation tâches par zone (stockées IndexedDB)
- Commentaires sur tâches
- Photos par zone (compressées, stockées IndexedDB en base64)
- Validation zone + envoi rapport
- Scan QR (résolution token depuis cache local)

Sync automatique au retour réseau :
- Upload photos vers Supabase Storage
- Sync statuts tâches + zones vers Supabase
- Règle conflit : le terrain prime (données agent = vérité)

UI offline :
- Bandeau "Mode hors ligne — données sauvegardées localement"
- Indicateur sync "Synchronisation en cours..." au retour réseau
- Badge sur chaque tâche validée offline en attente de sync

Tech : Service Worker + IndexedDB + Background Sync API
Contrainte : photos iPhone 3-5 Mo → compression avant stockage obligatoire

## Règles métier ajoutées

- Coût réel agent : 23 €/HT/h (frais généraux inclus)
- Prix de vente : 25 €/h (taux Base société, modifiable par directeur)
  → fourchette réelle Archipropre : 28-34 €/HT/h (à mettre à jour)
- Marge brute cible : entre 5 et 11 €/h selon le contrat
- Tâches containers : toujours isolées pour mesure rentabilité réelle

## Consultation des rapports d'intervention — vision multi-niveaux
Le rapport d'intervention (tâches réalisées + photos par zone) doit être consultable :
- MANAGER : accès complet (rapport, photos, tâches, horaires) via notification,
  fiche résidence, ou clic sur l'intervention dans le planning
- CLIENT FINAL (futur 4e rôle à créer, après agent/manager/directeur) : accès RESTREINT
  — voit uniquement le JOUR d'intervention, les tâches effectuées et les photos.
  PAS les heures, PAS les détails internes (charge, coûts). RLS très restrictive à prévoir.
Implication dès maintenant : stocker les photos rattachées proprement à
tâche + zone + intervention + date, dans un format requêtable, pour permettre
plus tard une vue client filtrée. Séparer données internes (heures) et données montrables.

Points d'accès au rapport côté manager (à implémenter en bloc C) :
1. Clic sur une intervention dans le planning → ouvre le rapport de cette intervention
2. Onglet/rubrique "Rapports" sur la fiche résidence → liste des rapports passés
3. Via les alertes (notification "rapport soumis") → déjà en cours de développement
Photos : stockées comme preuve de passage (litige client), accessibles mais
pas mises en avant dans l'interface manager au quotidien.

- Analytics directeur
- Export PDF planning par agent
- Export Excel données brutes
- Intégration facturation
- UI contrainte tramway (champ accessible_tramway créé, interface à faire)

## Architecture IA (Phase 1)
Déclencheur 1 : création contrat résidence
Input : contraintes contrat + charge des 30 agents (v_charge_agent)
Output : JSON top 3 agents avec taux après ajout + surcoût trajet + explication
Tech : Supabase Edge Function → API Anthropic claude-sonnet-4-6

Déclencheur 2 : absence/congé/maladie
Input : interventions orphelines + capacité disponible agents
Output : redistribution proposée respectant contraintes dures

## API Routes
- PATCH /api/residences/affecter
- POST /api/interventions
- PATCH /api/interventions
- PATCH /api/agents/[id]/capacite

## Modèle commercial
- Mise en place Phase 1 : 1 800 € (1 500 + 300 RGPD)
- Licence : 99 € socle + 4,50 €/site
- Archipropre : 499 €/mois (tarif lancement)
- Engagement : 12 mois minimum

## Règles métier (direction Archipropre)
- Trajets : SEULS les trajets entre résidences comptent dans le planning et la charge.
  Le trajet domicile→1re résidence et dernière résidence→domicile NE comptent PAS.
- depart_lat/lng des agents : conservés mais n'influencent PAS le calcul des horaires
  (réservés à un usage futur : choix de l'agent le plus proche pour une affectation).
- Agent sans domicile : point par défaut = siège Archipropre (à renseigner).

## Données métier Archipropre (extraites des documents Ana)

### Produits de stock (table `produits` à pré-remplir — P2-2)
Liste officielle des produits utilisés par les agents, à créer en base :

| Nom | Catégorie | Couleur/Usage |
|-----|-----------|---------------|
| Produit vitres et surfaces IGUAL | Produit | Bleu — vitres, miroirs, surfaces modernes |
| Sol 3D désinfectant/détartrant/désodorisant | Produit | Vert — sols résistants |
| Détartrage sanitaires désinfectant | Produit | Rouge — WC, lavabos, sanitaires |
| Lavette microfibre 40x40 jaune | Consommable | Jaune — surfaces modernes (hors sanitaires) |
| Lavette microfibre 40x40 bleue | Consommable | Bleue — vitres et miroirs |
| Lavette microfibre 40x40 rose/rouge | Consommable | Rouge — sanitaires uniquement |
| Sacs poubelles 30L | Consommable | — |
| Sacs poubelles 50L | Consommable | — |
| Sacs poubelles 100L | Consommable | — |
| Bobines essuie-mains | Consommable | — |
| Papier WC | Consommable | — |
| Franges de lavage microfibre | Matériel | — |

### Code couleur lavettes microfibre (IGUAL — protocole Archipropre)
- Jaune → surfaces modernes (plastiques, chromes, alu, stratifiés)
- Bleu → vitres, glaces, miroirs
- Rouge → sanitaires (WC, lavabos, douches, robinetterie)
- Vert → sols (détergent Sol Net, grès cérame)
Ce code couleur doit apparaître dans les descriptions de tâches template.

### Protocole des 5 doigts (ordre d'exécution des tâches — Archipropre)
Ordre obligatoire pour chaque intervention, du haut vers le bas, du propre vers le sale :
1. INDEX — Toiles d'araignées (zones hautes, plafonds, angles, luminaires)
2. MAJEUR — Dépoussiérage surfaces (mobilier, étagères, rebords)
3. ANNULAIRE — Traces portes et vitres (poignées, interrupteurs, vitrerie)
4. AURICULAIRE — Poubelles/vidage (corbeilles, remplacement sacs)
5. POUCE — Sol fin de prestation (aspiration + lavage adapté au revêtement)

Règle clé : toujours du haut vers le bas, du propre vers le sale, terminer par le sol.
L'ordre des tâches template dans l'app doit respecter ce protocole.

### Fiche de contrôle qualité (check-list satisfaction client — 8 points)
À intégrer comme contrôle final optionnel en fin de parcours agent (avant envoi rapport) :
1. Dépoussiérage des surfaces
2. Nettoyage des sols
3. Désinfection des sanitaires
4. Élimination des toiles d'araignées
5. Vidage des corbeilles et remplacement des sacs
6. Absence de traces sur portes, vitres et interrupteurs
7. État général des locaux
8. Respect des consignes spécifiques du site
Chaque point : Conforme / À améliorer / Non conforme + commentaire libre.
Ce document peut évoluer vers un futur rapport qualité manager/client.

### Contrats de prestation réels (données de référence)

**Contrat MACJ (Contrat N°035) :**
- Client : SCI MACJ — 8 Avenue de la Fontvin, 34970 Lattes
- Fréquence : bi-hebdomadaire (lundi + jeudi)
- Durée par passage : 1h50
- Périmètre : parties communes bâtiments A-B-C-D + espaces verts + parking
- Tâches containers : incluses (sortie containers dimanche soir + mercredi soir)
- Tarif HT mensuel : 287 € (parties communes) + 68 € (espaces verts) = 355 €/mois HT
- Durée contrat : 1 an renouvelable, date anniversaire 01/08/2016
- Paiement : factures à réception, délai 30 jours fin de mois
- Révision prix : 1er janvier chaque année

**Contrat Pradim (Réf. RP/C.22070090) :**
- Client : Groupe Pradim — 13 Rue de la Source, 34830 Clapiers
- Signé le 20 juillet 2022 par Ana Gainar
- Détail des prestations : à compléter lors de la saisie en base

**Contrat Riviera Lodge :**
- Client : Riviera Lodge
- 9 pages — détail des prestations à compléter lors de la saisie en base

### Règles métier extraites des documents

**Gestion des stocks (règlement intérieur agent) :**
- Signaler toute rupture de stock 3 jours à l'avance minimum au chef d'équipe
- Responsabilité du surdosage produits entièrement à charge de l'agent
- Dosage sol : diluer à 10% (fiches techniques fournies à l'embauche)
- Gestion serpillières/franges : lavage obligatoire minimum 1x/semaine

**Containers/poubelles :**
- Lavage + désinfection containers : 1x/semaine OBLIGATOIRE
- Désodorisation incluse
- Rangement cartons dans containers jaunes
- Gestion sacs : enlèvement petits encombrants

**Contrôle présence :**
- Obligation de signer les fiches de présence sur site (selon contrat client)
- Absence injustifiée = lettre d'avertissement

**Réunion équipe :**
- Réunion téléphonique ou présentielle chaque vendredi soir au siège
- Minimum 1x/semaine avec le chef d'équipe

**Matériel fourni par Archipropre :**
- Lavettes microfibres spécialement conçues pour surfaces modernes
- Franges de lavage microfibre
- Aspirateurs industriels
- Balais rasants (système lavage à plat)
- Produits de la gamme IGUAL / Terre Avenir (éco-labellisés)

### Espace client actuel (Organilogue — à remplacer)
Archipropre utilise actuellement Organilogue comme espace client syndic :
URL : https://archipropreservices.organilog.com/client/client-new.php
L'app Archipropre remplacera cet espace client via le rôle 'client' (P3-1).
Arguments de vente à valoriser dans l'app :
- Interventions traçables
- Historique clair
- Transparence copropriétaires
- Moins d'administratif
- Communication fluide avec le syndic

### Informations société Archipropre Services
- Forme juridique : SAS au capital de 1 000 €
- Siège social : 4 Place Alphonse Beau de Rochas, Résidence Les Rabelais, 34790 Grabels
- Adresse établissement : 8 Avenue de la Fontvin, 34970 Lattes
  (puis 123 Rue de la Bandido, 34160 Castries — adresse plus récente)
- Tél : 06 74 92 85 51 / 09 80 84 57 64
- Email : contact@archipropre-services.com / archipropre@yahoo.fr
- N° SIRET : 812 688 612 00025 (RCS Montpellier)
- N° TVA : FR45 812 688 612
- IBAN : FR76 3000 3016 1500 0200 1605 547
- Représentante légale : Ana Maria GAINAR (Directrice)
- TVA : 20%

### Corrections de données à faire en base avant livraison
- [ ] `parametres_societe.taux_horaire_facturation_defaut` : mettre à jour
      (valeur actuelle : 25 €/h — fourchette réelle Archipropre : 28-34 €/HT/h)
- [ ] Contrat MACJ : `montant_mensuel` = 355 € HT (actuellement valeur de test)
- [ ] Pré-remplir table `produits` avec les 12 produits listés ci-dessus (lors du dev P2-2)
- [ ] `parametres_societe.adresse_siege` :
      "123 Rue de la Bandido, 34160 Castries" (pour P2-9 passage au siège)

## Règles de développement
- Interface en français uniquement
- Agent : mobile-first, gros boutons, ultra simple
- Manager : responsive, desktop-first
- Directeur : desktop-first, analytique
- Charte : #0A2E5A / #1A5FA8 / #0BBFBF — Font : Inter
- export const dynamic = 'force-dynamic' sur tous les Server Components
  qui lisent des vues Supabase (sinon cache Next.js)
- PUSH AUTOMATIQUE après chaque commit (décidé 25/06) : Claude Code pousse origin/main
  immédiatement après chaque git commit, sans exception. Confirme hash + "poussé sur origin/main"
  + "déploiement Vercel déclenché". Voir Key learnings pour la raison.
- Nombres toujours arrondis côté client (Math.round)
- Calculs dans les vues SQL, jamais côté client

## Key learnings (sessions juin 2026)

### COMMIT ≠ PUSH ≠ DEPLOY (appris B2.5, renforcé B6c — 25 juin 2026)
`git commit` = local uniquement. `git push origin main` = GitHub.
Vercel deploy = déclenché par GitHub push, PAS par commit local.
Un commit absent de origin/main n'est jamais déployé.
→ Toujours vérifier `git log origin/main` après un commit critique.
→ Toujours rapporter le hash de commit ET l'URL Vercel de déploiement.

DÉCISION SUITE B6c : auto-push systématique (25 juin 2026)
Au moins 4 commits en session B6c sont restés locaux (f9b03e6, 412d10c, et d'autres plus tôt
dans la session) → prod désynchro, tests sur code obsolète, pertes de temps de diagnostic.
Règle adoptée : Claude Code pousse origin/main IMMÉDIATEMENT après chaque git commit, sans exception,
et confirme : hash + "poussé sur origin/main" + "déploiement Vercel déclenché automatiquement".
Le principe COMMIT≠PUSH≠DEPLOY reste vrai techniquement — la règle le court-circuite en pratique.

### Nettoyage interventions de test (leçon P2-11)
Les interventions créées pendant le dev (ex. tests ALTHEA) sont réelles en base.
Elles bloquent la suppression dure d'un contrat (garde-fou 409).
→ Nettoyer avec DELETE FROM interventions WHERE contrat_id='...' avant tout test de cascade.
→ Ne jamais créer d'interventions de test sur un contrat qu'on voudra supprimer ensuite.

### Noms de colonnes SQL Supabase (cas sensibles au contexte)
Les colonnes snake_case sont stables côté JS/TS (exemple : `montant_mensuel`, `type_contrat`).
Mais les noms de fonctions SQL (RPC) sont insensibles à la casse côté Supabase JS client.
→ Toujours nommer les paramètres de RPC avec le préfixe p_ (ex. `p_contrat_id`)
  pour éviter les collisions avec les variables locales PL/pgSQL.

### Types SQL à ne pas confondre (appris B6d/B6e, 25 juin 2026)
- taches_template.jours_semaine = text[] natif → utiliser ARRAY['jeudi'], PAS '["jeudi"]'::jsonb
- contrats_residences.creneaux_acceptes = JSONB → utiliser '[...]'::jsonb
- taches_template : colonne s'appelle `libelle` (pas `nom`)
- interventions : colonne date = `date_prevue` (pas `date`)

### Conditions pour générer un planning (leçon B6e)
La génération exige TOUTES ces conditions réunies sur le contrat cible :
1. creneaux_acceptes non vide ET couvrant le jour de la tâche hebdo
2. taches_template avec frequence_type='hebdo', jours_semaine matchant, duree_minutes > 0
3. zones rattachées au contrat (zone.contrat_id = contrat.id)
4. agent_prefere_id rempli sur le contrat (ou fallback résidence)
5. dates du contrat couvrant la plage de génération
Un seul manquant = 0 intervention générée (avec message d'erreur explicite).

### Changer la signature d'une fonction PostgreSQL (leçon migration 020)
CREATE OR REPLACE ne remplace QUE si la signature (types des paramètres) est identique.
Ajouter un paramètre = PostgreSQL crée une 2e fonction surchargée, l'ancienne reste appelable.
→ Toujours DROP FUNCTION IF EXISTS ancienne_signature AVANT le CREATE OR REPLACE nouvelle signature.
Format : DROP FUNCTION IF EXISTS public.ma_fonction(type1, type2);  -- ancienne
         CREATE OR REPLACE FUNCTION public.ma_fonction(type1, type2, type3) ...  -- nouvelle

### Suppression manuelle d'une zone en SQL (leçon B6d)
La FK taches_template.zone_id → zones_residence est RESTRICT (pas CASCADE).
→ Supprimer d'abord les tâches (DELETE FROM taches_template WHERE zone_id='...'),
  puis la zone (DELETE FROM zones_residence WHERE id='...').
La RPC delete_contrat_cascade gère cet ordre automatiquement pour la cascade contrat entier.

### Zones orphelines (contrat_id NULL)
Possibles si zones créées via l'ancien chemin "Tâches résidence-level" (bouton grille du haut).
Régularisées manuellement sur ALTHEA le 25/06 :
  UPDATE zones_residence SET contrat_id='4aabed0b-...' WHERE id='<zone_container_id>';
→ Cause à supprimer : retirer le bouton Tâches résidence-level en dette finale.

### RLS Supabase : FOR ALL ≠ FOR SELECT (appris B6a, 25 juin 2026)
Une policy `FOR ALL USING (manager OR directeur)` ne couvre QUE les opérations de lecture
des managers/directeurs. Les agents ne peuvent pas lire la table, même si aucune policy
"interdite" n'est explicite. Supabase retourne NULL silencieusement (pas d'erreur).
→ Ajouter une policy FOR SELECT séparée pour chaque rôle qui doit lire.
→ Tester avec le client JS authentifié en tant qu'agent (createClient(), pas createAdminClient()).
→ createAdminClient() bypasse toujours la RLS (service_role key) → ne révèle pas les bugs RLS.

### Numérotation migrations locales vs prod (appris B6a, 25 juin 2026)
Les fichiers supabase/migrations/ sont numérotés 001→021 (locaux, mnémotechniques).
La table supabase_migrations.schema_migrations en prod utilise des TIMESTAMPS comme version.
Il n'y a pas de lien automatique entre le N° de fichier et le timestamp en prod.
→ Quand on crée un fichier 017_xxx.sql mais que des migrations 017-020 ont été appliquées
  directement via SQL Editor (sans fichier), le numéro du fichier peut entrer en conflit
  avec la numérotation mentale du projet. Solution : renommer le fichier 021+ et mettre
  à jour le nom dans supabase_migrations (UPDATE SET name=... WHERE version=...).

### Cache Vercel / PWA (appris B6a, 25 juin 2026)
Une PWA iPhone installée sert l'ancien Service Worker même après un déploiement Vercel.
L'agent peut scanner et voir "QR non reconnu" alors que le code en prod est correct,
parce qu'il tourne sur le cache installé.
→ Toujours tester les fonctions scan/agent sur archipropre-app.vercel.app en Safari onglet
  normal (pas la PWA installée) pendant le dev.
→ DETTE : implémenter le versioning Service Worker pour forcer la mise à jour.
Un déploiement Vercel peut aussi rester bloqué en "Deploying outputs" malgré build réussi
→ annuler + redeploy dans le dashboard Vercel débloque.

### Alertes JSONB enrichies + dédoublonnage PostgREST (appris fix alertes, 25 juin 2026)
Stocker les LIBELLÉS (noms d'agents, de résidences, de contrats) directement dans
alertes.metadata à la création — pas d'ID seuls. Raison : évite un join supplémentaire
au render (DashboardAlertes affiche déjà al.message), et les données restent correctes
même si l'entité est renommée plus tard (point-in-time).
Pour dédoublonner sur des champs JSONB en PostgREST :
  .filter('metadata->>champ', 'eq', valeur)  ← opérateur ->> (text cast)
  .filter('metadata->champ', 'eq', '"valeur"') ← opérateur -> (JSON, avec guillemets)
Préférer ->> pour les comparaisons de scalaires (text, uuid, date).
Pattern : check avant insert (SELECT → si trouvé → skip), pas d'UPSERT ON CONFLICT
(JSONB n'a pas de contrainte UNIQUE exploitable facilement).

### Deux objets "rapport" distincts (appris B6b, 25 juin 2026)
Ne pas confondre :
- RAPPORT D'INTERVENTION (table interventions, statut terminee/validee) : 1 par contrat/jour.
  Accès : /manager/interventions/[id]/rapport. Source de vérité pour le suivi client.
- RAPPORT JOURNALIER AGENT (table journees_agent) : 1 par agent/jour, tous contrats confondus.
  Accès : charge/[id] + JourneeAgentPanel. Source de vérité pour la paie/RH.
Le composant RapportsActions ouvre JourneeAgentPanel (objet 2) — ne pas l'utiliser dans
des listes d'interventions par contrat, il y crée une confusion UX majeure.
