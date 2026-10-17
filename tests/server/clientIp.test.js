import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from '../../server/http.js';

const request = (forwardedFor, socketIp = '10.0.0.5') => ({
    socket: { remoteAddress: socketIp },
    headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor }
});

test('sans proxy de confiance (0) : X-Forwarded-For est ignoré', () => {
    assert.equal(clientIp(request('1.2.3.4')), '10.0.0.5');
    assert.equal(clientIp(request('1.2.3.4'), 0), '10.0.0.5');
});

test('un proxy de confiance : adresse ajoutée par le proxy (dernière de l’en-tête)', () => {
    assert.equal(clientIp(request('203.0.113.7'), 1), '203.0.113.7');
    // Valeur falsifiée par le visiteur au début de l'en-tête : ignorée.
    assert.equal(clientIp(request('6.6.6.6, 203.0.113.7'), 1), '203.0.113.7');
    assert.equal(clientIp(request(' 6.6.6.6 ,203.0.113.7 '), 1), '203.0.113.7');
});

test('deux proxys de confiance : on remonte d’une position de plus', () => {
    assert.equal(clientIp(request('6.6.6.6, 203.0.113.7, 198.51.100.2'), 2), '203.0.113.7');
});

test('en-tête absent, vide ou trop court : jamais de valeur inventée', () => {
    assert.equal(clientIp(request(undefined), 1), '10.0.0.5');
    assert.equal(clientIp(request(''), 1), '10.0.0.5');
    assert.equal(clientIp(request('203.0.113.7'), 3), '203.0.113.7'); // borne : première adresse connue
    assert.equal(clientIp({ headers: {} }, 1), 'inconnu');
});

test('valeur de réglage invalide : comportement sûr (en-tête ignoré)', () => {
    for (const hops of [-1, 1.5, '1', null, NaN]) {
        assert.equal(clientIp(request('203.0.113.7'), hops), '10.0.0.5', String(hops));
    }
});
