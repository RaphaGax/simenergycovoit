import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, validateSearch, searchTrips, localDay } from '../../src/core/search.js';
import { BOOKING_STATUS } from '../../src/core/booking.js';

const now = new Date('2026-10-10T12:00:00Z');
const trip = (id, origin, destination, departureAt, seats = 3) => ({ id, driverId: 'd1', origin, destination, departureAt, seats });
const trips = [
    trip('later', 'Lausanne, gare', 'Genève, Cornavin', '2026-10-12T08:00:00.000Z'),
    trip('soon', 'Lausanne', 'Genève aéroport', '2026-10-11T07:00:00.000Z'),
    trip('other', 'Sion', 'Martigny', '2026-10-11T09:00:00.000Z'),
    trip('past', 'Lausanne', 'Genève', '2026-10-09T08:00:00.000Z')
];

test('normalizeText ignore accents, casse et espaces', () => {
    assert.equal(normalizeText('  GENÈVE   Cornavin '), 'geneve cornavin');
});

test('sans critère : tous les trajets à venir, triés par départ', () => {
    const results = searchTrips(trips, [], {}, { now });
    assert.deepEqual(results.map(r => r.trip.id), ['soon', 'other', 'later']);
    assert.equal(results[0].seatsLeft, 3);
});

test('filtre départ/arrivée sans tenir compte des accents ni de la casse', () => {
    const results = searchTrips(trips, [], { origin: 'lausanne', destination: 'geneve' }, { now });
    assert.deepEqual(results.map(r => r.trip.id), ['soon', 'later']);
});

test('filtre par jour local de départ', () => {
    const day = localDay('2026-10-12T08:00:00.000Z');
    assert.deepEqual(searchTrips(trips, [], { date: day }, { now }).map(r => r.trip.id), ['later']);
});

test('exclut les trajets sans assez de places libres', () => {
    const bookings = [{ id: 'b', tripId: 'soon', seats: 2, status: BOOKING_STATUS.CONFIRMED }];
    const results = searchTrips(trips, bookings, { origin: 'lausanne', seats: 2 }, { now });
    assert.deepEqual(results.map(r => r.trip.id), ['later']);
});

test('validateSearch : places entre 1 et 8, date au format AAAA-MM-JJ', () => {
    assert.equal(validateSearch({ seats: 1 }).valid, true);
    assert.ok(validateSearch({ seats: 0 }).errors.seats);
    assert.ok(validateSearch({ seats: 9 }).errors.seats);
    assert.ok(validateSearch({ seats: 1, date: '12/10/2026' }).errors.date);
});
