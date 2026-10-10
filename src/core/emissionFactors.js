// Facteurs de consommation, d'émissions et places par motorisation.
// Copie conforme de `vehicleData` (script.js) — partagée entre le parc et les parcours utilisateurs.
// TODO: source — rattacher chaque valeur à une référence (SuisseEnergie / OFEN) avant tout usage
// pour des crédits carbone validés.
export const VEHICLE_PROFILES = Object.freeze({
    electric: Object.freeze({ energy: 0.17, co2: 0, nox: 0, so2: 0, seats: 4 }), // kWh/km, g/km
    hybridPlug: Object.freeze({ energy: 0.10 + (0.02 * 10), co2: 50, nox: 0.02, so2: 0.01, seats: 4 }), // 0.1 kWh + 0.02L
    diesel: Object.freeze({ energy: 0.54, co2: 120, nox: 0.08, so2: 0.02, seats: 5 }), // 0.054L
    petrol: Object.freeze({ energy: 0.60, co2: 140, nox: 0.06, so2: 0.01, seats: 2 }), // 0.06L
    gas: Object.freeze({ energy: 0.50, co2: 100, nox: 0.03, so2: 0.01, seats: 5 }), // 0.045kg
    hydrogen: Object.freeze({ energy: 0.33, co2: 0, nox: 0, so2: 0, seats: 4 }) // 0.01kg
});

export const VEHICLE_TYPES = Object.freeze(Object.keys(VEHICLE_PROFILES));
