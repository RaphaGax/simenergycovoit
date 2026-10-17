import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canComplete, completeTrip, refreshCreditEntry, isSubmittable } from '../../src/core/tripCompletion.js';
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

test('completeTrip : crédits limités aux places confirmées par les passagers (0 tant que personne n’a répondu)', () => {
    const { trip: done, creditEntry } = completeTrip({ trip, bookings, driverId: 'd1' }, { now: after });
    assert.equal(done.completedAt, '2026-10-11T10:00:00.000Z');
    assert.equal(creditEntry.co2AvoidedG, 0);
    assert.equal(creditEntry.passengerSeats, 0);
    assert.equal(creditEntry.status, 'estimated');
    assert.equal(creditEntry.driverId, 'd1');
});

test('crédits recalculés au fil des réponses : places confirmées seulement, contestées exclues', () => {
    const { creditEntry } = completeTrip({ trip, bookings, driverId: 'd1' }, { now: after });
    const answered = bookings.map(b => (b.id === 'b1' ? { ...b, passengerProof: 'confirmed' } : b.id === 'b2' ? { ...b, passengerProof: 'disputed' } : b));
    const refreshed = refreshCreditEntry(creditEntry, { trip: { ...trip, completedAt: 'x' }, bookings: answered });
    assert.equal(refreshed.co2AvoidedG, 2 * 60 * 140); // b1 seul ; b2 contesté
    assert.equal(refreshed.passengerSeats, 2);
    assert.equal(refreshed.estimatedAt, creditEntry.estimatedAt);

    const allConfirmed = bookings.map(b => ({ ...b, passengerProof: 'confirmed' }));
    // b1 : 2 × 60 km × 140 g ; b2 : 25 km × 140 g − 2 km × 120 g (détour diesel) ; b3 annulée, b4 autre trajet
    assert.equal(refreshCreditEntry(creditEntry, { trip, bookings: allConfirmed }).co2AvoidedG, 2 * 60 * 140 + (25 * 140 - 2 * 120));

    // Une entrée déjà soumise n'est jamais recalculée.
    const pending = { ...refreshed, status: 'pending' };
    assert.equal(refreshCreditEntry(pending, { trip, bookings: allConfirmed }), pending);
});

test('isSubmittable : estimée, réponses closes et montant non nul', () => {
    const entry = { status: 'estimated', credits: 0.01 };
    assert.equal(isSubmittable(entry, { closed: true }), true);
    assert.equal(isSubmittable(entry, { closed: false }), false);
    assert.equal(isSubmittable({ ...entry, credits: 0 }, { closed: true }), false);
    assert.equal(isSubmittable({ ...entry, status: 'pending' }, { closed: true }), false);
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
