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
- JavaScript moderne, ES Modules (`import` / `export`), pas de bundler.
- `src/core/` : fonctions de calcul pures (VROOM, CO₂, crédits). Aucun accès à
  `document`, `window`, `fetch` ou `localStorage`. N'importe ni `src/fleet/` ni `src/ui/`.
- `src/fleet/` : peut importer `src/core/`. `src/fleet/core/` est pur, le DOM est dans `src/fleet/ui/`.
- `src/ui/` (parcours utilisateurs) n'importe jamais `src/fleet/`.
- Dépendances à sens unique : `ui → state → services → core`.

## Points d'entrée
- `index.html` → `src/main.js` : application utilisateur (routes par hash, `src/ui/router.js`).
- `fleet.html` → `src/fleet/main.js` : simulateur de parc, non relié à l'application utilisateur.
- Les sorties de l'ancien `script.js` sont figées dans `tests/fixtures/legacyFleetOutputs.json`.

## openrouteservice (ORS) et VROOM
- Clé dans `src/config.local.js` (ignoré par git, modèle : `src/config.local.example.js`).
  Ne jamais versionner de clé. Sans clé, l'application fonctionne sans géocodage ni itinéraires.
- Appels réseau uniquement dans `src/services/orsClient.js` ; tests avec un `fetch` simulé.
- Recherche passager : détour calculé par matrice ORS (`src/core/matching.js`), avec repli par nom de lieu.
- Itinéraire conducteur : problème VROOM construit et lu dans `src/core/vroom/` (ORS `/optimization`).

## Commandes
- Tests : `npm test` (exécutant de tests intégré à Node, `node --test`, Node 20+).
- Lancer en local : `python3 -m http.server` puis http://localhost:8000/ (les modules ES ne
  fonctionnent pas en `file://`).
