# EcoVroom light 1.0

Simulateur de bilan énergétique d'un parc de covoiturage en Suisse : consommation, émissions
(CO₂ direct et lié au réseau électrique, NOx, SO₂), bilan annuel, économies par rapport à
l'autosolisme et empreinte de l'assistant IA.

## Démarrage

```bash
npm install     # installe uniquement jsdom (dépendance de test)
npm start       # http://127.0.0.1:3000
npm test        # tests unitaires et d'intégration (node:test)
```

Variables d'environnement : `PORT` (3000), `HOST` (127.0.0.1), `DATA_FILE` (`data/scenarios.json`).
Node.js ≥ 20 requis. Le serveur n'a aucune dépendance d'exécution.

Le dossier `public/` peut aussi être servi par n'importe quel hébergement statique : l'interface
détecte l'absence d'API, calcule alors dans le navigateur et désactive les scénarios.

## Architecture

```
public/js/core/   Moteur de calcul pur, partagé navigateur ↔ serveur
  vehicles.js       Référentiel véhicules, valeurs par défaut, hypothèses
  validation.js     Validation/normalisation des paramètres
  simulator.js      Répartition du parc, bilans par km, par charge, annuel, IA
public/js/        Interface
  api.js            Client HTTP + repli sur le calcul local
  view.js           Lecture du formulaire et rendu DOM (textContent uniquement)
  charts.js         Graphiques Chart.js (facultatifs)
  format.js         Formatage français des nombres, export CSV
  app.js            Orchestration (dépendances injectées, testable)
  main.js           Point d'entrée navigateur
server/
  app.js            API JSON + fichiers statiques (node:http)
  storage.js        Scénarios en mémoire avec persistance JSON atomique
  index.js          Lancement
tests/            node:test + jsdom
```

## API

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | État et version |
| GET | `/api/vehicles` | Référentiel, valeurs par défaut, hypothèses |
| POST | `/api/simulate` | Simulation complète (400 + `details` si invalide) |
| GET | `/api/scenarios` | Liste des scénarios (résumés) |
| POST | `/api/scenarios` | `{ name, input }` → scénario créé (201) |
| GET | `/api/scenarios/:id` | Scénario complet |
| DELETE | `/api/scenarios/:id` | Suppression (204) |

Paramètres de simulation : `totalCars` (1–100 000), `mix` (pourcentages par type, somme = 100 ± 0,1),
`aiRequests` (0–10 000), `dailyKm` (0–2 000), `daysPerYear` (1–366), `occupancy` (0,01–1).

## Hypothèses

- Mix électrique suisse : 10 g CO₂/kWh, appliqué à l'électricité consommée par les véhicules
  électriques, hybrides rechargeables (part électrique) et à hydrogène (électrolyse).
- IA : 0,02 kWh/requête × PUE datacenter 1,5.
- Autosolisme : chaque passager conduirait seul une voiture moyenne du même parc.
- Répartition des voitures par la méthode du plus fort reste (le total est toujours exact).
