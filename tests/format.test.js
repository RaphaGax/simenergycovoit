import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatNumber, resultToCsv, THOUSANDS_SEPARATOR } from '../public/js/format.js';
import { simulate } from '../public/js/core/simulator.js';
import { DEFAULT_INPUT } from '../public/js/core/vehicles.js';

// Intl fr-CH utilise une apostrophe typographique comme séparateur de milliers.
const normalize = text => text.replace(/[’ʼ']/g, "'");

describe('formatNumber', () => {
    it('formate avec le nombre de décimales demandé', () => {
        assert.equal(formatNumber(3.14159, 2), '3,14');
        assert.equal(formatNumber(2, 1), '2,0');
        assert.equal(formatNumber(2.6), '3');
        assert.equal(formatNumber(-12.345, 1), '-12,3');
    });

    it('groupe les milliers avec une espace fine insécable', () => {
        const sep = THOUSANDS_SEPARATOR;
        assert.equal(formatNumber(1234567.891, 2), `1${sep}234${sep}567,89`);
        assert.equal(formatNumber(-1000), `-1${sep}000`);
        assert.equal(formatNumber(999), '999');
    });

    it('n’affiche jamais « -0 »', () => {
        assert.equal(formatNumber(-0.0001, 2), '0,00');
        assert.equal(formatNumber(-0.4), '0');
    });

    it('affiche un tiret pour les valeurs non finies', () => {
        assert.equal(formatNumber(NaN), '–');
        assert.equal(formatNumber(Infinity), '–');
        assert.equal(formatNumber(undefined), '–');
    });
});

describe('resultToCsv', () => {
    const csv = resultToCsv(simulate(DEFAULT_INPUT));
    const lines = csv.split('\r\n');

    it('contient les trois blocs séparés par des lignes vides', () => {
        assert.match(lines[0], /^Type;Nombre;Places/);
        assert.equal(lines.filter(l => l === '').length, 3, 'deux séparateurs + fin de fichier');
        assert.ok(lines.some(l => l.startsWith('Charge (%);')));
        assert.ok(lines.some(l => l.startsWith('Économie de CO2 (kg);')));
    });

    it('liste une ligne par type de véhicule présent', () => {
        assert.ok(lines.some(l => l.startsWith('Électrique;21;4;0,17;0;')));
        assert.equal(lines.filter(l => /^(Électrique|Hybride rechargeable|Diesel|Essence);/.test(l)).length, 4);
    });

    it('échappe les cellules contenant le séparateur ou des guillemets', () => {
        const fake = {
            rows: [{ label: 'Mon "parc"; test', count: 1, seats: 1, energy: 1, co2Direct: 0, co2Indirect: 0, nox: 0, so2: 0 }],
            loadProfile: [],
            annual: { energy: 0, co2Kg: 0, solo: { energy: 0, co2Kg: 0 }, savings: { co2Kg: 0 } },
            ai: { energyPerYear: 0, co2PerYearKg: 0 }
        };
        assert.match(resultToCsv(fake), /^"Mon ""parc""; test";1;/m);
    });
});
