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

## Bugs connus à corriger
ℹ️ depart_lat/lng de Marie Dupont (agent test) à null — point par défaut siège
   à renseigner si on active un jour le choix d'agent le plus proche.
ℹ️ taches_intervention.validee (booléen) conservé en base mais plus utilisé
   → peut être supprimé lors d'une future migration de nettoyage

## À faire Phase 1 (dans l'ordre)
- Bloc C parcours agent : rapport final + envoi manager + consultation
  photos/tâches par résidence côté manager (voir aussi vision multi-niveaux
  dans Phase 2 : futur rôle client)
- Moteur IA réorganisation sur absence/congé

## À faire Phase 2
- Gestion agents spécialisés (poubelles, vitres, façades…)
- Gestion binôme solitaire sur absence (réaffecter automatiquement)
- Optimisation tournées (Leaflet + OSRM)

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
