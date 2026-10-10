// Tests de l'interface dans un DOM simulé (jsdom), à partir du vrai public/index.html.

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import { initApp } from '../public/js/app.js';
import { ApiError, createApiClient } from '../public/js/api.js';
import { simulate } from '../public/js/core/simulator.js';
import { DEFAULT_INPUT, VEHICLE_TYPES } from '../public/js/core/vehicles.js';
import { buildMixInputs, fillForm, mixFieldId, readForm, renderErrors } from '../public/js/view.js';
import { createApp } from '../server/app.js';
import { ScenarioStore } from '../server/storage.js';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function createDom() {
    // Les scripts ne sont pas exécutés : l'application est initialisée explicitement.
    return new JSDOM(html, { url: 'http://localhost/' }).window;
}

/** Faux serveur en mémoire, conforme au contrat de createApiClient. */
function createFakeApi({ online = true } = {}) {
    const scenarios = new Map();
    let nextId = 1;
    const offline = () => { throw new ApiError(0, 'Serveur injoignable'); };
    const api = {
        calls: [],
        online,
        async health() { api.calls.push('health'); if (!api.online) offline(); return { status: 'ok' }; },
        async simulate(input) { api.calls.push('simulate'); if (!api.online) offline(); return simulate(input); },
        async listScenarios() { if (!api.online) offline(); return [...scenarios.values()]; },
        async getScenario(id) {
            if (!scenarios.has(id)) throw new ApiError(404, 'Scénario introuvable.');
            return scenarios.get(id);
        },
        async saveScenario(name, input) {
            const result = simulate(input);
            const s = { id: String(nextId++), name, input, createdAt: new Date().toISOString(),
                summary: { totalCars: result.totals.cars, annualCo2Kg: result.annual.co2Kg } };
            scenarios.set(s.id, s);
            return s;
        },
        async deleteScenario(id) { scenarios.delete(id); return null; }
    };
    return api;
}

function fakeChart() {
    const created = [];
    class FakeChart {
        constructor(canvas, config) { this.canvas = canvas; this.config = config; this.destroyed = false; created.push(this); }
        destroy() { this.destroyed = true; }
    }
    return { FakeChart, created };
}

const text = (doc, id) => doc.getElementById(id).textContent;
const setValue = (doc, id, value) => { doc.getElementById(id).value = String(value); };

describe('view : formulaire', () => {
    let doc;
    beforeEach(() => {
        doc = createDom().document;
        buildMixInputs(doc);
    });

    it('génère un champ par type de véhicule', () => {
        const inputs = doc.querySelectorAll('#mixInputs input');
        assert.equal(inputs.length, VEHICLE_TYPES.length);
        assert.equal(inputs[0].id, 'pctElectric');
        assert.match(doc.querySelector('label[for="pctElectric"]').textContent, /Électrique \(4 places\)/);
    });

    it('fillForm puis readForm restitue l’entrée (taux de remplissage en %)', () => {
        fillForm(doc, DEFAULT_INPUT);
        assert.equal(doc.getElementById('occupancy').value, '50');
        const input = readForm(doc);
        assert.equal(input.occupancy, 0.5);
        assert.equal(input.totalCars, '100');
        assert.equal(input.mix.petrol, '55.8');
        assert.deepEqual(simulate(input).totals, simulate(DEFAULT_INPUT).totals);
    });

    it('un champ vide reste vide (pour être signalé par la validation)', () => {
        fillForm(doc, DEFAULT_INPUT);
        setValue(doc, 'totalCars', '');
        setValue(doc, 'occupancy', '');
        const input = readForm(doc);
        assert.equal(input.totalCars, '');
        assert.equal(input.occupancy, '');
    });

    it('renderErrors affiche la liste et marque les champs invalides', () => {
        renderErrors(doc, [
            { field: 'totalCars', message: 'Erreur A' },
            { field: 'mix.diesel', message: 'Erreur B' },
            { field: '', message: 'Erreur C' }
        ]);
        const box = doc.getElementById('errors');
        assert.equal(box.hidden, false);
        assert.deepEqual([...box.querySelectorAll('li')].map(li => li.textContent), ['Erreur A', 'Erreur B', 'Erreur C']);
        assert.equal(doc.getElementById('totalCars').getAttribute('aria-invalid'), 'true');
        assert.equal(doc.getElementById(mixFieldId('diesel')).getAttribute('aria-invalid'), 'true');

        renderErrors(doc, []);
        assert.equal(box.hidden, true);
        assert.equal(doc.querySelectorAll('[aria-invalid]').length, 0);
    });

    it('n’interprète jamais le HTML des messages', () => {
        renderErrors(doc, [{ field: '', message: '<img src=x onerror=alert(1)>' }]);
        assert.equal(doc.querySelector('#errors img'), null);
    });
});

describe('application (serveur simulé)', () => {
    let window, doc, api, app, charts, downloads;

    beforeEach(async () => {
        window = createDom();
        doc = window.document;
        api = createFakeApi();
        charts = fakeChart();
        downloads = [];
        app = initApp(doc, {
            api,
            ChartCtor: charts.FakeChart,
            download: (content, filename) => downloads.push({ content, filename }),
            confirm: () => true
        });
        await app.ready;
    });

    it('au démarrage : statut en ligne, formulaire par défaut, résultats affichés', () => {
        assert.equal(doc.getElementById('status').dataset.mode, 'online');
        assert.equal(doc.getElementById('totalCars').value, '100');
        assert.equal(text(doc, 'mixTotal'), '100,0');
        assert.equal(doc.getElementById('results').hidden, false);
        assert.equal(text(doc, 'totalSeats'), '302');
        assert.equal(text(doc, 'source'), 'par le serveur');
        assert.equal(doc.querySelectorAll('#resultsBody tr').length, 4);
        assert.equal(doc.querySelectorAll('#userConsumptionBody tr').length, 4);
        assert.equal(app.state.source, 'server');
    });

    it('affiche le bilan annuel et l’économie de CO2', () => {
        const expected = simulate(DEFAULT_INPUT);
        assert.ok(expected.annual.savings.co2Kg > 0);
        assert.equal(doc.getElementById('savings').classList.contains('negative'), false);
        assert.equal(text(doc, 'savedPct'), expected.annual.savings.co2Pct.toFixed(1).replace('.', ','));
        assert.equal(text(doc, 'aiEnergy'), '0,300');
    });

    it('signale visuellement un surcoût quand les voitures roulent presque vides', async () => {
        setValue(doc, 'occupancy', 10);
        await app.calculate();
        assert.equal(doc.getElementById('savings').classList.contains('negative'), true);
    });

    it('dessine trois graphiques et les remplace au recalcul', async () => {
        assert.ok([...doc.querySelectorAll('.chart-box')].every(box => !box.hidden));
        assert.equal(charts.created.length, 3);
        assert.deepEqual(charts.created.map(c => c.canvas.id), ['vehicleChart', 'emissionsChart', 'userConsumptionChart']);
        await app.calculate();
        assert.equal(charts.created.length, 6);
        assert.ok(charts.created.slice(0, 3).every(c => c.destroyed));
    });

    it('met à jour le total de la répartition à la saisie', () => {
        const input = doc.getElementById('pctElectric');
        input.value = '30';
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
        assert.equal(text(doc, 'mixTotal'), '109,1');
        assert.ok(doc.getElementById('mixTotal').classList.contains('invalid'));
    });

    it('bloque le calcul et affiche les erreurs si la saisie est invalide', async () => {
        const callsBefore = api.calls.length;
        setValue(doc, 'pctElectric', 50);
        setValue(doc, 'totalCars', 0);
        assert.equal(await app.calculate(), null);
        assert.equal(api.calls.length, callsBefore, 'aucun appel serveur');
        assert.equal(doc.querySelectorAll('#errors li').length, 2);
    });

    it('le bouton Calculer (submit) déclenche le calcul', async () => {
        setValue(doc, 'totalCars', 10);
        doc.getElementById('config').dispatchEvent(new window.Event('submit', { cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 0));
        // 10 voitures : 2 électriques, 1 hybride, 1 diesel, 6 essence → 29 places
        assert.equal(text(doc, 'totalSeats'), String(simulate({ ...DEFAULT_INPUT, totalCars: 10 }).totals.seats));
        assert.equal(text(doc, 'totalSeats'), '29');
    });

    it('Réinitialiser restaure les valeurs par défaut et masque les résultats', () => {
        setValue(doc, 'totalCars', 7);
        doc.getElementById('resetBtn').click();
        assert.equal(doc.getElementById('totalCars').value, '100');
        assert.equal(doc.getElementById('results').hidden, true);
        assert.equal(doc.querySelectorAll('#resultsBody tr').length, 0);
        assert.ok(charts.created.every(c => c.destroyed));
        assert.equal(app.exportCsv(), false, 'rien à exporter');
    });

    it('exporte le dernier résultat en CSV', () => {
        doc.getElementById('exportBtn').click();
        assert.equal(downloads.length, 1);
        assert.equal(downloads[0].filename, 'ecovroom-resultats.csv');
        assert.match(downloads[0].content, /^Type;Nombre;Places/);
    });

    it('bascule en mode local si le serveur tombe en cours de route', async () => {
        api.online = false;
        setValue(doc, 'totalCars', 20);
        const result = await app.calculate();
        assert.equal(result.totals.cars, 20);
        assert.equal(app.state.source, 'local');
        assert.equal(text(doc, 'source'), 'localement (mode hors ligne)');
        assert.equal(doc.getElementById('status').dataset.mode, 'offline');
        assert.equal(doc.getElementById('saveScenarioBtn').disabled, true);
    });

    it('affiche les erreurs de validation renvoyées par le serveur', async () => {
        api.simulate = async () => { throw new ApiError(400, 'Paramètres invalides.', [{ field: 'dailyKm', message: 'Distance refusée' }]); };
        assert.equal(await app.calculate(), null);
        assert.equal(text(doc, 'errors'), 'Distance refusée');
    });

    it('affiche une erreur générique si le serveur échoue', async () => {
        api.simulate = async () => { throw new ApiError(500, 'Erreur interne du serveur.'); };
        await app.calculate();
        assert.match(text(doc, 'errors'), /Erreur lors du calcul : Erreur interne/);
    });

    describe('scénarios', () => {
        it('liste vide au démarrage', () => {
            assert.equal(text(doc, 'scenarioList'), 'Aucun scénario enregistré.');
        });

        it('exige un nom', async () => {
            assert.equal(await app.saveScenario(), null);
            assert.match(text(doc, 'scenarioMessage'), /nom/);
            assert.ok(doc.getElementById('scenarioMessage').classList.contains('error'));
        });

        it('refuse d’enregistrer une configuration invalide', async () => {
            setValue(doc, 'scenarioName', 'KO');
            setValue(doc, 'pctGas', 10);
            assert.equal(await app.saveScenario(), null);
            assert.match(text(doc, 'scenarioMessage'), /Corrigez/);
        });

        it('enregistre, recharge et supprime un scénario', async () => {
            setValue(doc, 'totalCars', 40);
            setValue(doc, 'scenarioName', 'Petit parc');
            const saved = await app.saveScenario();
            assert.equal(saved.input.totalCars, 40, 'entrée normalisée envoyée');
            assert.equal(doc.getElementById('scenarioName').value, '');
            assert.match(text(doc, 'scenarioMessage'), /« Petit parc » enregistré/);

            const items = doc.querySelectorAll('#scenarioList li');
            assert.equal(items.length, 1);
            assert.match(items[0].textContent, /Petit parc/);
            assert.match(items[0].textContent, /40 voitures/);

            // Modifier le formulaire puis recharger le scénario via le bouton
            doc.getElementById('resetBtn').click();
            assert.equal(doc.getElementById('totalCars').value, '100');
            await app.loadScenario(saved.id);
            assert.equal(doc.getElementById('totalCars').value, '40');
            assert.equal(text(doc, 'totalSeats'), String(simulate(saved.input).totals.seats));

            assert.equal(await app.deleteScenario(saved.id), true);
            assert.equal(text(doc, 'scenarioList'), 'Aucun scénario enregistré.');
        });

        it('les boutons de la liste appellent les bons gestionnaires', async () => {
            setValue(doc, 'scenarioName', 'Via boutons');
            await app.saveScenario();
            const [loadBtn, deleteBtn] = doc.querySelectorAll('#scenarioList button');
            assert.equal(loadBtn.textContent, 'Charger');
            loadBtn.click();
            await new Promise(resolve => setTimeout(resolve, 0));
            assert.match(text(doc, 'scenarioMessage'), /« Via boutons » chargé/);
            deleteBtn.click();
            await new Promise(resolve => setTimeout(resolve, 0));
            assert.equal(text(doc, 'scenarioMessage'), 'Scénario supprimé.');
        });

        it('affiche une erreur pour un scénario introuvable', async () => {
            await app.loadScenario('inexistant');
            assert.equal(text(doc, 'scenarioMessage'), 'Scénario introuvable.');
        });

        it('les noms de scénario ne sont pas interprétés comme du HTML', async () => {
            setValue(doc, 'scenarioName', '<b>gras</b>');
            await app.saveScenario();
            assert.equal(doc.querySelector('#scenarioList b'), null);
            assert.match(text(doc, 'scenarioList'), /<b>gras<\/b>/);
        });
    });
});

describe('application (sans serveur, sans Chart.js)', () => {
    it('fonctionne entièrement en local et désactive les scénarios', async () => {
        const doc = createDom().document;
        const api = createFakeApi({ online: false });
        const app = initApp(doc, { api });
        await app.ready;
        assert.equal(doc.getElementById('status').dataset.mode, 'offline');
        assert.equal(doc.getElementById('scenarioName').disabled, true);
        assert.equal(app.state.source, 'local');
        assert.equal(text(doc, 'totalSeats'), '302');
        assert.ok([...doc.querySelectorAll('.chart-box')].every(box => box.hidden), 'cadres de graphiques masqués');
    });

    it('n’efface pas la suppression si l’utilisateur annule', async () => {
        const doc = createDom().document;
        const api = createFakeApi();
        const app = initApp(doc, { api, confirm: () => false });
        await app.ready;
        assert.equal(await app.deleteScenario('1'), false);
    });
});

describe('intégration frontend ↔ vrai serveur HTTP', () => {
    let server, baseUrl;

    before(async () => {
        server = createApp({ store: new ScenarioStore(), logger: { error() {} } });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    after(() => new Promise(resolve => server.close(resolve)));

    it('calcule côté serveur et gère un scénario de bout en bout', async () => {
        const doc = createDom().document;
        const app = initApp(doc, { api: createApiClient({ fetchImpl: fetch, baseUrl }) });
        await app.ready;
        assert.equal(app.state.source, 'server');
        assert.equal(text(doc, 'totalSeats'), '302');

        setValue(doc, 'scenarioName', 'Intégration');
        setValue(doc, 'totalCars', 12);
        const saved = await app.saveScenario();
        assert.equal(saved.summary.totalCars, 12);
        assert.equal(doc.querySelectorAll('#scenarioList li').length, 1);

        doc.getElementById('resetBtn').click();
        await app.loadScenario(saved.id);
        assert.equal(doc.getElementById('totalCars').value, '12');

        assert.equal(await app.deleteScenario(saved.id), true);
        assert.equal(text(doc, 'scenarioList'), 'Aucun scénario enregistré.');
    });
});
