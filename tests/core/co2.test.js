import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTripCo2, perOccupant, co2AvoidedForTrip, co2AvoidedBySeatsFilled } from '../../src/core/co2.js';

test('estimateTripCo2 : distance × facteur du véhicule', () => {
    assert.equal(estimateTripCo2({ distanceKm: 100, vehicleType: 'diesel' }), 12000);
    assert.equal(estimateTripCo2({ distanceKm: 100, vehicleType: 'electric' }), 0);
    assert.equal(estimateTripCo2({ distanceKm: 0, vehicleType: 'petrol' }), 0);
});

test('estimateTripCo2 : entrées invalides refusées', () => {
    assert.throws(() => estimateTripCo2({ distanceKm: 10, vehicleType: 'trottinette' }), RangeError);
    assert.throws(() => estimateTripCo2({ distanceKm: -1, vehicleType: 'petrol' }), RangeError);
    assert.throws(() => estimateTripCo2({ distanceKm: NaN, vehicleType: 'petrol' }), RangeError);
});

test('perOccupant : division, 0 si personne à bord', () => {
    assert.equal(perOccupant(300, 3), 100);
    assert.equal(perOccupant(300, 0), 0);
});

test('co2AvoidedForTrip : chaque passager évite un trajet solo en essence (140 g/km)', () => {
    assert.equal(co2AvoidedForTrip({ distanceKm: 50, vehicleType: 'electric', passengers: 3 }), 3 * 50 * 140);
    assert.equal(co2AvoidedForTrip({ distanceKm: 50, vehicleType: 'diesel', passengers: 0 }), 0);
});

test('co2AvoidedForTrip : le détour est déduit, sans jamais rendre le résultat négatif', () => {
    assert.equal(co2AvoidedForTrip({ distanceKm: 10, vehicleType: 'diesel', passengers: 1, detourKm: 5 }), 1400 - 600);
    assert.equal(co2AvoidedForTrip({ distanceKm: 1, vehicleType: 'diesel', passengers: 1, detourKm: 50 }), 0);
});

test('co2AvoidedForTrip : nombre de passagers invalide refusé', () => {
    assert.throws(() => co2AvoidedForTrip({ distanceKm: 10, vehicleType: 'diesel', passengers: 1.5 }), RangeError);
    assert.throws(() => co2AvoidedForTrip({ distanceKm: 10, vehicleType: 'diesel', passengers: -1 }), RangeError);
});

test('co2AvoidedBySeatsFilled : une ligne par nombre de passagers', () => {
    const rows = co2AvoidedBySeatsFilled({ distanceKm: 10, vehicleType: 'electric', seats: 3 });
    assert.deepEqual(rows, [
        { passengers: 1, co2AvoidedG: 1400 },
        { passengers: 2, co2AvoidedG: 2800 },
        { passengers: 3, co2AvoidedG: 4200 }
    ]);
});
