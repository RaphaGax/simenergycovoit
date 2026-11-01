import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    occupancyShare, maxTripPoints, splitTripPoints, pointsBySeatsFilled, tripPoints,
    driverEntry, passengerEntry, levelFor, totalPoints, POINTS_STATUS, MIN_DISTANCE_KM
} from '../../src/core/vroomPoints.js';

// Lausanne → Genève, 62 km, 3 places : 3 × 62 km × 140 g (essence de référence) = 26,04 kg.
const trip = { id: 't1', distanceKm: 62, vehicleType: 'electric', seats: 3, departureAt: '2026-10-11T08:00:00.000Z' };
const booking = (id, extra = {}) => ({ id, tripId: 't1', seats: 1, status: 'confirmed', ...extra });
const after = new Date('2026-10-11T10:00:00Z');
const afterDeadline = new Date('2026-10-19T00:00:00Z');

test('courbe de Pareto : 0 sans passager, 80 % à moitié plein, 100 % plein', () => {
    assert.equal(occupancyShare(0, 4), 0);
    assert.equal(occupancyShare(1, 0), 0);
    assert.ok(Math.abs(occupancyShare(2, 4) - 0.8) < 1e-9);
    assert.equal(occupancyShare(4, 4), 1);
    assert.equal(occupancyShare(5, 4), 1);
    assert.ok(Math.abs(occupancyShare(1, 4) - 0.487) < 0.001);
    assert.ok(occupancyShare(3, 4) > occupancyShare(2, 4));
});

test('maximum : CO₂ évité en kg avec toutes les places occupées, rien sous 3 km', () => {
    assert.ok(Math.abs(maxTripPoints(trip) - 26.04) < 1e-9);
    assert.equal(maxTripPoints({ ...trip, distanceKm: MIN_DISTANCE_KM - 0.1 }), 0);
    assert.ok(maxTripPoints({ ...trip, distanceKm: MIN_DISTANCE_KM }) > 0);
});

test('partage 50/50 : conducteur et passagers au prorata des places, nombres entiers', () => {
    const one = splitTripPoints(trip, [booking('a')]);
    assert.equal(one.driverPoints, 8); // 26,04 × 0,61 / 2 ≈ 7,9
    assert.equal(one.passengerPoints.get('a'), 8);
    const full = splitTripPoints(trip, [booking('a'), booking('b', { seats: 2 })]);
    assert.equal(full.share, 1);
    assert.equal(full.driverPoints, 13);
    assert.equal(full.passengerPoints.get('a'), 4); // 13,02 / 3
    assert.equal(full.passengerPoints.get('b'), 9); // 13,02 × 2/3
    assert.equal(full.maxPoints, 26);
});

test('au moins 1 point par participant d’un trajet qui rapporte, rien sans passager', () => {
    const short = { ...trip, distanceKm: 3, seats: 4 };
    const split = splitTripPoints(short, [booking('a')]);
    assert.equal(split.driverPoints, 1);
    assert.equal(split.passengerPoints.get('a'), 1);
    assert.equal(splitTripPoints(trip, []).driverPoints, 0);
});

test('estimation par remplissage : le conducteur gagne plus quand la voiture se remplit', () => {
    const rows = pointsBySeatsFilled(trip);
    assert.deepEqual(rows.map(r => r.passengers), [1, 2, 3]);
    assert.ok(rows[0].driverPoints < rows[1].driverPoints && rows[1].driverPoints < rows[2].driverPoints);
    assert.equal(rows[2].driverPoints, 13);
});

test('seules les places confirmées par leur passager comptent', () => {
    const bookings = [booking('a', { passengerProof: 'confirmed' }), booking('b', { passengerProof: 'disputed' }),
        booking('c'), booking('d', { status: 'cancelled', passengerProof: 'confirmed' })];
    assert.equal(tripPoints(trip, bookings).filledSeats, 1);
});

test('conducteur : en attente tant que le trajet n’est pas confirmé et les réponses closes, puis acquis', () => {
    assert.equal(driverEntry(trip, [booking('a')], new Date('2026-10-11T07:00:00Z')), null); // pas parti
    assert.equal(driverEntry(trip, [], after), null); // aucun passager
    const bookings = [booking('a', { passengerProof: 'confirmed' }), booking('b')];
    assert.deepEqual(driverEntry(trip, bookings, after),
        { tripId: 't1', role: 'driver', points: 8, status: POINTS_STATUS.PENDING, awaiting: 'driver' });
    const done = { ...trip, completedAt: '2026-10-11T11:00:00.000Z' };
    assert.equal(driverEntry(done, bookings, after).awaiting, 'passengers');
    assert.equal(driverEntry(done, bookings, afterDeadline).status, POINTS_STATUS.EARNED);
    // Tous contestent : rien d'acquis, pas d'entrée.
    assert.equal(driverEntry(done, [booking('a', { passengerProof: 'disputed' })], after), null);
});

test('passager : points à gagner en confirmant, acquis après confirmation et clôture, rien s’il conteste', () => {
    const done = { ...trip, completedAt: '2026-10-11T11:00:00.000Z' };
    const waiting = booking('a');
    assert.deepEqual(passengerEntry(waiting, done, [waiting], after),
        { tripId: 't1', bookingId: 'a', role: 'passenger', points: 8, status: POINTS_STATUS.PENDING, awaiting: 'you' });
    assert.equal(passengerEntry(waiting, done, [waiting], afterDeadline), null); // délai passé sans réponse
    const answered = booking('a', { passengerProof: 'confirmed' });
    assert.equal(passengerEntry(answered, done, [answered], after).status, POINTS_STATUS.EARNED);
    assert.equal(passengerEntry(answered, trip, [answered], after).awaiting, 'driver');
    const disputed = booking('a', { passengerProof: 'disputed' });
    assert.equal(passengerEntry(disputed, done, [disputed], after), null);
});

test('niveaux d’aventurier et progression', () => {
    assert.deepEqual(levelFor(0), { name: 'Explorateur', rank: 1, next: { name: 'Éclaireur', min: 25 }, progress: 0 });
    assert.equal(levelFor(25).name, 'Éclaireur');
    assert.equal(levelFor(100).progress, 0.6);
    const legend = levelFor(9999);
    assert.equal(legend.name, 'Légende');
    assert.equal(legend.next, null);
    assert.equal(legend.progress, 1);
});

test('totaux : acquis et en attente', () => {
    assert.deepEqual(totalPoints([{ points: 8, status: 'earned' }, { points: 4, status: 'pending' }, { points: 2, status: 'earned' }]),
        { earned: 10, pending: 4 });
});
