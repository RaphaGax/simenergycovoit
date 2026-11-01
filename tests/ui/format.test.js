import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCo2, formatCredits, formatDistance, formatDate, formatTime, initial } from '../../src/ui/format.js';

const NBSP = ' ';

test('formatCo2 : grammes sous 1 kg, kilogrammes au-delà', () => {
    assert.equal(formatCo2(850), `850${NBSP}g`);
    assert.equal(formatCo2(26250), `26,3${NBSP}kg`);
});

test('formatCredits : accord au pluriel à partir de 2', () => {
    assert.equal(formatCredits(0.0263), `0,0263${NBSP}crédit`);
    assert.equal(formatCredits(2), `2,0000${NBSP}crédits`);
});

test('formatDistance : virgule décimale', () => {
    assert.equal(formatDistance(62.5), `62,5${NBSP}km`);
    assert.equal(formatDistance(100), `100${NBSP}km`);
});

test('initial : première lettre du prénom en majuscule, « ? » sans prénom', () => {
    assert.equal(initial('élodie'), 'É');
    assert.equal(initial('  Marc '), 'M');
    assert.equal(initial(''), '?');
    assert.equal(initial(undefined), '?');
});

test('formatDate et formatTime : date courte et heure locales', () => {
    const iso = new Date(2026, 2, 14, 8, 5).toISOString();
    assert.match(formatTime(iso), /^08[:h.]05$/);
    assert.match(formatDate(iso), /14/);
});
