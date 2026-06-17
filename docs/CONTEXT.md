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
- Trajets estimés provisoirement à 20% du nettoyage (à remplacer par OSRM)
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
✅ Intégration OSRM temps de trajet réel (router.project-osrm.org)
   — lib/trajet.ts : calculerTrajet + lireCacheTrajet + fallback 20%
   — Cache Supabase distances_cache (lat/lng + mode, index spatial)
   — Mode tramway : profil foot OSRM + forfait_tram paramétrable
   — Réchauffage cache domicile→résidence à la génération de planning
   — Copilote IA : trajets réels inter-résidences injectés dans le contexte

## Bugs connus à corriger
🐛 Agents démo à 0% sur /manager/charge (pas d'interventions assignées)
   → injecter interventions de test pour valider les couleurs

## À faire Phase 1 (dans l'ordre)
1. Tester et affiner le copilote IA (qualité des réponses, edge cases)
2. Interventions de test sur agents démo (valider barres de charge colorées)
3. Page /manager/charge/[agentId] — détail hebdomadaire, liste interventions, congés
4. Moteur IA réorganisation sur absence/congé
   → interventions orphelines + capacité disponible agents
5. Validation tâches avec photo obligatoire (iPhone)
6. Rapport final agent + envoi manager
7. Dashboard manager temps réel (Supabase Realtime)
8. Alertes 15 min (Edge Function + cron)
9. Dashboard directeur KPIs

## À faire Phase 2
- Gestion agents spécialisés (poubelles, vitres, façades…)
- Gestion binôme solitaire sur absence (réaffecter automatiquement)
- Optimisation tournées (Leaflet + OSRM)
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

## Règles de développement
- Interface en français uniquement
- Agent : mobile-first, gros boutons, ultra simple
- Manager : responsive, desktop-first
- Directeur : desktop-first, analytique
- Charte : #0A2E5A / #1A5FA8 / #0BBFBF — Font : Inter
- export const dynamic = 'force-dynamic' sur tous les Server Components
  qui lisent des vues Supabase (sinon cache Next.js)
- Toujours pusher sur GitHub + tester sur Vercel
- Nombres toujours arrondis côté client (Math.round)
- Calculs dans les vues SQL, jamais côté client
