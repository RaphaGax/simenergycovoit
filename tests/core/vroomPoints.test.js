import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    driverShare, carOccupancy, splitPoints, pointsBySeatsFilled, tripPoints,
    driverEntry, passengerEntry, levelFor, totalPoints, POINTS_STATUS, MIN_DISTANCE_KM
} from '../../src/core/vroomPoints.js';

// Lausanne → Genève, 62 km, voiture à 4 sièges passagers : chaque passager évite 62 × 140 g = 8,68 kg.
const trip = { id: 't1', distanceKm: 62, vehicleType: 'electric', seats: 4, carSeats: 4, otherOccupiedSeats: 0, departureAt: '2026-10-11T08:00:00.000Z' };
const booking = (id, extra = {}) => ({ id, tripId: 't1', seats: 1, status: 'confirmed', ...extra });
const after = new Date('2026-10-11T10:00:00Z');
const afterDeadline = new Date('2026-10-19T00:00:00Z');

test('part du conducteur : 50 % avec un siège occupé, 80 % voiture pleine, paliers réguliers', () => {
    assert.deepEqual([1, 2, 3, 4].map(n => Math.round(driverShare(n, 4) * 100)), [50, 60, 70, 80]);
    assert.deepEqual([1, 2, 3].map(n => Math.round(driverShare(n, 3) * 100)), [50, 65, 80]);
    assert.equal(driverShare(1, 1), 0.8); // une seule place, occupée : voiture pleine
    assert.equal(driverShare(9, 4), 0.8);
});

test('sièges de la voiture : trajets anciens = places proposées, sans autre occupant', () => {
    assert.deepEqual(carOccupancy({ seats: 3 }), { carSeats: 3, otherOccupiedSeats: 0 });
    assert.deepEqual(carOccupancy(trip), { carSeats: 4, otherOccupiedSeats: 0 });
});

test('production = CO₂ réellement évité, proportionnelle au remplissage, sans bonus', () => {
    const rows = pointsBySeatsFilled(trip);
    assert.deepEqual(rows.map(r => Math.round(r.co2AvoidedKg * 100) / 100), [8.68, 17.36, 26.04, 34.72]);
    assert.deepEqual(rows.map(r => [r.driverPoints, r.passengerPoints]), [[4, 4], [10, 3], [18, 3], [28, 2]]);
});

test('famille ou marchandise : la voiture pleine donne 80 % au conducteur, sans produire plus', () => {
    const family = { ...trip, seats: 1, otherOccupiedSeats: 3 };
    const split = splitPoints(family, [booking('a')], 8.68);
    assert.equal(split.driverShare, 0.8);
    assert.equal(split.co2AvoidedKg, 8.68);
    assert.deepEqual([split.driverPoints, split.passengerPoints.get('a')], [7, 2]);
    const alone = splitPoints({ ...trip, seats: 1 }, [booking('a')], 8.68);
    assert.deepEqual([alone.driverShare, alone.driverPoints, alone.passengerPoints.get('a')], [0.5, 4, 4]);
});

test('éligibilité : un conducteur et au moins un passager, au moins 3 km, pas de minimum', () => {
    assert.equal(splitPoints(trip, [], 0).driverPoints, 0);
    const short = { ...trip, distanceKm: MIN_DISTANCE_KM - 0.1 };
    assert.equal(splitPoints(short, [booking('a')], 0.4).co2AvoidedKg, 0);
    const tiny = splitPoints({ ...trip, distanceKm: MIN_DISTANCE_KM }, [booking('a')], 0.42);
    assert.deepEqual([tiny.driverPoints, tiny.passengerPoints.get('a')], [0, 0]);
});

test('places réservées à plusieurs : part des passagers au prorata des places', () => {
    const split = splitPoints(trip, [booking('a'), booking('b', { seats: 2 })], 26.04);
    assert.equal(Math.round(split.driverShare * 100), 70);
    assert.deepEqual([split.driverPoints, split.passengerPoints.get('a'), split.passengerPoints.get('b')], [18, 3, 5]);
});

test('seules les places confirmées par leur passager comptent ; détour déduit', () => {
    const bookings = [booking('a', { passengerProof: 'confirmed', detourKm: 2 }), booking('b', { passengerProof: 'disputed' }),
        booking('c'), booking('d', { status: 'cancelled', passengerProof: 'confirmed' })];
    const points = tripPoints(trip, bookings);
    assert.equal(points.filledSeats, 1);
    assert.ok(Math.abs(points.co2AvoidedKg - 8.68) < 1e-9); // voiture électrique : détour sans émission
    const petrol = tripPoints({ ...trip, vehicleType: 'petrol' }, bookings);
    assert.ok(Math.abs(petrol.co2AvoidedKg - (8.68 - 0.28)) < 1e-9);
});

test('conducteur : en attente tant que le trajet n’est pas confirmé et les réponses closes, puis acquis', () => {
    assert.equal(driverEntry(trip, [booking('a')], new Date('2026-10-11T07:00:00Z')), null); // pas parti
    assert.equal(driverEntry(trip, [], after), null); // aucun passager
    const bookings = [booking('a', { passengerProof: 'confirmed' }), booking('b')];
    const pending = driverEntry(trip, bookings, after);
    assert.deepEqual({ ...pending, co2AvoidedKg: Math.round(pending.co2AvoidedKg * 100) / 100 },
        { tripId: 't1', role: 'driver', points: 4, co2AvoidedKg: 8.68, status: POINTS_STATUS.PENDING, awaiting: 'driver' });
    const done = { ...trip, completedAt: '2026-10-11T11:00:00.000Z' };
    assert.equal(driverEntry(done, bookings, after).awaiting, 'passengers');
    assert.equal(driverEntry(done, bookings, afterDeadline).status, POINTS_STATUS.EARNED);
    assert.equal(driverEntry(done, [booking('a', { passengerProof: 'disputed' })], after), null); // tous contestent
});

test('passager : points à gagner en confirmant, acquis après confirmation et clôture, rien s’il conteste', () => {
    const done = { ...trip, completedAt: '2026-10-11T11:00:00.000Z' };
    const waiting = booking('a');
    const entry = passengerEntry(waiting, done, [waiting], after);
    assert.deepEqual([entry.points, entry.status, entry.awaiting], [4, POINTS_STATUS.PENDING, 'you']);
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
    assert.deepEqual([levelFor(9999).name, levelFor(9999).next, levelFor(9999).progress], ['Légende', null, 1]);
});

test('totaux : points acquis, en attente, et CO₂ des seules entrées acquises', () => {
    assert.deepEqual(totalPoints([
        { points: 8, status: 'earned', co2AvoidedKg: 8.5 }, { points: 4, status: 'pending', co2AvoidedKg: 4 },
        { points: 2, status: 'earned', co2AvoidedKg: 1.5 }]),
    { earned: 10, pending: 4, co2AvoidedKg: 10 });
});
