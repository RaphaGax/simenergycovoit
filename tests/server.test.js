import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';

import { createApp, MAX_BODY_BYTES, VERSION } from '../server/app.js';
import { ScenarioStore } from '../server/storage.js';
import { DEFAULT_INPUT } from '../public/js/core/vehicles.js';
import { simulate } from '../public/js/core/simulator.js';

let server;
let baseUrl;
const silentLogger = { error() {} };

before(async () => {
    server = createApp({ store: new ScenarioStore(), logger: silentLogger });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(resolve => server.close(resolve)));

const call = (path, { method = 'GET', body, headers = {} } = {}) => fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
});

describe('API générale', () => {
    it('GET /api/health', async () => {
        const res = await call('/api/health');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /application\/json/);
        assert.deepEqual(await res.json(), { status: 'ok', version: VERSION });
    });

    it('GET /api/vehicles expose le référentiel', async () => {
        const data = await (await call('/api/vehicles')).json();
        assert.equal(data.vehicles.electric.seats, 4);
        assert.equal(data.defaults.totalCars, 100);
        assert.equal(data.assumptions.datacenterPue, 1.5);
    });

    it('404 sur une route inconnue', async () => {
        const res = await call('/api/inconnue');
        assert.equal(res.status, 404);
        assert.ok((await res.json()).error);
    });

    it('405 avec en-tête Allow sur une mauvaise méthode', async () => {
        const res = await call('/api/health', { method: 'DELETE' });
        assert.equal(res.status, 405);
        assert.equal(res.headers.get('allow'), 'GET');
    });
});

describe('POST /api/simulate', () => {
    it('renvoie le même résultat que le moteur local', async () => {
        const res = await call('/api/simulate', { method: 'POST', body: DEFAULT_INPUT });
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), JSON.parse(JSON.stringify(simulate(DEFAULT_INPUT))));
    });

    it('400 avec le détail des erreurs de validation', async () => {
        const res = await call('/api/simulate', { method: 'POST', body: { ...DEFAULT_INPUT, totalCars: 0, mix: { electric: 10 } } });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.deepEqual(data.details.map(d => d.field).sort(), ['mix', 'totalCars']);
    });

    it('400 sur un JSON mal formé', async () => {
        const res = await call('/api/simulate', { method: 'POST', body: '{"totalCars":' });
        assert.equal(res.status, 400);
        assert.equal((await res.json()).error, 'JSON invalide.');
    });

    it('400 sur un corps vide', async () => {
        const res = await call('/api/simulate', { method: 'POST', body: '' });
        assert.equal(res.status, 400);
    });

    it('415 si le type de contenu n’est pas JSON', async () => {
        const res = await call('/api/simulate', { method: 'POST', body: 'a=1', headers: { 'Content-Type': 'text/plain' } });
        assert.equal(res.status, 415);
    });

    it('413 si le corps est trop volumineux', async () => {
        const res = await call('/api/simulate', { method: 'POST', body: JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES) }) });
        assert.equal(res.status, 413);
    });
});

describe('CRUD /api/scenarios', () => {
    it('cycle de vie complet d’un scénario', async () => {
        let res = await call('/api/scenarios');
        assert.deepEqual(await res.json(), { scenarios: [] });

        res = await call('/api/scenarios', { method: 'POST', body: { name: 'Parc 2030', input: { ...DEFAULT_INPUT, totalCars: '50' } } });
        assert.equal(res.status, 201);
        const created = await res.json();
        assert.equal(created.name, 'Parc 2030');
        assert.equal(created.input.totalCars, 50, 'l’entrée est stockée normalisée');
        assert.equal(created.summary.totalCars, 50);
        assert.ok(created.summary.co2SavingsKg > 0);

        res = await call('/api/scenarios');
        assert.deepEqual((await res.json()).scenarios.map(s => s.id), [created.id]);

        res = await call(`/api/scenarios/${created.id}`);
        assert.equal(res.status, 200);
        assert.deepEqual((await res.json()).input, created.input);

        res = await call(`/api/scenarios/${created.id}`, { method: 'DELETE' });
        assert.equal(res.status, 204);
        assert.equal(await res.text(), '');

        res = await call(`/api/scenarios/${created.id}`);
        assert.equal(res.status, 404);
        res = await call(`/api/scenarios/${created.id}`, { method: 'DELETE' });
        assert.equal(res.status, 404);
    });

    it('refuse une configuration invalide', async () => {
        const res = await call('/api/scenarios', { method: 'POST', body: { name: 'KO', input: { totalCars: -1 } } });
        assert.equal(res.status, 400);
        assert.equal((await res.json()).details[0].field, 'totalCars');
    });

    it('refuse un nom vide', async () => {
        const res = await call('/api/scenarios', { method: 'POST', body: { name: ' ', input: DEFAULT_INPUT } });
        assert.equal(res.status, 400);
    });

    it('refuse un corps qui n’est pas un objet', async () => {
        const res = await call('/api/scenarios', { method: 'POST', body: 'null' });
        assert.equal(res.status, 400);
    });
});

describe('fichiers statiques', () => {
    it('sert index.html à la racine', async () => {
        const res = await call('/');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /text\/html/);
        assert.match(await res.text(), /EcoVroom light/);
    });

    it('sert les modules JS avec le bon type MIME', async () => {
        const res = await call('/js/core/simulator.js');
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type'), /text\/javascript/);
    });

    it('HEAD ne renvoie pas de corps', async () => {
        const res = await call('/styles.css', { method: 'HEAD' });
        assert.equal(res.status, 200);
        assert.equal(await res.text(), '');
    });

    it('404 pour un fichier absent', async () => {
        assert.equal((await call('/absent.html')).status, 404);
    });

    // Requête brute : fetch normaliserait le chemin avant l'envoi.
    const rawGet = path => new Promise((resolve, reject) => {
        const req = request(`${baseUrl}${path}`, res => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.end();
    });

    for (const path of ['/..%2f..%2fpackage.json', '/%2e%2e%2fpackage.json', '/js/..%2f..%2fserver%2fapp.js']) {
        it(`bloque la traversée de répertoire ${path}`, async () => {
            const res = await rawGet(path);
            assert.ok([403, 404].includes(res.status), `statut ${res.status}`);
            assert.doesNotMatch(res.body, /ecovroom-light|createServer/);
        });
    }

    it('400 pour un chemin mal encodé', async () => {
        assert.equal((await call('/%E0%A4%A')).status, 400);
    });

    it('405 pour un POST sur un fichier statique', async () => {
        assert.equal((await call('/index.html', { method: 'POST', body: {} })).status, 405);
    });
});

describe('erreurs internes', () => {
    it('renvoie 500 sans divulguer le détail', async () => {
        const brokenStore = { list() { throw new Error('disque plein'); } };
        const broken = createApp({ store: brokenStore, logger: silentLogger });
        await new Promise(resolve => broken.listen(0, '127.0.0.1', resolve));
        try {
            const res = await fetch(`http://127.0.0.1:${broken.address().port}/api/scenarios`);
            assert.equal(res.status, 500);
            assert.deepEqual(await res.json(), { error: 'Erreur interne du serveur.' });
        } finally {
            await new Promise(resolve => broken.close(resolve));
        }
    });
});
