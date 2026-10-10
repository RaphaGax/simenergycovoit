import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    seatsBooked, seatsLeft, bookingRefusal, createBooking, cancelBooking, canCancel,
    BOOKING_STATUS, PASSENGER_PRICE_CHF
} from '../../src/core/booking.js';

const now = new Date('2026-10-10T12:00:00Z');
const trip = { id: 't1', driverId: 'd1', departureAt: '2026-10-11T08:00:00.000Z', seats: 3 };
const confirmed = (id, seats, tripId = 't1') => ({ id, tripId, seats, status: BOOKING_STATUS.CONFIRMED });
const ids = n => ({ id: `b${n}`, reference: `REF${n}`, now });

test('le prix passager est toujours 0 CHF', () => {
    assert.equal(PASSENGER_PRICE_CHF, 0);
    const booking = createBooking({ trip, bookings: [], passengerId: 'p1', seats: 2 }, ids(1));
    assert.deepEqual(booking, {
        id: 'b1', reference: 'REF1', tripId: 't1', passengerId: 'p1', seats: 2,
        priceChf: 0, status: BOOKING_STATUS.CONFIRMED, createdAt: '2026-10-10T12:00:00.000Z'
    });
});

test('places restantes : seules les réservations confirmées du trajet comptent', () => {
    const bookings = [
        confirmed('a', 1),
        { ...confirmed('b', 1), status: BOOKING_STATUS.CANCELLED },
        confirmed('c', 2, 'autre-trajet')
    ];
    assert.equal(seatsBooked('t1', bookings), 1);
    assert.equal(seatsLeft(trip, bookings), 2);
    assert.equal(seatsLeft(trip, [confirmed('a', 5)]), 0);
});

test('réservation refusée : complet, places insuffisantes, parti, propre trajet, inexistant', () => {
    const base = { trip, bookings: [], passengerId: 'p1', seats: 1 };
    assert.equal(bookingRefusal(base, { now }), null);
    assert.equal(bookingRefusal({ ...base, bookings: [confirmed('a', 3)] }, { now }), 'Ce trajet est complet.');
    assert.match(bookingRefusal({ ...base, bookings: [confirmed('a', 2)], seats: 2 }, { now }), /que 1 place/);
    assert.match(bookingRefusal(base, { now: new Date('2026-10-11T09:00:00Z') }), /déjà parti/);
    assert.match(bookingRefusal({ ...base, passengerId: 'd1' }, { now }), /propre trajet/);
    assert.match(bookingRefusal({ ...base, trip: null }, { now }), /n’existe pas/);
    assert.match(bookingRefusal({ ...base, seats: 0 }, { now }), /au moins une place/);
    assert.throws(() => createBooking({ ...base, bookings: [confirmed('a', 3)] }, ids(2)), RangeError);
});

test('annulation possible avant le départ, une seule fois', () => {
    const booking = createBooking({ trip, bookings: [], passengerId: 'p1', seats: 1 }, ids(1));
    assert.equal(canCancel(booking, trip, now), true);

    const cancelled = cancelBooking(booking, trip, { now });
    assert.equal(cancelled.status, BOOKING_STATUS.CANCELLED);
    assert.equal(cancelled.cancelledAt, '2026-10-10T12:00:00.000Z');
    assert.equal(booking.status, BOOKING_STATUS.CONFIRMED); // réservation d'origine inchangée
    assert.throws(() => cancelBooking(cancelled, trip, { now }), RangeError);
    assert.throws(() => cancelBooking(booking, trip, { now: new Date('2026-10-11T09:00:00Z') }), RangeError);
});
