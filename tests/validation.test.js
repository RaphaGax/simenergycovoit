import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sumMix, validateInput } from '../public/js/core/validation.js';
import { DEFAULT_INPUT } from '../public/js/core/vehicles.js';

const fields = result => result.errors.map(e => e.field);

describe('validateInput', () => {
    it('accepte l’entrée par défaut et la normalise', () => {
        const { valid, errors, value } = validateInput(DEFAULT_INPUT);
        assert.equal(valid, true);
        assert.deepEqual(errors, []);
        assert.equal(value.totalCars, 100);
        assert.equal(value.mix.gas, 0);
    });

    it('complète les champs manquants avec les valeurs par défaut', () => {
        const { valid, value } = validateInput({});
        assert.equal(valid, true);
        assert.deepEqual(value, { ...DEFAULT_INPUT, mix: { ...DEFAULT_INPUT.mix } });
    });

    it('convertit les chaînes, y compris avec une virgule décimale', () => {
        const { value } = validateInput({ ...DEFAULT_INPUT, dailyKm: '12,5', mix: { electric: '50,5', diesel: '49.5' } });
        assert.equal(value.dailyKm, 12.5);
        assert.equal(value.mix.electric, 50.5);
    });

    for (const [name, raw] of [['objet null', null], ['tableau', []], ['chaîne', 'abc'], ['nombre', 42]]) {
        it(`refuse une entrée de type ${name}`, () => {
            assert.equal(validateInput(raw).valid, false);
        });
    }

    for (const [field, bad] of [
        ['totalCars', 0], ['totalCars', 2.5], ['totalCars', 100001], ['totalCars', ''], ['totalCars', 'dix'],
        ['aiRequests', -1], ['dailyKm', 2001], ['daysPerYear', 0], ['daysPerYear', 400],
        ['occupancy', 0], ['occupancy', 1.5], ['occupancy', Infinity], ['totalCars', null]
    ]) {
        it(`refuse ${field} = ${JSON.stringify(bad)}`, () => {
            const result = validateInput({ ...DEFAULT_INPUT, [field]: bad });
            assert.equal(result.valid, false);
            assert.deepEqual(fields(result), [field]);
            assert.equal(result.value, null);
        });
    }

    it('accepte les bornes', () => {
        assert.equal(validateInput({ ...DEFAULT_INPUT, totalCars: 1, aiRequests: 0, dailyKm: 0, daysPerYear: 366, occupancy: 1 }).valid, true);
    });

    it('refuse une somme de pourcentages différente de 100 %', () => {
        const result = validateInput({ ...DEFAULT_INPUT, mix: { electric: 50, diesel: 40 } });
        assert.deepEqual(fields(result), ['mix']);
        assert.match(result.errors[0].message, /90 %/);
    });

    it('tolère un écart d’arrondi de 0,1 %', () => {
        assert.equal(validateInput({ ...DEFAULT_INPUT, mix: { electric: 33.33, diesel: 33.33, petrol: 33.33 } }).valid, true);
    });

    it('refuse un pourcentage négatif ou supérieur à 100', () => {
        const result = validateInput({ ...DEFAULT_INPUT, mix: { electric: 120, diesel: -20 } });
        assert.ok(fields(result).includes('mix.electric'));
        assert.ok(fields(result).includes('mix.diesel'));
    });

    it('refuse un type de véhicule inconnu', () => {
        const result = validateInput({ ...DEFAULT_INPUT, mix: { electric: 50, trottinette: 50 } });
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => /trottinette/.test(e.message)));
    });

    it('refuse une répartition qui n’est pas un objet', () => {
        assert.deepEqual(fields(validateInput({ ...DEFAULT_INPUT, mix: [100] })), ['mix']);
    });

    it('rapporte toutes les erreurs à la fois', () => {
        const result = validateInput({ totalCars: -5, occupancy: 2, mix: { electric: 10 } });
        assert.deepEqual(fields(result).sort(), ['mix', 'occupancy', 'totalCars']);
    });
});

describe('sumMix', () => {
    it('additionne les types connus et ignore les autres', () => {
        assert.equal(sumMix({ electric: 10, diesel: '5', inconnu: 1000 }), 15);
        assert.equal(sumMix(undefined), 0);
    });
});
