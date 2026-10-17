import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proofDeadline, proofRefusal, recordPassengerProof, summarizeProof, PASSENGER_PROOF } from '../../src/core/tripProof.js';

const trip = { id: 't1', departureAt: '2026-10-11T08:00:00.000Z' };
const booking = { id: 'b1', tripId: 't1', seats: 2, status: 'confirmed' };
const before = new Date('2026-10-11T07:00:00Z');
const after = new Date('2026-10-11T10:00:00Z');

test('délai de réponse : 7 jours après le départ', () => {
    assert.equal(proofDeadline(trip).toISOString(), '2026-10-18T08:00:00.000Z');
});

test('réponse possible après le départ, une seule fois, dans le délai, pour une réservation confirmée', () => {
    assert.equal(proofRefusal(booking, trip, after), null);
    assert.match(proofRefusal(booking, trip, before), /pas encore eu lieu/);
    assert.match(proofRefusal({ ...booking, status: 'cancelled' }, trip, after), /annulée/);
    assert.match(proofRefusal({ ...booking, passengerProof: 'confirmed' }, trip, after), /déjà répondu/);
    assert.match(proofRefusal(booking, trip, new Date('2026-10-18T08:00:01Z')), /délai/);
    assert.equal(proofRefusal(booking, trip, new Date('2026-10-18T08:00:00Z')), null); // borne incluse
});

test('recordPassengerProof : nouvelle réservation horodatée, réponse validée', () => {
    const answered = recordPassengerProof(booking, trip, { answer: PASSENGER_PROOF.CONFIRMED, now: after });
    assert.deepEqual(answered, { ...booking, passengerProof: 'confirmed', passengerProofAt: '2026-10-11T10:00:00.000Z' });
    assert.equal(booking.passengerProof, undefined); // réservation d'origine inchangée
    assert.throws(() => recordPassengerProof(booking, trip, { answer: 'oui', now: after }), TypeError);
    assert.throws(() => recordPassengerProof(booking, trip, { answer: 'disputed', now: before }), RangeError);
});

test('summarizeProof : places par réponse, clos quand tout le monde a répondu ou après le délai', () => {
    const bookings = [
        { ...booking, id: 'a', seats: 2, passengerProof: 'confirmed' },
        { ...booking, id: 'b', seats: 1, passengerProof: 'disputed' },
        { ...booking, id: 'c', seats: 1 },
        { ...booking, id: 'd', seats: 3, status: 'cancelled' },
        { ...booking, id: 'e', tripId: 'autre', seats: 4 }
    ];
    assert.deepEqual(summarizeProof(trip, bookings, after), {
        confirmedSeats: 2, disputedSeats: 1, pendingSeats: 1, deadline: '2026-10-18T08:00:00.000Z', closed: false
    });
    assert.equal(summarizeProof(trip, bookings, new Date('2026-10-19T00:00:00Z')).closed, true);
    assert.equal(summarizeProof(trip, bookings.filter(b => b.id !== 'c'), after).closed, true);
    assert.equal(summarizeProof(trip, [], after).closed, true);
});
