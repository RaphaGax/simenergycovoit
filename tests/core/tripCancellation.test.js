import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelTrip, canCancelTrip, tripCancellationRefusal } from '../../src/core/tripCancellation.js';
import { bookingRefusal } from '../../src/core/booking.js';
import { searchTrips } from '../../src/core/search.js';
import { canComplete } from '../../src/core/tripCompletion.js';

const trip = { id: 't1', driverId: 'd1', origin: 'Sion', destination: 'Sierre', departureAt: '2026-10-11T08:00:00.000Z', seats: 3 };
const before = new Date('2026-10-10T12:00:00Z');
const after = new Date('2026-10-11T09:00:00Z');
const bookings = [
    { id: 'b1', tripId: 't1', seats: 1, status: 'confirmed' },
    { id: 'b2', tripId: 't1', seats: 2, status: 'cancelled', cancelledAt: '2026-10-09T10:00:00.000Z' },
    { id: 'b3', tripId: 'autre', seats: 1, status: 'confirmed' }
];

test('annulation : avant le départ, par le conducteur, une seule fois', () => {
    assert.equal(canCancelTrip(trip, before), true);
    assert.match(tripCancellationRefusal(trip, after), /déjà parti/);
    assert.match(tripCancellationRefusal({ ...trip, completedAt: 'x' }, before), /déjà parti/);
    assert.match(tripCancellationRefusal({ ...trip, cancelledAt: 'x' }, before), /déjà annulé/);
    assert.throws(() => cancelTrip({ trip, bookings, driverId: 'autre' }, { now: before }), RangeError);
    assert.throws(() => cancelTrip({ trip, bookings, driverId: 'd1' }, { now: after }), RangeError);
});

test('annulation : seules les réservations confirmées du trajet sont annulées', () => {
    const result = cancelTrip({ trip, bookings, driverId: 'd1' }, { now: before });
    assert.equal(result.trip.cancelledAt, '2026-10-10T12:00:00.000Z');
    assert.deepEqual(result.cancelledBookings.map(b => [b.id, b.status, b.cancelledAt]), [['b1', 'cancelled', '2026-10-10T12:00:00.000Z']]);
    assert.equal(trip.cancelledAt, undefined); // trajet d'origine inchangé
});

test('trajet annulé : plus réservable, plus proposé, plus à confirmer', () => {
    const cancelled = { ...trip, cancelledAt: '2026-10-10T12:00:00.000Z' };
    assert.match(bookingRefusal({ trip: cancelled, bookings: [], passengerId: 'p1', seats: 1 }, { now: before }), /annulé par le conducteur/);
    assert.deepEqual(searchTrips([cancelled], [], { origin: 'sion' }, { now: before }), []);
    assert.equal(searchTrips([trip], [], { origin: 'sion' }, { now: before }).length, 1);
    assert.equal(canComplete(cancelled, after), false);
});
