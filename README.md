# EcoVroom

Covoiturage durable : trajets **gratuits pour les passagers (0 CHF)**, conducteurs récompensés par des
**crédits carbone**. Les itinéraires et l'ordre des prises en charge sont calculés avec
[openrouteservice](https://openrouteservice.org) et l'algorithme d'optimisation VROOM.

## Démarrer

Prérequis : Node.js 22.13 ou plus récent. Aucune dépendance à installer.

```sh
npm start          # http://localhost:8000/
npm test           # tests unitaires et tests de l'API
```

Variables d'environnement du serveur :

| Variable | Rôle | Par défaut |
|---|---|---|
| `PORT` | Port d'écoute | `8000` |
| `DATABASE_PATH` | Fichier SQLite | `data/ecovroom.db` |
| `ORS_API_KEY` | Clé openrouteservice (suggestions de lieux, distances, itinéraires) | absente : fonctions désactivées |
| `COOKIE_SECURE` | `1` pour réserver le cookie de session à HTTPS (obligatoire en production) | absent |

Exemple : `ORS_API_KEY=… npm start`.

## Organisation

- `src/core/` : règles métier pures (CO₂, crédits, réservation, VROOM), partagées par le navigateur et le serveur.
- `src/ui/`, `src/main.js` : application passager et conducteur (`index.html`).
- `src/services/` : client de l'API et client openrouteservice.
- `server/` : serveur HTTP, base SQLite, authentification.
- `src/fleet/`, `fleet.html` : simulateur de parc automobile (conservé, hors parcours utilisateurs).

## En production

- Servir derrière HTTPS (proxy inverse) avec `COOKIE_SECURE=1`.
- Sauvegarder régulièrement le fichier SQLite (`DATABASE_PATH`).
- Le module `node:sqlite` est encore marqué expérimental par Node : pour une forte charge,
  migrer `server/db.js` vers PostgreSQL (seul ce fichier accède à la base).
