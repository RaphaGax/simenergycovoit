import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canComplete, completeTrip } from '../../src/core/tripCompletion.js';
import { BOOKING_STATUS } from '../../src/core/booking.js';

const trip = {
    id: 't1', driverId: 'd1', departureAt: '2026-10-11T08:00:00.000Z',
    distanceKm: 60, seats: 3, vehicleType: 'diesel'
};
const before = new Date('2026-10-11T07:00:00Z');
const after = new Date('2026-10-11T10:00:00Z');
const bookings = [
    { id: 'b1', tripId: 't1', seats: 2, status: BOOKING_STATUS.CONFIRMED },
    { id: 'b2', tripId: 't1', seats: 1, status: BOOKING_STATUS.CONFIRMED, passengerDistanceKm: 25, detourKm: 2 },
    { id: 'b3', tripId: 't1', seats: 1, status: BOOKING_STATUS.CANCELLED },
    { id: 'b4', tripId: 'autre', seats: 1, status: BOOKING_STATUS.CONFIRMED }
];

test('canComplete : seulement après le départ et une seule fois', () => {
    assert.equal(canComplete(trip, before), false);
    assert.equal(canComplete(trip, after), true);
    assert.equal(canComplete({ ...trip, completedAt: after.toISOString() }, after), false);
});

test('completeTrip : crédits estimés à partir des passagers confirmés du trajet', () => {
    const { trip: done, creditEntry } = completeTrip({ trip, bookings, driverId: 'd1' }, { now: after });
    assert.equal(done.completedAt, '2026-10-11T10:00:00.000Z');
    // b1 : 2 × 60 km × 140 g ; b2 : 25 km × 140 g − 2 km × 120 g (détour diesel)
    assert.equal(creditEntry.co2AvoidedG, 2 * 60 * 140 + (25 * 140 - 2 * 120));
    assert.equal(creditEntry.passengerSeats, 3);
    assert.equal(creditEntry.status, 'estimated');
    assert.equal(creditEntry.driverId, 'd1');
});

test('completeTrip : sans passager, trajet effectué mais aucune entrée de crédits', () => {
    const { trip: done, creditEntry } = completeTrip({ trip, bookings: [], driverId: 'd1' }, { now: after });
    assert.ok(done.completedAt);
    assert.equal(creditEntry, null);
});

test('completeTrip : refusé avant le départ, deux fois ou par un autre conducteur', () => {
    assert.throws(() => completeTrip({ trip, bookings, driverId: 'd1' }, { now: before }), /pas encore eu lieu/);
    assert.throws(() => completeTrip({ trip: { ...trip, completedAt: 'x' }, bookings, driverId: 'd1' }, { now: after }), /déjà confirmé/);
    assert.throws(() => completeTrip({ trip, bookings, driverId: 'autre' }, { now: after }), /Seul le conducteur/);
});
