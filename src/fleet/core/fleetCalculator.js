// Calculs purs du simulateur de parc, extraits de calculate() (script.js, l. 30-97).
// Comportement conservé à l'identique, y compris l'ajustement d'arrondi qui ne corrige
// que le cas où il manque des voitures (voir distributeCars).
import { VEHICLE_PROFILES } from '../../core/emissionFactors.js';

export const LOAD_FACTORS = Object.freeze([0.25, 0.5, 0.75, 1]); // 25%, 50%, 75%, 100%

// La somme des pourcentages doit valoir 100 % (tolérance 0,1).
export function validateDistribution(percentages) {
    const totalPct = Object.values(percentages).reduce((sum, pct) => sum + pct, 0);
    return { valid: Math.abs(totalPct - 100) <= 0.1, totalPct };
}

// Nombre de voitures par type. Si l'arrondi en donne moins que totalCars,
// le reste est ajouté à l'essence ; s'il en donne plus, rien n'est corrigé.
export function distributeCars(totalCars, percentages) {
    const cars = {};
    for (const type in percentages) {
        cars[type] = Math.round((percentages[type] / 100) * totalCars);
    }
    const currentTotal = Object.values(cars).reduce((sum, n) => sum + n, 0);
    if (currentTotal < totalCars) cars.petrol += totalCars - currentTotal;
    return cars;
}

export function computeCapacity(cars, profiles = VEHICLE_PROFILES) {
    let totalSeats = 0;
    for (const type in cars) {
        totalSeats += cars[type] * profiles[type].seats;
    }
    return {
        totalSeats,
        minUsers: totalSeats * 0.25, // 25% d'occupation
        maxUsers: totalSeats // 100% d'occupation
    };
}

// Totaux par km et détail par type (les types sans voiture sont omis du détail).
export function computeFleetTotals(cars, profiles = VEHICLE_PROFILES) {
    let totalEnergy = 0, totalCO2 = 0, totalNOx = 0, totalSO2 = 0;
    const results = [];

    for (const type in cars) {
        const numCars = cars[type];
        if (numCars === 0) continue;
        const profile = profiles[type];

        totalEnergy += numCars * profile.energy; // kWh/km
        totalCO2 += numCars * profile.co2; // g/km
        totalNOx += numCars * profile.nox; // g/km
        totalSO2 += numCars * profile.so2; // g/km

        results.push({
            type,
            numCars,
            seats: profile.seats,
            energy: profile.energy,
            co2: profile.co2,
            nox: profile.nox,
            so2: profile.so2
        });
    }

    return { totalEnergy, totalCO2, totalNOx, totalSO2, results };
}

// Consommation et émissions par utilisateur pour différents taux de charge.
export function loadScenarios(totalSeats, totalEnergy, totalCO2, loadFactors = LOAD_FACTORS) {
    return loadFactors.map(charge => {
        const users = totalSeats * charge;
        return {
            charge: charge * 100,
            users,
            energy: users > 0 ? totalEnergy / users : 0,
            co2: users > 0 ? totalCO2 / users : 0
        };
    });
}

// Enchaîne les calculs comme calculate() ; renvoie { valid: false } si la répartition est invalide.
export function computeFleet({ totalCars, percentages }) {
    const distribution = validateDistribution(percentages);
    if (!distribution.valid) return { valid: false, totalPct: distribution.totalPct };

    const cars = distributeCars(totalCars, percentages);
    const capacity = computeCapacity(cars);
    const totals = computeFleetTotals(cars);
    const userConsumption = loadScenarios(capacity.totalSeats, totals.totalEnergy, totals.totalCO2);

    return { valid: true, cars, ...capacity, ...totals, userConsumption };
}
