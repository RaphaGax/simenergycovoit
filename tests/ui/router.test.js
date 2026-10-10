import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute, matchPath, parseHash } from '../../src/ui/router.js';

const routes = [
    { path: '/', view: 'home' },
    { path: '/passager/recherche', view: 'search' },
    { path: '/passager/reserver/:tripId', view: 'booking' },
    { path: '/conducteur/publier', view: 'publish' }
];

test('parseHash sépare chemin et requête, retire le # et la barre finale', () => {
    assert.deepEqual(parseHash('#/passager/recherche/'), { path: '/passager/recherche', query: {} });
    assert.deepEqual(parseHash('#/passager/reserver/abc?seats=2'), { path: '/passager/reserver/abc', query: { seats: '2' } });
    assert.equal(parseHash('').path, '/');
    assert.equal(parseHash('#nimporte').path, '/');
});

test('matchPath extrait les paramètres', () => {
    assert.deepEqual(matchPath('/passager/reserver/:tripId', '/passager/reserver/a%20b'), { tripId: 'a b' });
    assert.equal(matchPath('/passager/reserver/:tripId', '/passager/reserver'), null);
    assert.equal(matchPath('/passager/reserver/:tripId', '/passager/reserver/'), null);
    assert.deepEqual(matchPath('/', '/'), {});
});

test('matchRoute trouve la route correspondante avec ses paramètres', () => {
    assert.equal(matchRoute('#/passager/recherche', routes).route.view, 'search');
    assert.deepEqual(matchRoute('#/passager/reserver/t1?seats=2', routes),
        { route: routes[2], params: { tripId: 't1' }, query: { seats: '2' } });
});

test("matchRoute renvoie l'accueil pour un hash vide ou inconnu", () => {
    assert.equal(matchRoute('', routes).route.view, 'home');
    assert.equal(matchRoute('#/', routes).route.view, 'home');
    assert.equal(matchRoute('#/inconnu', routes).route.view, 'home');
});
