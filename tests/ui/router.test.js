import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute, normalizePath } from '../../src/ui/router.js';

const routes = [
    { path: '/', view: 'home' },
    { path: '/passager/recherche', view: 'search' },
    { path: '/conducteur/publier', view: 'publish' }
];

test('normalizePath retire le # et la barre finale', () => {
    assert.equal(normalizePath('#/passager/recherche/'), '/passager/recherche');
    assert.equal(normalizePath(''), '/');
    assert.equal(normalizePath('#nimporte'), '/');
});

test('matchRoute trouve la route correspondante', () => {
    assert.equal(matchRoute('#/passager/recherche', routes).view, 'search');
    assert.equal(matchRoute('#/conducteur/publier', routes).view, 'publish');
});

test("matchRoute renvoie l'accueil pour un hash vide ou inconnu", () => {
    assert.equal(matchRoute('', routes).view, 'home');
    assert.equal(matchRoute('#/', routes).view, 'home');
    assert.equal(matchRoute('#/inconnu', routes).view, 'home');
});
