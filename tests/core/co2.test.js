import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTripCo2, perOccupant, co2AvoidedForTrip, co2AvoidedBySeatsFilled, co2AvoidedForBooking } from '../../src/core/co2.js';

// Facteurs OFEN 2025 (voitures neuves) : essence 146,1 g/km (référence), diesel 168,0 g/km.
const PETROL = 146.1;
const DIESEL = 168.0;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≉ ${expected}`);

test('estimateTripCo2 : distance × facteur du véhicule', () => {
    near(estimateTripCo2({ distanceKm: 100, vehicleType: 'diesel' }), 16800);
    near(estimateTripCo2({ distanceKm: 100, vehicleType: 'petrol' }), 14610);
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

test('co2AvoidedForTrip : chaque passager évite un trajet solo en voiture à essence neuve (146,1 g/km)', () => {
    near(co2AvoidedForTrip({ distanceKm: 50, vehicleType: 'electric', passengers: 3 }), 3 * 50 * PETROL);
    assert.equal(co2AvoidedForTrip({ distanceKm: 50, vehicleType: 'diesel', passengers: 0 }), 0);
});

test('co2AvoidedForTrip : le détour est déduit, sans jamais rendre le résultat négatif', () => {
    near(co2AvoidedForTrip({ distanceKm: 10, vehicleType: 'diesel', passengers: 1, detourKm: 5 }), 10 * PETROL - 5 * DIESEL);
    assert.equal(co2AvoidedForTrip({ distanceKm: 1, vehicleType: 'diesel', passengers: 1, detourKm: 50 }), 0);
});

test('co2AvoidedForTrip : nombre de passagers invalide refusé', () => {
    assert.throws(() => co2AvoidedForTrip({ distanceKm: 10, vehicleType: 'diesel', passengers: 1.5 }), RangeError);
    assert.throws(() => co2AvoidedForTrip({ distanceKm: 10, vehicleType: 'diesel', passengers: -1 }), RangeError);
});

test('co2AvoidedBySeatsFilled : une ligne par nombre de passagers', () => {
    const rows = co2AvoidedBySeatsFilled({ distanceKm: 10, vehicleType: 'electric', seats: 3 });
    assert.deepEqual(rows.map(r => r.passengers), [1, 2, 3]);
    rows.forEach((row, i) => near(row.co2AvoidedG, (i + 1) * 10 * PETROL));
});

test('co2AvoidedForBooking : distance du passager si connue, sinon celle du trajet ; détour déduit', () => {
    const trip = { distanceKm: 60, vehicleType: 'diesel' };
    near(co2AvoidedForBooking(trip, { seats: 2 }), 2 * 60 * PETROL);
    near(co2AvoidedForBooking(trip, { seats: 1, passengerDistanceKm: 25, detourKm: 2 }), 25 * PETROL - 2 * DIESEL);
});
