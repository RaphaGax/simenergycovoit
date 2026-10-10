import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAiFootprint } from '../../src/fleet/core/aiFootprint.js';

test('empreinte IA : 10 requêtes/jour → 0,2 kWh et 2 g CO2', () => {
    const { aiEnergy, aiCO2 } = computeAiFootprint(10);
    assert.equal(aiEnergy.toFixed(3), '0.200');
    assert.equal(aiCO2.toFixed(2), '2.00');
});

test('empreinte IA : 0 requête → 0', () => {
    assert.deepEqual(computeAiFootprint(0), { aiEnergy: 0, aiCO2: 0 });
});
