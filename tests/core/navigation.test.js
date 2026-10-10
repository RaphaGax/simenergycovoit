import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWazeLink, driverDestination, passengerMeetingPoint } from '../../src/core/navigation.js';

const GENEVE = [6.1423, 46.2102]; // [longitude, latitude], format stocké par EcoVroom

test('coordonnées : lien ll=latitude,longitude avec navigate=yes (ordre inversé par rapport au stockage)', () => {
    const link = buildWazeLink({ label: 'Genève, GE, Suisse', coords: GENEVE });
    assert.equal(link.ok, true);
    assert.equal(link.precise, true);
    assert.equal(link.url, 'https://waze.com/ul?ll=46.210200%2C6.142300&navigate=yes&utm_source=ecovroom');

    const url = new URL(link.url);
    const [lat, lon] = url.searchParams.get('ll').split(',').map(Number);
    assert.deepEqual([lat, lon], [46.2102, 6.1423]);
    assert.equal(url.origin + url.pathname, 'https://waze.com/ul');
});

test('coordonnées négatives et précision limitée à 6 décimales', () => {
    const url = new URL(buildWazeLink({ label: 'X', coords: [-73.985131234, 40.758895678] }).url);
    assert.equal(url.searchParams.get('ll'), '40.758896,-73.985131');
});

test('adresse sans coordonnées : recherche q= encodée, sans promettre de navigation directe', () => {
    const link = buildWazeLink({ label: '  Rue de Genève 12,  1003 Lausanne & co ', coords: null });
    assert.equal(link.ok, true);
    assert.equal(link.precise, false);
    assert.equal(link.url, 'https://waze.com/ul?q=Rue%20de%20Gen%C3%A8ve%2012%2C%201003%20Lausanne%20%26%20co&utm_source=ecovroom');
    const url = new URL(link.url);
    assert.equal(url.searchParams.get('q'), 'Rue de Genève 12, 1003 Lausanne & co');
    assert.equal(url.searchParams.has('navigate'), false);
    assert.equal(url.searchParams.has('ll'), false);
});

test('coordonnées invalides ou nulles (0, 0) : repli sur l’adresse, jamais de coordonnées inventées', () => {
    for (const coords of [[0, 0], [200, 46], [6.1, 95], [6.1], ['6', '46'], [NaN, 46]]) {
        const link = buildWazeLink({ label: 'Nyon, VD, Suisse', coords });
        assert.equal(link.precise, false, JSON.stringify(coords));
        assert.equal(new URL(link.url).searchParams.get('q'), 'Nyon, VD, Suisse');
    }
});

test('destination absente ou inutilisable : pas de lien, message explicite', () => {
    for (const place of [null, undefined, {}, { label: '' }, { label: '   ', coords: null }, { label: 'ab' }, { label: 'x'.repeat(201) }]) {
        const link = buildWazeLink(place);
        assert.equal(link.ok, false, JSON.stringify(place));
        assert.equal(link.url, undefined);
        assert.match(link.reason, /Destination (manquante|invalide)/);
    }
    assert.match(buildWazeLink({ label: '' }).reason, /manquante/);
    assert.match(buildWazeLink({ label: 'ab' }).reason, /invalide/);
});

test('conducteur : arrivée du trajet ; passager : point de rendez-vous ou départ du trajet', () => {
    const trip = { origin: 'Lausanne', originCoords: [6.6291, 46.5167], destination: 'Genève', destinationCoords: GENEVE };
    assert.deepEqual(driverDestination(trip), { label: 'Genève', coords: GENEVE });
    assert.deepEqual(driverDestination({ destination: 'Genève' }), { label: 'Genève', coords: null });

    const withPickup = { pickup: { label: 'Morges', coords: [6.4983, 46.5113] } };
    assert.deepEqual(passengerMeetingPoint(withPickup, trip), { label: 'Morges', coords: [6.4983, 46.5113] });
    assert.deepEqual(passengerMeetingPoint({}, trip), { label: 'Lausanne', coords: [6.6291, 46.5167] });
});
