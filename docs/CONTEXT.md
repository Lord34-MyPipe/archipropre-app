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

## Bugs connus à corriger
ℹ️ depart_lat/lng de Marie Dupont (agent test) à null — point par défaut siège
   à renseigner si on active un jour le choix d'agent le plus proche.
ℹ️ taches_intervention.validee (booléen) conservé en base mais plus utilisé
   → peut être supprimé lors d'une future migration de nettoyage
ℹ️ Données de test à nettoyer avant mise en production :
   - 10 comptes demo_ à supprimer
   - Contrat MACJ : montant_mensuel = 355 € HT (valeur de test actuellement)
   - taux_horaire_facturation_defaut : mettre à jour (actuellement 25 €/h)

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
- Toujours pusher sur GitHub + tester sur Vercel
- Nombres toujours arrondis côté client (Math.round)
- Calculs dans les vues SQL, jamais côté client
