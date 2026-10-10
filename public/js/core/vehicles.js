// Données de référence des véhicules et hypothèses du modèle.
// Module partagé entre le navigateur et le serveur : aucune dépendance au DOM ni à Node.

// energy      : énergie finale consommée (kWh/km)
// gridEnergy  : part de cette énergie tirée du réseau électrique (kWh/km)
// co2/nox/so2 : émissions directes à l'échappement (g/km)
// seats       : nombre de places disponibles pour le covoiturage
export const VEHICLES = Object.freeze({
    electric: Object.freeze({
        label: 'Électrique', energy: 0.17, gridEnergy: 0.17,
        co2: 0, nox: 0, so2: 0, seats: 4, color: '#36A2EB'
    }),
    hybridPlug: Object.freeze({
        // 0,10 kWh électriques + 0,02 L de carburant (~10 kWh/L)
        label: 'Hybride rechargeable', energy: 0.10 + 0.02 * 10, gridEnergy: 0.10,
        co2: 50, nox: 0.02, so2: 0.01, seats: 4, color: '#FFCE56'
    }),
    diesel: Object.freeze({
        // 0,054 L/km
        label: 'Diesel', energy: 0.54, gridEnergy: 0,
        co2: 120, nox: 0.08, so2: 0.02, seats: 5, color: '#FF6384'
    }),
    petrol: Object.freeze({
        // 0,06 L/km
        label: 'Essence', energy: 0.60, gridEnergy: 0,
        co2: 140, nox: 0.06, so2: 0.01, seats: 2, color: '#4BC0C0'
    }),
    gas: Object.freeze({
        // 0,045 kg/km
        label: 'Gaz naturel', energy: 0.50, gridEnergy: 0,
        co2: 100, nox: 0.03, so2: 0.01, seats: 5, color: '#9966FF'
    }),
    hydrogen: Object.freeze({
        // 0,01 kg/km, hydrogène produit par électrolyse
        label: 'Hydrogène', energy: 0.33, gridEnergy: 0.33,
        co2: 0, nox: 0, so2: 0, seats: 4, color: '#FF9F40'
    })
});

export const VEHICLE_TYPES = Object.freeze(Object.keys(VEHICLES));

// Répartition par défaut du parc (%)
export const DEFAULT_MIX = Object.freeze({
    electric: 20.9,
    hybridPlug: 9.2,
    diesel: 14.1,
    petrol: 55.8,
    gas: 0,
    hydrogen: 0
});

export const DEFAULT_INPUT = Object.freeze({
    totalCars: 100,
    mix: DEFAULT_MIX,
    aiRequests: 10,
    dailyKm: 30,
    daysPerYear: 220,
    occupancy: 0.5
});

export const ASSUMPTIONS = Object.freeze({
    gridCo2PerKwh: 10,         // g CO2/kWh, mix électrique suisse
    aiEnergyPerRequest: 0.02,  // kWh/requête (hors refroidissement)
    datacenterPue: 1.5,        // Power Usage Effectiveness du datacenter
    loadFactors: Object.freeze([0.25, 0.5, 0.75, 1]),
    pctTolerance: 0.1          // tolérance sur la somme des pourcentages
});
