// Preuve d'équivalence : compare computeFleet() aux sorties de l'ancien script.js,
// capturées dans tests/fixtures/legacyFleetOutputs.json avant sa suppression
// (le script reste consultable dans l'historique git, commit 39cf9a6). Les calculs sont faits avec
// les facteurs d'origine du script (LEGACY_VEHICLE_PROFILES) : seule la logique est comparée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeFleet } from '../../src/fleet/core/fleetCalculator.js';
import { LEGACY_VEHICLE_PROFILES } from '../../src/core/emissionFactors.js';

const { scenarios } = JSON.parse(
    readFileSync(new URL('../fixtures/legacyFleetOutputs.json', import.meta.url), 'utf8')
);

for (const { name, input, expected } of scenarios) {
    test(`équivalence avec l'ancien script.js : ${name}`, () => {
        const fleet = computeFleet(input, LEGACY_VEHICLE_PROFILES);

        assert.equal(fleet.valid, true);
        assert.deepEqual(fleet.cars, expected.cars);
        assert.deepEqual(fleet.results.map(r => r.type), expected.resultTypes);
        assert.deepEqual(fleet.results.map(r => r.energy), expected.energy);
        assert.deepEqual(fleet.results.map(r => r.co2), expected.co2);
        assert.deepEqual(fleet.results.map(r => r.nox), expected.nox);
        assert.deepEqual(fleet.results.map(r => r.so2), expected.so2);
        assert.deepEqual(fleet.userConsumption.map(uc => uc.energy), expected.userEnergy);
        assert.deepEqual(fleet.userConsumption.map(uc => uc.co2), expected.userCo2);

        assert.deepEqual({
            totalSeats: String(Math.round(fleet.totalSeats)),
            totalUsers: `${Math.round(fleet.minUsers)} - ${Math.round(fleet.maxUsers)}`,
            totalEnergy: fleet.totalEnergy.toFixed(3),
            totalCO2: fleet.totalCO2.toFixed(2),
            totalNOx: fleet.totalNOx.toFixed(3),
            totalSO2: fleet.totalSO2.toFixed(3)
        }, expected.summary);
    });
}

test('facteurs d’origine figés : identiques à vehicleData de l’ancien script.js', () => {
    assert.deepEqual(structuredClone(LEGACY_VEHICLE_PROFILES), {
        electric: { energy: 0.17, co2: 0, nox: 0, so2: 0, seats: 4 },
        hybridPlug: { energy: 0.10 + (0.02 * 10), co2: 50, nox: 0.02, so2: 0.01, seats: 4 },
        diesel: { energy: 0.54, co2: 120, nox: 0.08, so2: 0.02, seats: 5 },
        petrol: { energy: 0.60, co2: 140, nox: 0.06, so2: 0.01, seats: 2 },
        gas: { energy: 0.50, co2: 100, nox: 0.03, so2: 0.01, seats: 5 },
        hydrogen: { energy: 0.33, co2: 0, nox: 0, so2: 0, seats: 4 }
    });
});
