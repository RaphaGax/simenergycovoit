// Orchestration de l'interface : relie le formulaire, l'API, le rendu et les graphiques.
// Les dépendances sont injectées pour pouvoir tester l'application avec jsdom.

import { DEFAULT_INPUT } from './core/vehicles.js';
import { simulate } from './core/simulator.js';
import { sumMix, validateInput } from './core/validation.js';
import { ApiError, simulateWithFallback } from './api.js';
import { createChartManager } from './charts.js';
import { resultToCsv } from './format.js';
import {
    buildMixInputs, fillForm, hideResults, readForm, renderErrors, renderMixTotal,
    renderResults, renderScenarioMessage, renderScenarios, renderStatus
} from './view.js';

/**
 * @param {Document} doc
 * @param {{ api: object, ChartCtor?: Function, download?: (content: string, filename: string) => void,
 *           confirm?: (message: string) => boolean, simulateLocal?: Function }} deps
 */
export function initApp(doc, { api, ChartCtor, download = () => {}, confirm = () => true, simulateLocal = simulate }) {
    const charts = createChartManager(ChartCtor, doc);
    // Sans Chart.js (CDN injoignable), on masque les cadres plutôt que d'afficher des zones vides.
    for (const box of doc.querySelectorAll('.chart-box')) box.hidden = !ChartCtor;
    const state = { online: false, lastResult: null, source: null };

    const form = doc.getElementById('config');
    const scenarioForm = doc.getElementById('scenarioForm');

    buildMixInputs(doc);
    fillForm(doc, DEFAULT_INPUT);
    updateMixTotal();

    function updateMixTotal() {
        renderMixTotal(doc, sumMix(readForm(doc).mix));
    }

    async function calculate() {
        const { valid, errors } = validateInput(readForm(doc));
        renderErrors(doc, errors);
        if (!valid) return null;

        try {
            const { result, source } = await simulateWithFallback(api, simulateLocal, readForm(doc));
            if (source === 'local' && state.online) setOnline(false);
            state.lastResult = result;
            state.source = source;
            renderResults(doc, result, source);
            charts.render(result);
            return result;
        } catch (error) {
            renderErrors(doc, error instanceof ApiError && error.details.length > 0
                ? error.details
                : [{ field: '', message: `Erreur lors du calcul : ${error.message}` }]);
            return null;
        }
    }

    function reset() {
        fillForm(doc, DEFAULT_INPUT);
        updateMixTotal();
        renderErrors(doc, []);
        hideResults(doc);
        charts.destroyAll();
        state.lastResult = null;
    }

    function setOnline(online) {
        state.online = online;
        renderStatus(doc, online);
    }

    function reportScenarioError(error) {
        if (error instanceof ApiError && error.isNetworkError) setOnline(false);
        renderScenarioMessage(doc, error.message, true);
    }

    async function refreshScenarios() {
        if (!state.online) {
            renderScenarios(doc, [], scenarioHandlers);
            return;
        }
        try {
            renderScenarios(doc, await api.listScenarios(), scenarioHandlers);
        } catch (error) {
            reportScenarioError(error);
        }
    }

    async function saveScenario() {
        const name = doc.getElementById('scenarioName').value.trim();
        if (!name) {
            renderScenarioMessage(doc, 'Veuillez saisir un nom de scénario.', true);
            return null;
        }
        const { valid, errors, value } = validateInput(readForm(doc));
        renderErrors(doc, errors);
        if (!valid) {
            renderScenarioMessage(doc, 'Corrigez la configuration avant de l’enregistrer.', true);
            return null;
        }
        try {
            const scenario = await api.saveScenario(name, value);
            doc.getElementById('scenarioName').value = '';
            renderScenarioMessage(doc, `Scénario « ${scenario.name} » enregistré.`);
            await refreshScenarios();
            return scenario;
        } catch (error) {
            reportScenarioError(error);
            return null;
        }
    }

    async function loadScenario(id) {
        try {
            const scenario = await api.getScenario(id);
            fillForm(doc, scenario.input);
            updateMixTotal();
            renderScenarioMessage(doc, `Scénario « ${scenario.name} » chargé.`);
            return calculate();
        } catch (error) {
            reportScenarioError(error);
            return null;
        }
    }

    async function deleteScenario(id) {
        if (!confirm('Supprimer ce scénario ?')) return false;
        try {
            await api.deleteScenario(id);
            renderScenarioMessage(doc, 'Scénario supprimé.');
            await refreshScenarios();
            return true;
        } catch (error) {
            reportScenarioError(error);
            return false;
        }
    }

    const scenarioHandlers = { onLoad: loadScenario, onDelete: deleteScenario };

    function exportCsv() {
        if (!state.lastResult) return false;
        download(resultToCsv(state.lastResult), 'ecovroom-resultats.csv');
        return true;
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        calculate();
    });
    form.addEventListener('input', event => {
        if (event.target.dataset?.vehicle) updateMixTotal();
    });
    doc.getElementById('resetBtn').addEventListener('click', reset);
    doc.getElementById('exportBtn').addEventListener('click', exportCsv);
    scenarioForm.addEventListener('submit', event => {
        event.preventDefault();
        saveScenario();
    });

    const ready = api.health()
        .then(() => setOnline(true), () => setOnline(false))
        .then(() => Promise.all([refreshScenarios(), calculate()]));

    return { state, ready, calculate, reset, saveScenario, loadScenario, deleteScenario, refreshScenarios, exportCsv };
}
