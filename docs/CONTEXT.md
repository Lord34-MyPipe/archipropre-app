# Contexte projet Archipropre

## Projet
Application PWA Next.js de gestion d'interventions 
pour Archipropre Services (société de nettoyage, Montpellier).
URL production : https://archipropre-app.vercel.app
Repo GitHub : https://github.com/Lord34-MyPipe/archipropre-app
Dossier local Mac : ~/archipropre-app

## Stack technique
- Next.js 16 + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Auth + Storage + Realtime)
- Vercel (déploiement automatique sur push GitHub)
- Leaflet (cartes interactives)
- PWA installable sur iPhone

## Supabase
URL : https://qszexdcyzlknokpaccnw.supabase.co
Région : eu-west-3 Paris (RGPD)
Plan : Free (à passer Pro avant livraison)

## Comptes de test
- directeur@archipropre.fr / Test1234! → role: directeur
- manager@archipropre.fr / Test1234! → role: manager
- agent@archipropre.fr / Test1234! → role: agent

## IDs importants en base
- Manager test (Ciprian Onitiu) : 94562442-7f4a-4ab7-bc11-ac866275d5d7
- Agent test (Marie Dupont) : c9ae0702-02d4-45b3-aa51-4dd987184867
- Directeur test (Ana Gainar) : 49f93789-a55d-4584-92b5-917db561d4af
- Résidence Home Inside : 30d96500-6612-464a-97cc-8abcd8af3540

## Tables Supabase (15 tables)
profiles, residences, zones_residence, taches_template,
contrats_residences, plannings, interventions_planifiees,
interventions, taches_intervention, alertes,
absences, conges, tournees, tournees_etapes, distances_cache

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
✅ Scoring : +30 attitré, ±20 véhicule, +10 zones, -10/intervention
✅ Agents exclus et absents grisés dans le modal
✅ Preview tâches du jour filtrées selon jour de semaine
✅ Récurrences : ponctuelle/hebdo/bihebdo/mensuelle
✅ API routes : PATCH /api/residences/affecter + POST /api/interventions
✅ Section interventions du jour dans dashboard manager
✅ Bouton réassigner sur chaque intervention non terminée

## En cours de développement
🔄 Validation tâches avec photo obligatoire (iPhone)
🔄 Rapport final agent + envoi manager
🔄 Dashboard manager temps réel (Supabase Realtime)
🔄 Alertes 15 min (Supabase Edge Function + cron)

## À faire Phase 1
- Validation tâches avec photo (page /agent/intervention/[id])
- Rapport final agent (page /agent/rapport/[id])
- Dashboard manager temps réel (Supabase Realtime)
- Alertes 15 min (Edge Function + cron toutes les 5 min)
- Dashboard directeur KPIs de base
- Notifications push/email agents

## À faire Phase 2
- Module planning complet (calendrier + récurrences)
- Moteur matching agent/résidence avec score avancé
- MODULE IA — Réorganisation planning sur absence
- MODULE IA — Gestion retour agent après absence
- Optimisation tournées (Leaflet + OSRM)
- Analytics directeur avancés
- Export PDF planning par agent
- Export Excel données brutes
- Intégration outil facturation

## API Routes créées
- PATCH /api/residences/affecter → agent_prefere_id + agent_exclu_ids
- POST /api/interventions → création intervention(s) avec récurrence
- PATCH /api/interventions → réassignation agent

## Modèle commercial
- Mise en place Phase 1 : 1 800 € (1 500 + 300 RGPD)
- Licence mensuelle : 99 € socle + 4,50 €/site sup.
- Archipropre (150 résidences) : 499 €/mois (tarif lancement)
- Engagement : 12 mois minimum

## Règles de développement
- Tout le texte de l'interface en français
- Interface agent : mobile-first, gros boutons, ultra simple
- Interface manager : responsive, desktop-first
- Interface directeur : desktop-first, analytique
- Charte : #0A2E5A (bleu marine), #1A5FA8 (bleu), #0BBFBF (turquoise)
- Font : Inter
- Toujours pusher sur GitHub après chaque feature
- Toujours tester sur Vercel avant de valider

## Cahier des charges
CDC v3.0 disponible dans /docs/ du repo GitHub
Généré via /docs/generate-cdc.js (node docs/generate-cdc.js)
