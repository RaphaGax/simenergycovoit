import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTripProblem, MAX_ROUTE_S, PICKUP_SERVICE_S } from '../../../src/core/vroom/buildTripProblem.js';
import { parseTripSolution } from '../../../src/core/vroom/parseTripSolution.js';

const LAUSANNE = [6.6291, 46.5167];
const GENEVE = [6.1423, 46.2102];
const MORGES = [6.4983, 46.5113];
const ROLLE = [6.3385, 46.4582];
const NYON = [6.2393, 46.3833];
const T = 1796110200; // 2026-12-01T07:30:00Z

const trip = {
    id: 't1', seats: 3, departureAt: '2026-12-01T07:30:00.000Z',
    originCoords: LAUSANNE, destinationCoords: GENEVE
};
const bookings = [
    { id: 'b-rolle', seats: 2, pickup: { label: 'Rolle', coords: ROLLE }, dropoff: { label: 'Nyon', coords: NYON } },
    { id: 'b-morges', seats: 1, pickup: { label: 'Morges', coords: MORGES } } // dépose : arrivée du trajet
];

test('buildTripProblem : un véhicule avec capacité et fenêtre de temps, un shipment par réservation', () => {
    const { problem, shipmentBookingIds } = buildTripProblem(trip, bookings);
    assert.deepEqual(problem.vehicles, [{
        id: 1, profile: 'driving-car', start: LAUSANNE, end: GENEVE, capacity: [3], time_window: [T, T + MAX_ROUTE_S]
    }]);
    assert.deepEqual(problem.shipments[0], {
        amount: [2],
        pickup: { id: 1, location: ROLLE, service: PICKUP_SERVICE_S },
        delivery: { id: 1, location: NYON, service: 60 }
    });
    assert.deepEqual(problem.shipments[1].delivery.location, GENEVE);
    assert.deepEqual(shipmentBookingIds, ['b-rolle', 'b-morges']);
});

test('buildTripProblem : refuse un trajet sans coordonnées ou sans réservation', () => {
    assert.throws(() => buildTripProblem({ ...trip, originCoords: null }, bookings), RangeError);
    assert.throws(() => buildTripProblem(trip, []), RangeError);
    assert.throws(() => buildTripProblem(trip, [{ id: 'x', seats: 1, pickup: { coords: [999, 0] } }]), RangeError);
});

// Solution au format VROOM, telle que renvoyée par ORS /optimization.
const solution = {
    code: 0,
    summary: { cost: 3360, routes: 1, unassigned: 0, duration: 3360, distance: 63100 },
    unassigned: [],
    routes: [{
        vehicle: 1, cost: 3360, duration: 3360, distance: 63100,
        steps: [
            { type: 'start', location: LAUSANNE, arrival: T, duration: 0, distance: 0, load: [0] },
            { type: 'pickup', id: 2, location: MORGES, arrival: T + 720, duration: 720, distance: 11200, load: [1] },
            { type: 'pickup', id: 1, location: ROLLE, arrival: T + 1500, duration: 1380, distance: 24800, load: [3] },
            { type: 'delivery', id: 1, location: NYON, arrival: T + 2280, duration: 2040, distance: 37900, load: [1] },
            { type: 'delivery', id: 2, location: GENEVE, arrival: T + 3300, duration: 2880, distance: 61500, load: [0] },
            { type: 'end', location: GENEVE, arrival: T + 3360, duration: 2880, distance: 63100, load: [0] }
        ]
    }]
};

test('parseTripSolution : arrêts ordonnés avec réservation, heure et distance', () => {
    const parsed = parseTripSolution(solution, ['b-rolle', 'b-morges']);
    assert.deepEqual(parsed.stops.map(s => [s.type, s.bookingId]), [
        ['start', null], ['pickup', 'b-morges'], ['pickup', 'b-rolle'],
        ['delivery', 'b-rolle'], ['delivery', 'b-morges'], ['end', null]
    ]);
    assert.equal(parsed.stops[1].arrivalAt, '2026-12-01T07:42:00.000Z');
    assert.equal(parsed.stops[1].distanceKm, 11.2);
    assert.equal(parsed.durationMin, 56);
    assert.equal(parsed.distanceKm, 63.1);
    assert.deepEqual(parsed.unassignedBookingIds, []);
});

test('parseTripSolution : réservations non planifiées et distances absentes', () => {
    const partial = {
        code: 0,
        unassigned: [{ id: 2, type: 'pickup' }, { id: 2, type: 'delivery' }],
        routes: [{ vehicle: 1, duration: 600, steps: [{ type: 'start', location: LAUSANNE, arrival: T }] }]
    };
    const parsed = parseTripSolution(partial, ['b-rolle', 'b-morges']);
    assert.deepEqual(parsed.unassignedBookingIds, ['b-morges']);
    assert.equal(parsed.distanceKm, null);
    assert.equal(parsed.stops[0].distanceKm, null);
});

test('parseTripSolution : erreur VROOM signalée', () => {
    assert.throws(() => parseTripSolution({ code: 2, error: 'Invalid shipment' }, []), /code 2.*Invalid shipment/);
    assert.throws(() => parseTripSolution(null, []), /réponse invalide/);
});
