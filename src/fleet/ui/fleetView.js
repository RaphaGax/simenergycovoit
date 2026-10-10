// Lecture et affichage DOM du simulateur de parc (calculate() et reset() de script.js).
// Les calculs viennent de ../core/ ; ce module ne fait que lire les champs et écrire le résultat.
import { computeFleet } from '../core/fleetCalculator.js';
import { computeAiFootprint } from '../core/aiFootprint.js';
import { DEFAULT_FLEET_INPUT } from '../core/fleetDefaults.js';
import { renderFleetCharts, destroyFleetCharts } from './fleetCharts.js';

const PERCENTAGE_INPUT_IDS = {
    electric: 'pctElectric',
    hybridPlug: 'pctHybridPlug',
    diesel: 'pctDiesel',
    petrol: 'pctPetrol',
    gas: 'pctGas',
    hydrogen: 'pctHydrogen'
};

const byId = id => document.getElementById(id);

// Mêmes valeurs de repli que script.js (`|| 100`, `|| 10`, `|| 0`).
export function readFleetInput() {
    const percentages = {};
    for (const [type, id] of Object.entries(PERCENTAGE_INPUT_IDS)) {
        percentages[type] = parseFloat(byId(id).value) || 0;
    }
    return {
        totalCars: parseInt(byId('totalCars').value) || 100,
        aiRequests: parseInt(byId('aiRequests').value) || 10,
        percentages
    };
}

function renderResultsTable(results) {
    const tbody = byId('resultsBody');
    tbody.innerHTML = '';
    results.forEach(r => {
        tbody.innerHTML += `<tr>
            <td>${r.type}</td>
            <td>${r.numCars}</td>
            <td>${r.seats}</td>
            <td>${r.energy.toFixed(3)}</td>
            <td>${r.co2.toFixed(2)}</td>
            <td>${r.nox.toFixed(3)}</td>
            <td>${r.so2.toFixed(3)}</td>
        </tr>`;
    });
}

function renderSummary(fleet, ai) {
    byId('totalSeats').textContent = Math.round(fleet.totalSeats);
    byId('totalUsers').textContent = `${Math.round(fleet.minUsers)} - ${Math.round(fleet.maxUsers)}`;
    byId('totalEnergy').textContent = fleet.totalEnergy.toFixed(3);
    byId('totalCO2').textContent = fleet.totalCO2.toFixed(2);
    byId('totalNOx').textContent = fleet.totalNOx.toFixed(3);
    byId('totalSO2').textContent = fleet.totalSO2.toFixed(3);
    byId('aiEnergy').textContent = ai.aiEnergy.toFixed(3);
    byId('aiCO2').textContent = ai.aiCO2.toFixed(2);
}

function renderUserConsumptionTable(userConsumption) {
    const tbody = byId('userConsumptionBody');
    tbody.innerHTML = '';
    userConsumption.forEach(uc => {
        tbody.innerHTML += `<tr>
            <td>${uc.charge}%</td>
            <td>${Math.round(uc.users)}</td>
            <td>${uc.energy.toFixed(6)}</td>
            <td>${uc.co2.toFixed(3)}</td>
        </tr>`;
    });
}

export function calculate() {
    try {
        const input = readFleetInput();
        const fleet = computeFleet(input);
        if (!fleet.valid) {
            byId('pctError').style.display = 'block';
            return;
        }
        byId('pctError').style.display = 'none';

        renderResultsTable(fleet.results);
        renderSummary(fleet, computeAiFootprint(input.aiRequests));
        renderUserConsumptionTable(fleet.userConsumption);
        renderFleetCharts(fleet);
    } catch (error) {
        console.error('Erreur dans calculate():', error);
        alert('Une erreur s’est produite lors du calcul. Vérifiez les entrées et réessayez.');
    }
}

export function reset() {
    try {
        byId('totalCars').value = DEFAULT_FLEET_INPUT.totalCars;
        for (const [type, id] of Object.entries(PERCENTAGE_INPUT_IDS)) {
            byId(id).value = DEFAULT_FLEET_INPUT.percentages[type];
        }
        byId('aiRequests').value = DEFAULT_FLEET_INPUT.aiRequests;
        byId('resultsBody').innerHTML = '';
        byId('userConsumptionBody').innerHTML = '';
        byId('pctError').style.display = 'none';
        destroyFleetCharts();
    } catch (error) {
        console.error('Erreur dans reset():', error);
        alert('Une erreur s’est produite lors de la réinitialisation.');
    }
}
