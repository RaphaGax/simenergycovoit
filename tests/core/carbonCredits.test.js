import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    creditsFromCo2, createCreditEntry, advanceCreditStatus, aggregateCredits, CREDIT_STATUS
} from '../../src/core/carbonCredits.js';

test('1 crédit = 1 tonne de CO₂', () => {
    assert.equal(creditsFromCo2(1_000_000), 1);
    assert.equal(creditsFromCo2(4200), 0.0042);
});

test('une nouvelle entrée est toujours « estimée »', () => {
    const entry = createCreditEntry({ tripId: 't1', co2AvoidedG: 500_000 });
    assert.deepEqual(entry, { tripId: 't1', co2AvoidedG: 500_000, credits: 0.5, status: CREDIT_STATUS.ESTIMATED });
    assert.throws(() => createCreditEntry({ co2AvoidedG: 10 }), RangeError);
    assert.throws(() => createCreditEntry({ tripId: 't1', co2AvoidedG: -1 }), RangeError);
});

test('statuts : estimé → en validation → validé, sans retour en arrière', () => {
    const estimated = createCreditEntry({ tripId: 't1', co2AvoidedG: 1 });
    const pending = advanceCreditStatus(estimated);
    const validated = advanceCreditStatus(pending);
    assert.equal(pending.status, CREDIT_STATUS.PENDING);
    assert.equal(validated.status, CREDIT_STATUS.VALIDATED);
    assert.equal(estimated.status, CREDIT_STATUS.ESTIMATED); // entrée d'origine inchangée
    assert.throws(() => advanceCreditStatus(validated), RangeError);
});

test('aggregateCredits : totaux par statut', () => {
    const a = createCreditEntry({ tripId: 'a', co2AvoidedG: 1_000_000 });
    const b = advanceCreditStatus(createCreditEntry({ tripId: 'b', co2AvoidedG: 500_000 }));
    const c = advanceCreditStatus(advanceCreditStatus(createCreditEntry({ tripId: 'c', co2AvoidedG: 250_000 })));
    assert.deepEqual(aggregateCredits([a, b, c]), {
        estimated: 1, pending: 0.5, validated: 0.25, co2AvoidedG: 1_750_000
    });
    assert.deepEqual(aggregateCredits([]), { estimated: 0, pending: 0, validated: 0, co2AvoidedG: 0 });
});
