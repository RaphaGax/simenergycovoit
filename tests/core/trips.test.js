import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTrip, createTrip } from '../../src/core/trips.js';

const now = new Date('2026-10-10T12:00:00Z');
const draft = {
    origin: ' Lausanne ',
    destination: 'Genève',
    departureAt: '2026-10-11T08:00:00Z',
    distanceKm: 62.5,
    seats: 3,
    vehicleType: 'electric'
};

test('un trajet complet et futur est valide', () => {
    assert.deepEqual(validateTrip(draft, { now }), { valid: true, errors: {} });
});

test('chaque champ invalide produit une erreur dédiée', () => {
    const { valid, errors } = validateTrip({
        origin: '', destination: '', departureAt: '', distanceKm: NaN, seats: 0, vehicleType: 'vélo'
    }, { now });
    assert.equal(valid, false);
    assert.deepEqual(Object.keys(errors).sort(),
        ['departureAt', 'destination', 'distanceKm', 'origin', 'seats', 'vehicleType']);
});

test('départ passé, arrivée identique, places et distance hors limites', () => {
    const { errors } = validateTrip({
        ...draft, destination: 'lausanne', departureAt: '2026-10-10T11:59:00Z', seats: 9, distanceKm: 2001
    }, { now });
    assert.ok(errors.destination && errors.departureAt && errors.seats && errors.distanceKm);
    assert.ok(validateTrip({ ...draft, seats: 2.5 }, { now }).errors.seats);
});

test('createTrip normalise le trajet et refuse un brouillon invalide', () => {
    const trip = createTrip(draft, { id: 'trip-1', driverId: 'd1', now });
    assert.deepEqual(trip, {
        id: 'trip-1',
        driverId: 'd1',
        origin: 'Lausanne',
        destination: 'Genève',
        departureAt: '2026-10-11T08:00:00.000Z',
        distanceKm: 62.5,
        seats: 3,
        vehicleType: 'electric',
        createdAt: '2026-10-10T12:00:00.000Z'
    });
    assert.throws(() => createTrip({ ...draft, seats: 0 }, { id: 'x', driverId: 'd1', now }), RangeError);
});
