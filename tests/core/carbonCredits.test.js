import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    creditsFromCo2, createCreditEntry, advanceCreditStatus, aggregateCredits, submitForValidation,
    progressToNextCredit, CREDIT_STATUS
} from '../../src/core/carbonCredits.js';

const now = new Date('2026-10-10T12:00:00Z');
const later = new Date('2026-10-11T09:00:00Z');

test('1 crédit = 1 tonne de CO₂', () => {
    assert.equal(creditsFromCo2(1_000_000), 1);
    assert.equal(creditsFromCo2(4200), 0.0042);
});

test('une nouvelle entrée est « estimée », une seule par trajet', () => {
    const entry = createCreditEntry({ tripId: 't1', driverId: 'd1', co2AvoidedG: 500_000, passengerSeats: 2, now });
    assert.deepEqual(entry, {
        id: 'credit-t1', tripId: 't1', driverId: 'd1', passengerSeats: 2,
        co2AvoidedG: 500_000, credits: 0.5, status: CREDIT_STATUS.ESTIMATED, estimatedAt: '2026-10-10T12:00:00.000Z'
    });
    assert.throws(() => createCreditEntry({ co2AvoidedG: 10 }), RangeError);
    assert.throws(() => createCreditEntry({ tripId: 't1', co2AvoidedG: -1 }), RangeError);
});

test('statuts : estimé → en validation → validé, horodatés, sans retour en arrière', () => {
    const estimated = createCreditEntry({ tripId: 't1', co2AvoidedG: 1, now });
    const pending = advanceCreditStatus(estimated, { now: later });
    const validated = advanceCreditStatus(pending, { now: later });
    assert.equal(pending.status, CREDIT_STATUS.PENDING);
    assert.equal(pending.pendingAt, '2026-10-11T09:00:00.000Z');
    assert.equal(validated.status, CREDIT_STATUS.VALIDATED);
    assert.equal(validated.validatedAt, '2026-10-11T09:00:00.000Z');
    assert.equal(estimated.status, CREDIT_STATUS.ESTIMATED); // entrée d'origine inchangée
    assert.throws(() => advanceCreditStatus(validated), RangeError);
});

test('submitForValidation : ne soumet que les entrées estimées', () => {
    const a = createCreditEntry({ tripId: 'a', co2AvoidedG: 1, now });
    const b = advanceCreditStatus(createCreditEntry({ tripId: 'b', co2AvoidedG: 1, now }), { now });
    const c = createCreditEntry({ tripId: 'c', co2AvoidedG: 1, now });
    const submitted = submitForValidation([a, b, c], { now: later });
    assert.deepEqual(submitted.map(e => [e.tripId, e.status]), [['a', 'pending'], ['c', 'pending']]);
    assert.deepEqual(submitForValidation([b], { now }), []);
});

test('aggregateCredits : totaux par statut', () => {
    const a = createCreditEntry({ tripId: 'a', co2AvoidedG: 1_000_000, now });
    const b = advanceCreditStatus(createCreditEntry({ tripId: 'b', co2AvoidedG: 500_000, now }));
    const c = advanceCreditStatus(advanceCreditStatus(createCreditEntry({ tripId: 'c', co2AvoidedG: 250_000, now })));
    assert.deepEqual(aggregateCredits([a, b, c]), {
        estimated: 1, pending: 0.5, validated: 0.25, co2AvoidedG: 1_750_000
    });
    assert.deepEqual(aggregateCredits([]), { estimated: 0, pending: 0, validated: 0, co2AvoidedG: 0 });
});

test('progressToNextCredit : crédits entiers et fraction du suivant', () => {
    assert.deepEqual(progressToNextCredit(0), { completed: 0, fraction: 0 });
    const { completed, fraction } = progressToNextCredit(2.25);
    assert.equal(completed, 2);
    assert.equal(fraction, 0.25);
});
