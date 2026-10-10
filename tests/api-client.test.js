import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ApiError, createApiClient, simulateWithFallback } from '../public/js/api.js';

function mockFetch(responder) {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, ...options });
        return responder(url, options);
    };
    return { fetchImpl, calls };
}

const jsonResponse = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

describe('createApiClient', () => {
    it('envoie le corps JSON avec les bons en-têtes', async () => {
        const { fetchImpl, calls } = mockFetch(() => jsonResponse(200, { ok: true }));
        const api = createApiClient({ fetchImpl, baseUrl: 'http://x' });
        assert.deepEqual(await api.simulate({ totalCars: 3 }), { ok: true });
        assert.equal(calls[0].url, 'http://x/api/simulate');
        assert.equal(calls[0].method, 'POST');
        assert.equal(calls[0].headers['Content-Type'], 'application/json');
        assert.deepEqual(JSON.parse(calls[0].body), { totalCars: 3 });
    });

    it('n’envoie pas de corps pour un GET', async () => {
        const { fetchImpl, calls } = mockFetch(() => jsonResponse(200, { scenarios: [{ id: 'a' }] }));
        const api = createApiClient({ fetchImpl });
        assert.deepEqual(await api.listScenarios(), [{ id: 'a' }]);
        assert.equal(calls[0].body, undefined);
        assert.equal(calls[0].headers['Content-Type'], undefined);
    });

    it('encode les identifiants dans l’URL', async () => {
        const { fetchImpl, calls } = mockFetch(() => jsonResponse(204));
        const api = createApiClient({ fetchImpl });
        assert.equal(await api.deleteScenario('a/b?c'), null);
        assert.equal(calls[0].url, '/api/scenarios/a%2Fb%3Fc');
        assert.equal(calls[0].method, 'DELETE');
    });

    it('transforme une erreur HTTP en ApiError avec détails', async () => {
        const { fetchImpl } = mockFetch(() => jsonResponse(400, { error: 'Paramètres invalides.', details: [{ field: 'totalCars', message: 'x' }] }));
        const api = createApiClient({ fetchImpl });
        await assert.rejects(api.simulate({}), err => {
            assert.ok(err instanceof ApiError);
            assert.equal(err.status, 400);
            assert.equal(err.message, 'Paramètres invalides.');
            assert.equal(err.details[0].field, 'totalCars');
            assert.equal(err.isNetworkError, false);
            return true;
        });
    });

    it('signale une panne réseau avec le statut 0', async () => {
        const api = createApiClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
        await assert.rejects(api.health(), err => err.isNetworkError && /injoignable/.test(err.message));
    });

    it('traite une réponse non JSON réussie comme une absence d’API', async () => {
        const api = createApiClient({ fetchImpl: async () => new Response('<html>', { status: 200 }) });
        await assert.rejects(api.health(), err => err.isNetworkError);
    });

    it('conserve le statut d’une réponse d’erreur non JSON', async () => {
        const api = createApiClient({ fetchImpl: async () => new Response('Not found', { status: 404 }) });
        await assert.rejects(api.health(), err => err.status === 404);
    });
});

describe('simulateWithFallback', () => {
    const local = input => ({ local: true, input });

    it('utilise le serveur quand il répond', async () => {
        const api = { simulate: async () => ({ remote: true }) };
        assert.deepEqual(await simulateWithFallback(api, local, {}), { result: { remote: true }, source: 'server' });
    });

    for (const status of [0, 404, 405]) {
        it(`bascule en local si le serveur renvoie ${status}`, async () => {
            const api = { simulate: async () => { throw new ApiError(status, 'x'); } };
            const { result, source } = await simulateWithFallback(api, local, { a: 1 });
            assert.equal(source, 'local');
            assert.deepEqual(result, { local: true, input: { a: 1 } });
        });
    }

    it('propage les erreurs de validation du serveur', async () => {
        const api = { simulate: async () => { throw new ApiError(400, 'invalide'); } };
        await assert.rejects(simulateWithFallback(api, local, {}), err => err.status === 400);
    });

    it('propage les erreurs serveur (500)', async () => {
        const api = { simulate: async () => { throw new ApiError(500, 'boom'); } };
        await assert.rejects(simulateWithFallback(api, local, {}), err => err.status === 500);
    });
});
