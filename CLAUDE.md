# EcoVroom — Règles du projet

Application de covoiturage basée sur l'algorithme VROOM.
- Passagers : trajets 100 % gratuits (0 CHF).
- Conducteurs : récompensés par des crédits carbone validés et des partenariats RSE (Scope 3).

## Périmètre actuel
- Focus sur les parcours utilisateurs : Passager (recherche, réservation 0 CHF, confirmation)
  et Conducteur (publication, estimation CO₂, suivi des crédits carbone).
- Ne développer AUCUNE nouvelle fonctionnalité de gestion de parc ni de tableau de bord B2B/entreprise/ville.

## Code du parc automobile : à préserver
- NE PAS SUPPRIMER la logique du parc automobile : l'isoler dans `src/fleet/`.
- Tout déplacement de code du parc doit conserver le comportement à l'identique,
  y compris ses bizarreries connues ; une correction se fait dans un commit séparé et explicite.
- `tests/fleet/` contient des tests de référence : ils doivent toujours passer.
- L'ancien `script.js` a été retiré après preuve d'équivalence et accord explicite ;
  il reste consultable dans l'historique git (commit 39cf9a6).

## Architecture
- JavaScript moderne, ES Modules (`import` / `export`), pas de bundler, aucune dépendance npm.
- `src/core/` : fonctions de calcul pures (VROOM, CO₂, crédits, règles de réservation). Aucun accès à
  `document`, `window`, `fetch` ou `localStorage`. N'importe ni `src/fleet/`, ni `src/ui/`, ni `server/`.
  Partagé par le navigateur et le serveur : une règle métier s'écrit une seule fois, ici.
- `src/fleet/` : peut importer `src/core/`. `src/fleet/core/` est pur, le DOM est dans `src/fleet/ui/`.
- `src/ui/` (parcours utilisateurs) n'importe jamais `src/fleet/`.
- Dépendances à sens unique côté client : `ui → services → core`.
- `server/` : serveur Node (`node:http`, `node:sqlite`). Il importe `src/core/` (et `src/services/orsClient.js`),
  jamais `src/ui/`. Le serveur est seul juge : prix 0 CHF, places, droits d'accès, crédits.

## Serveur, données et authentification
- Données partagées en SQLite (`server/db.js`) ; aucune donnée métier dans `localStorage`.
- Comptes : e-mail + mot de passe haché (scrypt) ; session = jeton aléatoire dans un cookie
  HttpOnly SameSite=Lax, seule son empreinte SHA-256 est en base (`server/auth.js`).
- Écritures (`POST`) : corps JSON obligatoire et origine vérifiée (protection CSRF).
- Réservation : lecture des places et écriture dans une même transaction (pas de surréservation).
- Ne jamais renvoyer l'e-mail d'un autre utilisateur : seulement son prénom (`driverName`, `passengerName`).
- Une réservation n'est visible que par son passager et par le conducteur du trajet (404 sinon).

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
- Recherche passager : détour calculé par matrice ORS (`src/core/matching.js`), avec repli par nom de lieu.
- Itinéraire conducteur : problème VROOM construit et lu dans `src/core/vroom/`, appelé par le serveur
  (`POST /api/trips/:id/itinerary`) à partir des réservations confirmées en base.

## Navigation Waze
- Simple lien officiel Waze Deep Link (`https://waze.com/ul`), construit dans `src/core/navigation.js`,
  affiché par `src/ui/components/wazeButton.js`. Aucun SDK, aucune clé, aucune donnée ne revient de Waze.
- EcoVroom stocke `[longitude, latitude]` ; Waze attend `ll=latitude,longitude` : ne jamais inverser.
- Sans coordonnées fiables : recherche `q=` par adresse ; sans destination : message, jamais de lieu inventé.
- Conducteur : arrivée du trajet (tant qu'il n'est pas « effectué ») ; passager : point de rendez-vous
  (réservation confirmée, trajet pas encore parti).

## Commandes
- Tests : `npm test` (exécutant de tests intégré à Node, Node 22.13+). Les tests serveur
  (`tests/server/`) démarrent un vrai serveur sur une base en mémoire.
- Lancer en local : `npm start` puis http://localhost:8000/ (variables : `PORT`, `DATABASE_PATH`,
  `ORS_API_KEY`, `COOKIE_SECURE=1` en production derrière HTTPS).
