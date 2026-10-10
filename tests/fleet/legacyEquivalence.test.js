// Preuve d'équivalence : exécute l'ancien script.js (inchangé) sur un DOM simulé
// et compare ses sorties à celles de computeFleet().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { computeFleet } from '../../src/fleet/core/fleetCalculator.js';
import { DEFAULT_FLEET_INPUT } from '../../src/fleet/core/fleetDefaults.js';

const legacySource = readFileSync(new URL('../../script.js', import.meta.url), 'utf8');

const INPUT_IDS = {
    electric: 'pctElectric',
    hybridPlug: 'pctHybridPlug',
    diesel: 'pctDiesel',
    petrol: 'pctPetrol',
    gas: 'pctGas',
    hydrogen: 'pctHydrogen'
};

// Lance calculate() de l'ancien script et capture le DOM et les configurations Chart.js.
function runLegacy({ totalCars, percentages }) {
    const elements = {};
    const element = id => (elements[id] ??= { value: '', textContent: '', innerHTML: '', style: {} });
    element('totalCars').value = String(totalCars);
    element('aiRequests').value = '10';
    for (const [type, id] of Object.entries(INPUT_IDS)) element(id).value = String(percentages[type]);

    const charts = [];
    const context = {
        document: { getElementById: element, addEventListener() {} },
        Chart: class { constructor(canvas, config) { charts.push(config); } destroy() {} },
        console: { log() {}, error() {} },
        alert: message => { throw new Error(`alert: ${message}`); }
    };
    vm.runInNewContext(`${legacySource}\ncalculate();`, context);
    // Clone vers le contexte principal : les tableaux créés dans le contexte vm ont un autre prototype.
    return { elements, charts: structuredClone(charts) };
}

const SCENARIOS = {
    'valeurs par défaut': DEFAULT_FLEET_INPUT,
    'parc mixte de 37 voitures': {
        totalCars: 37,
        percentages: { electric: 10, hybridPlug: 15, diesel: 25, petrol: 20, gas: 20, hydrogen: 10 }
    },
    'arrondi complété par l’essence': {
        totalCars: 10,
        percentages: { electric: 33.3, hybridPlug: 0, diesel: 33.3, petrol: 0, gas: 0, hydrogen: 33.4 }
    },
    '100 % électrique': {
        totalCars: 5,
        percentages: { electric: 100, hybridPlug: 0, diesel: 0, petrol: 0, gas: 0, hydrogen: 0 }
    }
};

for (const [name, input] of Object.entries(SCENARIOS)) {
    test(`équivalence avec script.js : ${name}`, () => {
        const { elements, charts } = runLegacy(input);
        const fleet = computeFleet(input);
        const [vehicleChart, consumptionChart, emissionsChart, userChart] = charts;

        assert.equal(fleet.valid, true);
        assert.deepEqual(vehicleChart.data.labels, Object.keys(fleet.cars));
        assert.deepEqual(vehicleChart.data.datasets[0].data, Object.values(fleet.cars));
        assert.deepEqual(consumptionChart.data.labels, fleet.results.map(r => r.type));
        assert.deepEqual(consumptionChart.data.datasets[0].data, fleet.results.map(r => r.energy));
        assert.deepEqual(emissionsChart.data.datasets.map(d => d.data),
            [fleet.results.map(r => r.co2), fleet.results.map(r => r.nox), fleet.results.map(r => r.so2)]);
        assert.deepEqual(userChart.data.datasets[0].data, fleet.userConsumption.map(uc => uc.energy));
        assert.deepEqual(userChart.data.datasets[1].data, fleet.userConsumption.map(uc => uc.co2));

        assert.equal(elements.totalSeats.textContent, Math.round(fleet.totalSeats));
        assert.equal(elements.totalUsers.textContent,
            `${Math.round(fleet.minUsers)} - ${Math.round(fleet.maxUsers)}`);
        assert.equal(elements.totalEnergy.textContent, fleet.totalEnergy.toFixed(3));
        assert.equal(elements.totalCO2.textContent, fleet.totalCO2.toFixed(2));
        assert.equal(elements.totalNOx.textContent, fleet.totalNOx.toFixed(3));
        assert.equal(elements.totalSO2.textContent, fleet.totalSO2.toFixed(3));
    });
}

test('équivalence avec script.js : répartition invalide refusée des deux côtés', () => {
    const input = { totalCars: 100, percentages: { ...DEFAULT_FLEET_INPUT.percentages, gas: 5 } };
    const { elements, charts } = runLegacy(input);

    assert.equal(elements.pctError.style.display, 'block');
    assert.equal(charts.length, 0);
    assert.equal(computeFleet(input).valid, false);
});
