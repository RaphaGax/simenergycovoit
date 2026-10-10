// Client ORS testé avec un fetch simulé : réponses au format de l'API openrouteservice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrsClient, OrsError } from '../../src/services/orsClient.js';

function fakeFetch(handler) {
    const calls = [];
    const fetch = async (url, options) => {
        calls.push({ url: String(url), options, body: options.body ? JSON.parse(options.body) : undefined });
        const { status = 200, json } = await handler(new URL(url), options);
        return { ok: status >= 200 && status < 300, status, json: async () => json };
    };
    return { fetch, calls };
}

// Requête qui ne répond jamais avant annulation. Le minuteur garde le processus Node actif :
// celui d'AbortSignal.timeout ne le fait pas (sans effet dans un navigateur).
function hangingFetch(url, { signal }) {
    return new Promise((_, reject) => {
        const keepAlive = setTimeout(() => {}, 5000);
        signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); });
    });
}

test('autocomplete : requête géocodage CH et lieux { label, coords }', async () => {
    const { fetch, calls } = fakeFetch(() => ({
        json: {
            type: 'FeatureCollection',
            features: [
                { type: 'Feature', geometry: { type: 'Point', coordinates: [6.1423, 46.2102] }, properties: { label: 'Genève, GE, Suisse' } },
                { type: 'Feature', geometry: null, properties: { label: 'Sans géométrie' } }
            ]
        }
    }));
    const ors = createOrsClient({ apiKey: 'cle', fetch });
    assert.deepEqual(await ors.autocomplete('Genève'), [{ label: 'Genève, GE, Suisse', coords: [6.1423, 46.2102] }]);

    const url = new URL(calls[0].url);
    assert.equal(url.origin + url.pathname, 'https://api.openrouteservice.org/geocode/autocomplete');
    assert.equal(url.searchParams.get('text'), 'Genève');
    assert.equal(url.searchParams.get('boundary.country'), 'CH');
    assert.equal(calls[0].options.headers.Authorization, 'cle');
    assert.equal(url.searchParams.has('api_key'), false); // la clé ne passe pas dans l'URL
});

test('directions : distance en km et durée en minutes', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { routes: [{ summary: { distance: 62450, duration: 2880 } }] } }));
    const ors = createOrsClient({ apiKey: 'cle', fetch });
    assert.deepEqual(await ors.directions([6.63, 46.52], [6.14, 46.21]), { distanceKm: 62.45, durationMin: 48 });
    assert.ok(calls[0].url.endsWith('/v2/directions/driving-car'));
    assert.deepEqual(calls[0].body, { coordinates: [[6.63, 46.52], [6.14, 46.21]] });
});

test('matrix : demande distances en km et durées', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { durations: [[0, 60], [60, 0]], distances: [[0, 1.2], [1.2, 0]] } }));
    const ors = createOrsClient({ apiKey: 'cle', fetch });
    const result = await ors.matrix([[6.6, 46.5], [6.5, 46.5]]);
    assert.deepEqual(result.distances[0][1], 1.2);
    assert.deepEqual(calls[0].body, { locations: [[6.6, 46.5], [6.5, 46.5]], metrics: ['distance', 'duration'], units: 'km' });
});

test('optimize : envoie le problème VROOM tel quel', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { code: 0, routes: [] } }));
    const ors = createOrsClient({ apiKey: 'cle', fetch });
    const problem = { vehicles: [{ id: 1 }], shipments: [] };
    assert.deepEqual(await ors.optimize(problem), { code: 0, routes: [] });
    assert.ok(calls[0].url.endsWith('/optimization'));
    assert.deepEqual(calls[0].body, problem);
});

test('erreurs HTTP traduites en messages clairs', async () => {
    for (const [status, message] of [[403, /Clé openrouteservice refusée/], [429, /Quota/], [503, /indisponible/], [400, /refusée \(400\)/]]) {
        const ors = createOrsClient({ apiKey: 'cle', fetch: fakeFetch(() => ({ status, json: {} })).fetch });
        await assert.rejects(ors.directions([0, 0], [1, 1]), err => err instanceof OrsError && message.test(err.message) && err.status === status);
    }
});

test('panne réseau, délai dépassé et réponse vide', async () => {
    const down = createOrsClient({ apiKey: 'cle', fetch: async () => { throw new TypeError('Failed to fetch'); } });
    await assert.rejects(down.matrix([]), /Connexion à openrouteservice impossible/);

    const slow = createOrsClient({
        apiKey: 'cle', timeoutMs: 20,
        fetch: hangingFetch
    });
    await assert.rejects(slow.matrix([]), /ne répond pas/);

    const empty = createOrsClient({ apiKey: 'cle', fetch: fakeFetch(() => ({ json: { routes: [] } })).fetch });
    await assert.rejects(empty.directions([0, 0], [1, 1]), /Aucun itinéraire/);
});

test('annulation par l’appelant : l’erreur d’annulation est transmise telle quelle', async () => {
    const controller = new AbortController();
    const ors = createOrsClient({
        apiKey: 'cle',
        fetch: hangingFetch
    });
    const pending = ors.autocomplete('Ge', { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, err => err.name === 'AbortError');
});

test('clé manquante refusée à la création', () => {
    assert.throws(() => createOrsClient({ apiKey: '' }), OrsError);
});
