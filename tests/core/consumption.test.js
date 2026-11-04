import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateConsumption, CONSUMPTION_PER_KM } from '../../src/core/consumption.js';
import { VEHICLE_TYPES } from '../../src/core/emissionFactors.js';

test('consommation : une valeur pour chaque motorisation, proportionnelle à la distance', () => {
    assert.deepEqual(Object.keys(CONSUMPTION_PER_KM).sort(), [...VEHICLE_TYPES].sort());
    // Valeurs OFEN 2025 (tableau 1) pour 100 km.
    const at100 = type => estimateConsumption({ distanceKm: 100, vehicleType: type }).map(p => Math.round(p.amount * 100) / 100);
    assert.deepEqual(at100('petrol'), [6.3]);
    assert.deepEqual(at100('diesel'), [6.41]);
    assert.deepEqual(at100('electric'), [17.12]);
    assert.deepEqual(at100('hybridPlug'), [20.28, 1.25]);
    assert.deepEqual(at100('gas'), [5.48]);
    assert.deepEqual(at100('hydrogen'), [0.84]);
    const [petrol] = estimateConsumption({ distanceKm: 100, vehicleType: 'petrol' });
    assert.equal(petrol.unit, 'L');
    assert.deepEqual(estimateConsumption({ distanceKm: 10, vehicleType: 'hybridPlug' }).map(p => p.unit), ['kWh', 'L']);
    assert.throws(() => estimateConsumption({ distanceKm: 10, vehicleType: 'vélo' }), RangeError);
    assert.throws(() => estimateConsumption({ distanceKm: -1, vehicleType: 'petrol' }), RangeError);
});
