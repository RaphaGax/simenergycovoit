import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCo2, formatCredits, formatDistance } from '../../src/ui/format.js';

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
