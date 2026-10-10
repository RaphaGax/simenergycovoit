// Client API du navigateur, testé avec un fetch simulé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../../src/services/api.js';

function fakeFetch(respond) {
    const calls = [];
    const fetch = async (url, options) => {
        calls.push({ url: new URL(url), options, body: options.body ? JSON.parse(options.body) : undefined });
        const { status = 200, json } = respond(new URL(url), options);
        return { ok: status < 400, status, json: async () => { if (json === undefined) throw new Error('vide'); return json; } };
    };
    return { fetch, calls };
}

test('GET : paramètres vides ignorés, cookie de session envoyé (same-origin)', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { results: [] } }));
    const api = createApi({ fetch });
    await api.trips.search({ origin: 'Lausanne', destination: '', date: undefined, seats: 2 });
    assert.equal(calls[0].url.pathname, '/api/trips');
    assert.deepEqual(Object.fromEntries(calls[0].url.searchParams), { origin: 'Lausanne', seats: '2' });
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.body, undefined);
});

test('POST : corps JSON, même vide, avec l’en-tête Content-Type', async () => {
    const { fetch, calls } = fakeFetch(() => ({ json: { submitted: [] } }));
    const api = createApi({ fetch });
    await api.credits.submit();
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    assert.deepEqual(calls[0].body, {});
    await api.bookings.create({ tripId: 'a/b', seats: 1 });
    assert.deepEqual(calls[1].body, { tripId: 'a/b', seats: 1 });
    await api.bookings.cancel('a/b');
    assert.equal(calls[2].url.pathname, '/api/bookings/a%2Fb/cancel');
});

test('erreurs : message, statut et champs du serveur ; serveur injoignable', async () => {
    const api = createApi({ fetch: fakeFetch(() => ({ status: 400, json: { error: 'Trajet invalide.', fields: { seats: 'Trop' } } })).fetch });
    await assert.rejects(api.trips.publish({}), err =>
        err instanceof ApiError && err.status === 400 && err.message === 'Trajet invalide.' && err.fields.seats === 'Trop');

    const empty = createApi({ fetch: fakeFetch(() => ({ status: 502 })).fetch });
    await assert.rejects(empty.config(), /Erreur 502/);

    const down = createApi({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
    await assert.rejects(down.auth.me(), err => err.status === 0 && /injoignable/.test(err.message));
});

test('proxy ORS : même interface que le client ORS direct', async () => {
    const { fetch, calls } = fakeFetch(url => ({ json: url.pathname.endsWith('autocomplete') ? { places: [{ label: 'Nyon' }] } : { durations: [], distances: [] } }));
    const api = createApi({ fetch });
    assert.deepEqual(await api.ors.autocomplete('Nyo'), [{ label: 'Nyon' }]);
    assert.equal(calls[0].url.searchParams.get('text'), 'Nyo');
    await api.ors.matrix([[6, 46], [7, 46]]);
    assert.deepEqual(calls[1].body, { locations: [[6, 46], [7, 46]] });
});
