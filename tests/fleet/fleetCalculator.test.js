// Tests de référence du simulateur de parc : figent le comportement actuel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateDistribution,
    distributeCars,
    computeCapacity,
    computeFleetTotals,
    computeFleet
} from '../../src/fleet/core/fleetCalculator.js';
import { DEFAULT_FLEET_INPUT } from '../../src/fleet/core/fleetDefaults.js';

const approx = (actual, expected, eps = 1e-9) =>
    assert.ok(Math.abs(actual - expected) < eps, `${actual} ≉ ${expected}`);

test('valeurs par défaut : répartition, places et totaux de référence', () => {
    const fleet = computeFleet(DEFAULT_FLEET_INPUT);

    assert.equal(fleet.valid, true);
    assert.deepEqual(fleet.cars, { electric: 21, hybridPlug: 9, diesel: 14, petrol: 56, gas: 0, hydrogen: 0 });
    assert.equal(fleet.totalSeats, 302);
    assert.equal(fleet.minUsers, 75.5);
    assert.equal(fleet.maxUsers, 302);
    assert.equal(fleet.totalEnergy.toFixed(3), '47.430');
    assert.equal(fleet.totalCO2, 9970);
    assert.equal(fleet.totalNOx.toFixed(3), '4.660');
    assert.equal(fleet.totalSO2.toFixed(3), '0.930');
    assert.deepEqual(fleet.results.map(r => r.type), ['electric', 'hybridPlug', 'diesel', 'petrol']);
});

test('valeurs par défaut : consommation par utilisateur selon la charge', () => {
    const { userConsumption } = computeFleet(DEFAULT_FLEET_INPUT);

    assert.deepEqual(userConsumption.map(uc => uc.charge), [25, 50, 75, 100]);
    assert.deepEqual(userConsumption.map(uc => uc.users), [75.5, 151, 226.5, 302]);
    approx(userConsumption[3].co2, 9970 / 302);
    approx(userConsumption[0].energy, 47.43 / 75.5, 1e-6);
});

test('une répartition dont la somme diffère de 100 % est refusée', () => {
    assert.equal(validateDistribution({ electric: 50, petrol: 49.8 }).valid, false);
    assert.equal(validateDistribution({ electric: 50, petrol: 49.95 }).valid, true);

    const fleet = computeFleet({ totalCars: 100, percentages: { ...DEFAULT_FLEET_INPUT.percentages, gas: 5 } });
    assert.equal(fleet.valid, false);
});

test("arrondi inférieur au total : la différence est ajoutée à l'essence", () => {
    const cars = distributeCars(10, { electric: 33.3, diesel: 33.3, petrol: 0, hydrogen: 33.4 });
    assert.deepEqual(cars, { electric: 3, diesel: 3, petrol: 1, hydrogen: 3 });
});

test('arrondi supérieur au total : non corrigé (comportement actuel conservé)', () => {
    const cars = distributeCars(1, { electric: 50, petrol: 50 });
    assert.deepEqual(cars, { electric: 1, petrol: 1 });
});

test('aucun véhicule : capacité et totaux nuls, scénarios à 0', () => {
    const cars = { electric: 0, petrol: 0 };
    assert.equal(computeCapacity(cars).totalSeats, 0);
    const totals = computeFleetTotals(cars);
    assert.equal(totals.totalCO2, 0);
    assert.deepEqual(totals.results, []);

    const fleet = computeFleet({ totalCars: 0, percentages: { electric: 100 } });
    assert.ok(fleet.userConsumption.every(uc => uc.energy === 0 && uc.co2 === 0));
});
