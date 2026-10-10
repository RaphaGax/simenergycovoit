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
- L'ancien `script.js` n'est retiré qu'après preuve d'équivalence et accord explicite.

## Architecture
- JavaScript moderne, ES Modules (`import` / `export`), pas de bundler.
- `src/core/` : fonctions de calcul pures (VROOM, CO₂, crédits). Aucun accès à
  `document`, `window`, `fetch` ou `localStorage`. N'importe ni `src/fleet/` ni `src/ui/`.
- `src/fleet/` : peut importer `src/core/`. `src/fleet/core/` est pur, le DOM est dans `src/fleet/ui/`.
- `src/ui/` (parcours utilisateurs) n'importe jamais `src/fleet/`.
- Dépendances à sens unique : `ui → state → services → core`.

## Commandes
- Tests : `npm test` (exécutant de tests intégré à Node, `node --test`, Node 18+).
