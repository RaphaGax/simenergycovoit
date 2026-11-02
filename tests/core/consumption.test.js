import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateConsumption, CONSUMPTION_PER_KM } from '../../src/core/consumption.js';
import { VEHICLE_TYPES } from '../../src/core/emissionFactors.js';

test('consommation : une valeur pour chaque motorisation, proportionnelle à la distance', () => {
    assert.deepEqual(Object.keys(CONSUMPTION_PER_KM).sort(), [...VEHICLE_TYPES].sort());
    const [petrol] = estimateConsumption({ distanceKm: 100, vehicleType: 'petrol' });
    assert.ok(Math.abs(petrol.amount - 6) < 1e-9);
    assert.equal(petrol.unit, 'L');
    assert.deepEqual(estimateConsumption({ distanceKm: 10, vehicleType: 'hybridPlug' }).map(p => p.unit), ['kWh', 'L']);
    assert.throws(() => estimateConsumption({ distanceKm: 10, vehicleType: 'vélo' }), RangeError);
    assert.throws(() => estimateConsumption({ distanceKm: -1, vehicleType: 'petrol' }), RangeError);
});
