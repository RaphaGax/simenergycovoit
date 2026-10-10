// Moteur de calcul d'EcoVroom light : fonctions pures, sans DOM ni E/S.

import { ASSUMPTIONS, VEHICLES, VEHICLE_TYPES } from './vehicles.js';
import { validateInput } from './validation.js';

export class ValidationError extends Error {
    constructor(errors) {
        super(errors.map(e => e.message).join(' '));
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

/**
 * Répartit un nombre entier de voitures selon des pourcentages
 * (méthode du plus fort reste) : le total obtenu est toujours exact.
 */
export function allocateCars(totalCars, mix) {
    const cars = Object.fromEntries(VEHICLE_TYPES.map(type => [type, 0]));
    const pctSum = VEHICLE_TYPES.reduce((sum, type) => sum + (mix[type] || 0), 0);
    if (totalCars <= 0 || pctSum <= 0) return cars;

    const remainders = [];
    let allocated = 0;
    for (const type of VEHICLE_TYPES) {
        const exact = ((mix[type] || 0) / pctSum) * totalCars;
        cars[type] = Math.floor(exact);
        allocated += cars[type];
        remainders.push({ type, rest: exact - cars[type] });
    }
    // Tri stable : à reste égal, l'ordre de VEHICLE_TYPES départage.
    remainders.sort((a, b) => b.rest - a.rest);
    for (let i = 0; allocated < totalCars; i++, allocated++) {
        cars[remainders[i % remainders.length].type] += 1;
    }
    return cars;
}

/** Consommation et émissions du parc lorsque chaque voiture parcourt 1 km. */
export function computeFleet(cars, assumptions = ASSUMPTIONS) {
    const rows = [];
    const totals = { cars: 0, seats: 0, energy: 0, gridEnergy: 0, co2Direct: 0, co2Indirect: 0, co2: 0, nox: 0, so2: 0 };

    for (const type of VEHICLE_TYPES) {
        const count = cars[type] || 0;
        if (count === 0) continue;
        const v = VEHICLES[type];
        const co2Indirect = v.gridEnergy * assumptions.gridCo2PerKwh;
        rows.push({
            type,
            label: v.label,
            count,
            seats: v.seats,
            energy: v.energy,
            co2Direct: v.co2,
            co2Indirect,
            co2: v.co2 + co2Indirect,
            nox: v.nox,
            so2: v.so2
        });
        totals.cars += count;
        totals.seats += count * v.seats;
        totals.energy += count * v.energy;
        totals.gridEnergy += count * v.gridEnergy;
        totals.co2Direct += count * v.co2;
        totals.co2Indirect += count * co2Indirect;
        totals.nox += count * v.nox;
        totals.so2 += count * v.so2;
    }
    totals.co2 = totals.co2Direct + totals.co2Indirect;
    return { rows, totals };
}

/** Consommation et émissions par utilisateur selon le taux de remplissage. */
export function computeLoadProfile(totals, loadFactors = ASSUMPTIONS.loadFactors) {
    return loadFactors.map(factor => {
        const users = totals.seats * factor;
        return {
            load: factor * 100,
            users,
            energyPerUser: users > 0 ? totals.energy / users : 0,
            co2PerUser: users > 0 ? totals.co2 / users : 0
        };
    });
}

/** Empreinte des requêtes à l'assistant IA, PUE du datacenter inclus. */
export function computeAi(requestsPerUser, users, daysPerYear, assumptions = ASSUMPTIONS) {
    const energyPerUserDay = requestsPerUser * assumptions.aiEnergyPerRequest * assumptions.datacenterPue;
    const co2PerUserDay = energyPerUserDay * assumptions.gridCo2PerKwh;
    return {
        energyPerUserDay,
        co2PerUserDay,
        energyPerYear: energyPerUserDay * users * daysPerYear,
        co2PerYearKg: (co2PerUserDay * users * daysPerYear) / 1000
    };
}

/**
 * Bilan annuel du covoiturage comparé à un scénario « autosolisme » où chaque
 * passager conduirait seul une voiture moyenne du même parc.
 */
export function computeAnnual(totals, { dailyKm, daysPerYear, occupancy }) {
    const kmPerCar = dailyKm * daysPerYear;
    const passengers = totals.seats * occupancy;
    const energy = totals.energy * kmPerCar;
    const co2Kg = (totals.co2 * kmPerCar) / 1000;

    const avgEnergyPerCar = totals.cars > 0 ? totals.energy / totals.cars : 0;
    const avgCo2PerCar = totals.cars > 0 ? totals.co2 / totals.cars : 0;
    const soloEnergy = passengers * avgEnergyPerCar * kmPerCar;
    const soloCo2Kg = (passengers * avgCo2PerCar * kmPerCar) / 1000;
    const passengerKm = passengers * kmPerCar;

    return {
        kmPerCar,
        fleetKm: totals.cars * kmPerCar,
        passengers,
        passengerKm,
        energy,
        co2Kg,
        energyPerPassengerKm: passengerKm > 0 ? energy / passengerKm : 0,
        co2PerPassengerKm: passengerKm > 0 ? (co2Kg * 1000) / passengerKm : 0,
        solo: { energy: soloEnergy, co2Kg: soloCo2Kg },
        savings: {
            energy: soloEnergy - energy,
            co2Kg: soloCo2Kg - co2Kg,
            energyPct: soloEnergy > 0 ? ((soloEnergy - energy) / soloEnergy) * 100 : 0,
            co2Pct: soloCo2Kg > 0 ? ((soloCo2Kg - co2Kg) / soloCo2Kg) * 100 : 0
        }
    };
}

/**
 * Point d'entrée : valide l'entrée brute puis calcule le bilan complet.
 * @throws {ValidationError} si l'entrée est invalide
 */
export function simulate(rawInput, assumptions = ASSUMPTIONS) {
    const { valid, errors, value: input } = validateInput(rawInput);
    if (!valid) throw new ValidationError(errors);

    const cars = allocateCars(input.totalCars, input.mix);
    const { rows, totals } = computeFleet(cars, assumptions);
    const annual = computeAnnual(totals, input);

    return {
        input,
        cars,
        rows,
        totals,
        users: { min: totals.seats * assumptions.loadFactors[0], max: totals.seats },
        loadProfile: computeLoadProfile(totals, assumptions.loadFactors),
        annual,
        ai: computeAi(input.aiRequests, annual.passengers, input.daysPerYear, assumptions),
        assumptions
    };
}
