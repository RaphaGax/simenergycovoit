import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preselectCandidates, matrixLocations, rankByDetour, straightLineDetourKm } from '../../src/core/matching.js';
import { haversineKm, isValidCoords } from '../../src/core/geo.js';

const LAUSANNE = [6.6291, 46.5167];
const GENEVE = [6.1423, 46.2102];
const MORGES = [6.4983, 46.5113];
const NYON = [6.2393, 46.3833];
const SION = [7.3594, 46.2311];
const MARTIGNY = [7.0719, 46.1027];

const trip = (id, originCoords, destinationCoords, departureAt = '2026-12-01T07:30:00.000Z') =>
    ({ trip: { id, originCoords, destinationCoords, departureAt }, seatsLeft: 3 });

test('geo : coordonnées valides et distance à vol d’oiseau', () => {
    assert.equal(isValidCoords(LAUSANNE), true);
    assert.equal(isValidCoords([200, 0]), false);
    assert.equal(isValidCoords(null), false);
    assert.ok(Math.abs(haversineKm(LAUSANNE, GENEVE) - 51.4) < 1);
});

test('présélection : garde les trajets sur le chemin, écarte les autres et ceux sans coordonnées', () => {
    const results = [
        trip('sion', SION, MARTIGNY),
        trip('lsn-gva', LAUSANNE, GENEVE),
        trip('sans-coords', null, null)
    ];
    const kept = preselectCandidates(results, { pickup: MORGES, dropoff: NYON });
    assert.deepEqual(kept.map(r => r.trip.id), ['lsn-gva']);
    assert.ok(straightLineDetourKm(results[1].trip, MORGES, NYON) < 5);
});

test('matrixLocations : [P, D, O1, E1, O2, E2]', () => {
    const candidates = [trip('a', LAUSANNE, GENEVE), trip('b', SION, MARTIGNY)];
    assert.deepEqual(matrixLocations({ pickup: MORGES, dropoff: NYON }, candidates),
        [MORGES, NYON, LAUSANNE, GENEVE, SION, MARTIGNY]);
});

test('rankByDetour : détour = O→P + P→D + D→E − O→E, tri croissant, filtre au-delà du maximum', () => {
    const candidates = [trip('direct', LAUSANNE, GENEVE), trip('loin', SION, MARTIGNY), trip('petit', LAUSANNE, GENEVE)];
    // Indices : 0 P, 1 D, 2-3 direct, 4-5 loin, 6-7 petit. Durées en secondes, distances en km.
    const n = 8;
    const durations = Array.from({ length: n }, () => Array(n).fill(0));
    const distances = Array.from({ length: n }, () => Array(n).fill(0));
    const set = (table, from, to, value) => { table[from][to] = value; };
    set(durations, 0, 1, 1200); set(distances, 0, 1, 25);
    // direct : 600 + 1200 + 1200 − 3000 = 0 s
    set(durations, 2, 0, 600); set(durations, 1, 3, 1200); set(durations, 2, 3, 3000);
    set(distances, 2, 0, 11); set(distances, 1, 3, 27); set(distances, 2, 3, 62);
    // loin : 3600 + 1200 + 3600 − 1800 = 6600 s (110 min) > 20 min
    set(durations, 4, 0, 3600); set(durations, 1, 5, 3600); set(durations, 4, 5, 1800);
    // petit : 900 + 1200 + 1500 − 3000 = 600 s (10 min), 13 + 25 + 30 − 62 = 6 km
    set(durations, 6, 0, 900); set(durations, 1, 7, 1500); set(durations, 6, 7, 3000);
    set(distances, 6, 0, 13); set(distances, 1, 7, 30); set(distances, 6, 7, 62);

    const ranked = rankByDetour(candidates, { durations, distances });
    assert.deepEqual(ranked.map(r => r.trip.id), ['direct', 'petit']);
    assert.equal(ranked[0].detourMin, 0);
    assert.equal(ranked[0].detourKm, 1); // 11 + 25 + 27 − 62
    assert.equal(ranked[1].detourMin, 10);
    assert.equal(ranked[1].detourKm, 6);
    assert.equal(ranked[1].passengerDistanceKm, 25);
});

test('rankByDetour : une valeur absente dans la matrice (lieu injoignable) écarte le trajet', () => {
    const candidates = [trip('a', LAUSANNE, GENEVE)];
    const row = () => [0, 0, 0, 0];
    const durations = [row(), row(), row(), row()];
    const distances = [row(), row(), row(), row()];
    durations[2][0] = null;
    assert.deepEqual(rankByDetour(candidates, { durations, distances }), []);
});
