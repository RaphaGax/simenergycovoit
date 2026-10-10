import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    allocateCars, computeAi, computeAnnual, computeFleet, computeLoadProfile, simulate, ValidationError
} from '../public/js/core/simulator.js';
import { ASSUMPTIONS, DEFAULT_INPUT, VEHICLE_TYPES, VEHICLES } from '../public/js/core/vehicles.js';

const approx = (actual, expected, eps = 1e-9) =>
    assert.ok(Math.abs(actual - expected) < eps, `attendu ${expected}, obtenu ${actual}`);

const onlyMix = (type) => Object.fromEntries(VEHICLE_TYPES.map(t => [t, t === type ? 100 : 0]));
const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);

describe('référentiel véhicules', () => {
    it('la répartition par défaut fait 100 %', () => {
        approx(sum(DEFAULT_INPUT.mix), 100);
    });

    it('chaque véhicule a des données cohérentes', () => {
        for (const type of VEHICLE_TYPES) {
            const v = VEHICLES[type];
            assert.ok(v.seats > 0, type);
            assert.ok(v.energy > 0, type);
            assert.ok(v.gridEnergy >= 0 && v.gridEnergy <= v.energy, type);
        }
    });

    it('les données sont immuables', () => {
        assert.throws(() => { VEHICLES.electric.seats = 99; }, TypeError);
    });
});

describe('allocateCars', () => {
    it('répartit le parc par défaut selon la méthode du plus fort reste', () => {
        assert.deepEqual(allocateCars(100, DEFAULT_INPUT.mix), {
            electric: 21, hybridPlug: 9, diesel: 14, petrol: 56, gas: 0, hydrogen: 0
        });
    });

    it('le total est toujours exact, même quand l’arrondi simple déborderait', () => {
        // Arrondi simple : 3 × round(1,666…) = 6 voitures pour 5. Le plus fort reste corrige.
        const mix = { electric: 33.3, diesel: 33.3, petrol: 33.4 };
        for (const total of [1, 2, 5, 7, 99, 101, 12345]) {
            assert.equal(sum(allocateCars(total, mix)), total, `total ${total}`);
        }
    });

    it('n’attribue jamais de voiture à un type à 0 %', () => {
        const cars = allocateCars(7, { electric: 50, diesel: 50 });
        assert.equal(cars.petrol, 0);
        assert.equal(cars.electric + cars.diesel, 7);
    });

    it('normalise une somme légèrement différente de 100 %', () => {
        assert.equal(sum(allocateCars(10, { electric: 49.95, diesel: 50 })), 10);
    });

    it('renvoie zéro partout pour un parc vide ou une répartition nulle', () => {
        assert.equal(sum(allocateCars(0, DEFAULT_INPUT.mix)), 0);
        assert.equal(sum(allocateCars(10, {})), 0);
    });
});

describe('computeFleet', () => {
    it('calcule les totaux du parc par défaut', () => {
        const { rows, totals } = computeFleet({ electric: 21, hybridPlug: 9, diesel: 14, petrol: 56, gas: 0, hydrogen: 0 });
        assert.equal(rows.length, 4, 'les types absents sont omis');
        assert.equal(totals.cars, 100);
        assert.equal(totals.seats, 21 * 4 + 9 * 4 + 14 * 5 + 56 * 2);
        approx(totals.energy, 21 * 0.17 + 9 * 0.30 + 14 * 0.54 + 56 * 0.60);
        approx(totals.co2Direct, 9 * 50 + 14 * 120 + 56 * 140);
        approx(totals.co2Indirect, (21 * 0.17 + 9 * 0.10) * ASSUMPTIONS.gridCo2PerKwh);
        approx(totals.co2, totals.co2Direct + totals.co2Indirect);
        approx(totals.nox, 9 * 0.02 + 14 * 0.08 + 56 * 0.06);
        approx(totals.so2, 9 * 0.01 + 14 * 0.02 + 56 * 0.01);
    });

    it('attribue aux électriques un CO2 indirect lié au réseau', () => {
        const { rows } = computeFleet({ electric: 1 });
        assert.equal(rows[0].co2Direct, 0);
        approx(rows[0].co2Indirect, 0.17 * 10);
        assert.equal(rows[0].label, 'Électrique');
    });

    it('accepte des hypothèses personnalisées', () => {
        const { totals } = computeFleet({ electric: 10 }, { ...ASSUMPTIONS, gridCo2PerKwh: 100 });
        approx(totals.co2, 10 * 0.17 * 100);
    });
});

describe('computeLoadProfile', () => {
    it('divise énergie et CO2 par le nombre d’utilisateurs', () => {
        const profile = computeLoadProfile({ seats: 40, energy: 8, co2: 400 }, [0.25, 1]);
        assert.deepEqual(profile.map(p => p.load), [25, 100]);
        assert.deepEqual(profile.map(p => p.users), [10, 40]);
        approx(profile[0].energyPerUser, 0.8);
        approx(profile[1].co2PerUser, 10);
    });

    it('évite la division par zéro', () => {
        const [p] = computeLoadProfile({ seats: 0, energy: 5, co2: 5 }, [0.5]);
        assert.equal(p.energyPerUser, 0);
        assert.equal(p.co2PerUser, 0);
    });
});

describe('computeAi', () => {
    it('applique le PUE du datacenter', () => {
        const ai = computeAi(10, 100, 200);
        approx(ai.energyPerUserDay, 10 * 0.02 * 1.5);
        approx(ai.co2PerUserDay, 10 * 0.02 * 1.5 * 10);
        approx(ai.energyPerYear, 0.3 * 100 * 200);
        approx(ai.co2PerYearKg, (3 * 100 * 200) / 1000);
    });

    it('zéro requête signifie zéro consommation', () => {
        assert.equal(computeAi(0, 100, 200).energyPerYear, 0);
    });
});

describe('computeAnnual', () => {
    const petrolFleet = computeFleet({ petrol: 10 }).totals; // 20 places, 6 kWh/km, 1400 g/km

    it('calcule les totaux annuels', () => {
        const annual = computeAnnual(petrolFleet, { dailyKm: 10, daysPerYear: 100, occupancy: 0.5 });
        assert.equal(annual.kmPerCar, 1000);
        assert.equal(annual.fleetKm, 10000);
        assert.equal(annual.passengers, 10);
        approx(annual.energy, 6 * 1000);
        approx(annual.co2Kg, 1400);
        approx(annual.energyPerPassengerKm, 0.6);
        approx(annual.co2PerPassengerKm, 140);
    });

    it('aucune économie quand il y a autant de passagers que de voitures', () => {
        const annual = computeAnnual(petrolFleet, { dailyKm: 10, daysPerYear: 100, occupancy: 0.5 });
        approx(annual.savings.co2Kg, 0);
        approx(annual.savings.energyPct, 0);
    });

    it('économise 50 % quand chaque voiture transporte deux passagers', () => {
        const annual = computeAnnual(petrolFleet, { dailyKm: 10, daysPerYear: 100, occupancy: 1 });
        approx(annual.solo.co2Kg, 2800);
        approx(annual.savings.co2Kg, 1400);
        approx(annual.savings.co2Pct, 50);
        approx(annual.savings.energyPct, 50);
    });

    it('signale un surcoût (économie négative) si les voitures roulent presque vides', () => {
        const annual = computeAnnual(petrolFleet, { dailyKm: 10, daysPerYear: 100, occupancy: 0.25 });
        assert.ok(annual.savings.co2Kg < 0);
    });

    it('gère une distance nulle', () => {
        const annual = computeAnnual(petrolFleet, { dailyKm: 0, daysPerYear: 100, occupancy: 0.5 });
        assert.equal(annual.energy, 0);
        assert.equal(annual.energyPerPassengerKm, 0);
        assert.equal(annual.savings.co2Pct, 0);
    });
});

describe('simulate', () => {
    it('produit un bilan complet avec les valeurs par défaut', () => {
        const result = simulate(DEFAULT_INPUT);
        assert.equal(result.totals.cars, 100);
        assert.equal(result.totals.seats, 302);
        assert.deepEqual(result.users, { min: 302 * 0.25, max: 302 });
        assert.equal(result.loadProfile.length, 4);
        approx(result.annual.passengers, 151);
        approx(result.ai.energyPerUserDay, 0.3);
        assert.ok(result.annual.savings.co2Kg > 0);
    });

    it('accepte des valeurs numériques sous forme de chaînes (formulaire)', () => {
        const result = simulate({ ...DEFAULT_INPUT, totalCars: '10', mix: { electric: '100' } });
        assert.equal(result.totals.cars, 10);
        assert.equal(result.cars.electric, 10);
    });

    it('zéro requête IA n’est plus remplacé par la valeur par défaut', () => {
        assert.equal(simulate({ ...DEFAULT_INPUT, aiRequests: 0 }).ai.energyPerUserDay, 0);
    });

    it('un parc 100 % électrique émet uniquement du CO2 indirect', () => {
        const result = simulate({ ...DEFAULT_INPUT, mix: onlyMix('electric') });
        assert.equal(result.totals.co2Direct, 0);
        assert.equal(result.totals.nox, 0);
        approx(result.totals.co2, 100 * 0.17 * 10);
    });

    it('lève une ValidationError détaillée pour une entrée invalide', () => {
        assert.throws(() => simulate({ ...DEFAULT_INPUT, totalCars: -1 }), error => {
            assert.ok(error instanceof ValidationError);
            assert.equal(error.errors[0].field, 'totalCars');
            return true;
        });
    });

    it('est déterministe', () => {
        assert.deepEqual(simulate(DEFAULT_INPUT), simulate(DEFAULT_INPUT));
    });
});
