# EcoVroom — Règles du projet

Application de covoiturage basée sur l'algorithme VROOM.
- Passagers : trajets 100 % gratuits (0 CHF).
- Conducteurs et passagers (des « aventuriers ») : récompensés par des VroomPoints, la gamification est un point fort.
- Pas encore de certification carbone : l'interface ne parle JAMAIS de « crédits carbone ». Les VroomPoints
  pourront plus tard être reliés à de vrais crédits (partenariats RSE, Scope 3) : le CO₂ évité exact reste
  enregistré trajet par trajet (table `credits`, `src/core/carbonCredits.js`, usage interne uniquement).

## Périmètre actuel
- Focus sur les parcours utilisateurs : Passager (recherche, réservation 0 CHF, confirmation)
  et Conducteur (publication, estimation CO₂), avec les VroomPoints (`#/vroompoints`).
- Ne développer AUCUNE nouvelle fonctionnalité de gestion de parc ni de tableau de bord B2B/entreprise/ville.

## Code du parc automobile : à préserver
- NE PAS SUPPRIMER la logique du parc automobile : l'isoler dans `src/fleet/`.
- Tout déplacement de code du parc doit conserver le comportement à l'identique,
  y compris ses bizarreries connues ; une correction se fait dans un commit séparé et explicite.
- `tests/fleet/` contient des tests de référence : ils doivent toujours passer.
  Ils calculent avec les facteurs d'origine figés (`LEGACY_VEHICLE_PROFILES`) pour prouver que la logique
  est inchangée ; le simulateur, lui, utilise les facteurs officiels courants (`VEHICLE_PROFILES`).
- L'ancien `script.js` a été retiré après preuve d'équivalence et accord explicite ;
  il reste consultable dans l'historique git (commit 39cf9a6).

## Facteurs d'émission et de consommation
- Source unique et officielle : OFEN, voitures de tourisme neuves (rapport 2025, tableau 1 ; gaz naturel :
  rapport 2024), dans `src/core/emissionFactors.js` (CO₂, énergie) et `src/core/consumption.js`, partagés par
  l'application et le simulateur. Référence des VroomPoints : voiture à essence neuve, 146,1 g CO₂/km.
  Toute nouvelle valeur cite sa source ; une seule source appliquée de façon cohérente (pas de valeur choisie au cas par cas).

## Architecture
- JavaScript moderne, ES Modules (`import` / `export`), pas de bundler, aucune dépendance npm.
- `src/core/` : fonctions de calcul pures (VROOM, CO₂, VroomPoints, crédits, règles de réservation). Aucun accès à
  `document`, `window`, `fetch` ou `localStorage`. N'importe ni `src/fleet/`, ni `src/ui/`, ni `server/`.
  Partagé par le navigateur et le serveur : une règle métier s'écrit une seule fois, ici.
- `src/fleet/` : peut importer `src/core/`. `src/fleet/core/` est pur, le DOM est dans `src/fleet/ui/`.
- `src/ui/` (parcours utilisateurs) n'importe jamais `src/fleet/`.
- Dépendances à sens unique côté client : `ui → services → core`.
- `server/` : serveur Node (`node:http`, `node:sqlite`). Il importe `src/core/` (et `src/services/orsClient.js`),
  jamais `src/ui/`. Le serveur est seul juge : prix 0 CHF, places, droits d'accès, VroomPoints.

## Serveur, données et authentification
- Données partagées en SQLite (`server/db.js`) ; aucune donnée métier dans `localStorage`.
- Comptes : e-mail + mot de passe haché (scrypt) ; session = jeton aléatoire dans un cookie
  HttpOnly SameSite=Lax, seule son empreinte SHA-256 est en base (`server/auth.js`).
- Écritures (`POST`) : corps JSON obligatoire et origine vérifiée (protection CSRF).
- Réservation : lecture des places et écriture dans une même transaction (pas de surréservation).
- Adresse du visiteur (limites de tentatives) : `clientIp()` dans `server/http.js`. Ne jamais lire
  `X-Forwarded-For` depuis la gauche (valeur falsifiable) ; seulement `TRUST_PROXY_HOPS` positions
  depuis la fin. 0 par défaut (en-tête ignoré), 1 sur Render.
- Ne jamais renvoyer l'e-mail d'un autre utilisateur : seulement son prénom (`driverName`, `passengerName`).
- Une réservation n'est visible que par son passager et par le conducteur du trajet (404 sinon).
- VroomPoints (`src/core/vroomPoints.js`, `GET /api/me/points`, calculés à la volée) : des « points »,
  jamais des crédits carbone. Il faut un conducteur et au moins un passager confirmé, et 3 km minimum.
  Production = CO₂ réellement évité par les passagers confirmés, en kg (`co2AvoidedForBooking`, détour
  déduit) : proportionnelle au remplissage, JAMAIS de bonus (le total doit rester auditable).
  Partage : part du conducteur selon les sièges occupés de la voiture (passagers EcoVroom + famille ou
  marchandise déclarées, `carSeats`/`otherOccupiedSeats`) : 50 % pour 1 siège occupé, 80 % voiture pleine,
  paliers réguliers ; reste aux passagers au prorata des places. Arrondi à l'entier le plus proche, sans
  minimum. Niveaux Explorateur, Éclaireur (25), Pionnier (150), Légende (500). Acquis après double confirmation.
- Consommation et émissions affichées à la publication, même sans passager (pédagogique, `src/core/consumption.js`) :
  valeurs officielles OFEN (voitures neuves, rapport 2025, tableau 1), source citée dans le code et à l'écran.
- Double confirmation (VroomPoints et registre interne de CO₂). Le conducteur confirme le trajet effectué, chaque passager
  confirme ou conteste dans les 7 jours (`src/core/tripProof.js`). Seules les places confirmées par
  leur passager comptent ; soumission possible quand toutes les réponses sont arrivées ou le délai
  passé (`isSubmittable`). Une entrée soumise ou validée n'est jamais recalculée.
- Annulation d'un trajet par son conducteur, avant le départ seulement (`src/core/tripCancellation.js`,
  `POST /api/trips/:id/cancel`) : trajet marqué `cancelledAt`, retiré de la recherche, réservations annulées,
  chaque passager prévenu par e-mail (prénom du conducteur seulement) et dans l'application. Un compte avec
  des passagers sur un trajet à venir ne peut être supprimé qu'après l'annulation de ces trajets.
- Base : une colonne ajoutée après coup se déclare dans `ADDED_COLUMNS` (`server/db.js`), migrée
  à l'ouverture des bases existantes.
- Compte : changement de mot de passe et suppression exigent le mot de passe actuel ; tout nouveau
  mot de passe ferme les sessions et invalide les liens de réinitialisation.
- Mot de passe oublié : jeton aléatoire à usage unique (30 min), seule son empreinte est en base ;
  même réponse que l'e-mail existe ou non ; lien construit avec `PUBLIC_URL`/`RENDER_EXTERNAL_URL`,
  jamais avec l'en-tête Host. Désactivé sans expéditeur (`server/mailer.js`).
- Suppression de compte (nLPD/RGPD) : anonymisation de l'utilisateur (e-mail, prénom, mot de passe),
  points de prise en charge effacés, réservations à venir annulées, trajets à venir sans passager
  supprimés ; refusée si un trajet à venir a des passagers. L'historique partagé reste.

## Points d'entrée
- `server/server.js` : serveur HTTP (API `/api/*` et fichiers publics : `index.html`, `fleet.html`,
  `styles.css`, `src/`). Rien d'autre n'est servi (ni `server/`, ni la base, ni les tests).
- `index.html` → `src/main.js` : application utilisateur (routes par hash, `src/ui/router.js`,
  route `{ auth: true }` = connexion requise).
- `fleet.html` → `src/fleet/main.js` : simulateur de parc, non relié à l'application utilisateur.
- Les sorties de l'ancien `script.js` sont figées dans `tests/fixtures/legacyFleetOutputs.json`.

## openrouteservice (ORS) et VROOM
- Clé dans la variable d'environnement `ORS_API_KEY` du serveur, jamais dans le navigateur ni dans git.
  Sans clé, l'application fonctionne sans géocodage ni itinéraires.
- Le navigateur passe par le serveur (`/api/ors/*`, connexion requise, entrées validées, débit limité) ;
  appels ORS uniquement dans `src/services/orsClient.js`, utilisé côté serveur.
- Recherche passager : détour calculé par matrice ORS (`src/core/matching.js`, 40 min maximum, affiché),
  avec repli par nom de lieu. Suggestions ORS en français et sans districts ni régions.
  Un lieu tapé sans choisir de suggestion est localisé avec la première suggestion (`placeInput.resolve`).
- Itinéraire conducteur : problème VROOM construit et lu dans `src/core/vroom/`, appelé par le serveur
  (`POST /api/trips/:id/itinerary`) à partir des réservations confirmées en base.

## Navigation Waze
- Simple lien officiel Waze Deep Link (`https://waze.com/ul`), construit dans `src/core/navigation.js`,
  affiché par `src/ui/components/wazeButton.js`. Aucun SDK, aucune clé, aucune donnée ne revient de Waze.
- EcoVroom stocke `[longitude, latitude]` ; Waze attend `ll=latitude,longitude` : ne jamais inverser.
- Sans coordonnées fiables : recherche `q=` par adresse ; sans destination : message, jamais de lieu inventé.
- Conducteur : arrivée du trajet (tant qu'il n'est pas « effectué ») ; passager : point de rendez-vous
  (réservation confirmée, trajet pas encore parti).

## Design
- D'après la maquette mobile du développeur (colibri vert → bleu) : en-tête blanc avec logo
  (`src/ui/assets/`), bandeaux en dégradé `#33873D → #0880B0` (`components/pageHero.js`), cartes blanches
  arrondies (24 px), bouton vert `#2F8238` (conducteur) et bleu `#0A78B0` (parcours passager, `.theme-passenger`),
  icônes au trait en SVG inline (`components/icons.js`), barre d'onglets en bas sur mobile (`index.html`, `.tab-bar`).
- Textes blancs et petits textes : contraste ≥ 4,5:1 ; teintes vives `#3D9A44`/`#219DD8` réservées au décor.
- Police système, aucune ressource externe. Aucun chiffre ni avis inventé (prix toujours 0 CHF, avatars = initiale).
- Styles dans `src/ui/app.css`, limités à `body.app` : `styles.css` et `fleet.html` gardent l'apparence d'origine.

## Commandes
- Tests : `npm test` (exécutant de tests intégré à Node, Node 22.13+). Les tests serveur
  (`tests/server/`) démarrent un vrai serveur sur une base en mémoire.
- Lancer en local : `npm start` puis http://localhost:8000/ (variables : `PORT`, `DATABASE_PATH`,
  `ORS_API_KEY`, `COOKIE_SECURE=1` en production derrière HTTPS, `TRUST_PROXY_HOPS`,
  `RESEND_API_KEY` + `MAIL_FROM` ou `MAIL_TRANSPORT=console`, `PUBLIC_URL`).
