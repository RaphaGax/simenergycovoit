// Crédits carbone des conducteurs. 1 crédit = 1 tonne de CO₂ équivalent évitée.
// Un crédit n'est « validé » qu'après vérification par un standard reconnu : l'application
// distingue toujours l'estimation de la validation.
export const GRAMS_PER_CREDIT = 1_000_000;

export const CREDIT_STATUS = Object.freeze({
    ESTIMATED: 'estimated', // calculé par l'application
    PENDING: 'pending', // transmis pour vérification
    VALIDATED: 'validated' // vérifié et émis
});

const NEXT_STATUS = {
    [CREDIT_STATUS.ESTIMATED]: CREDIT_STATUS.PENDING,
    [CREDIT_STATUS.PENDING]: CREDIT_STATUS.VALIDATED
};

export function creditsFromCo2(co2AvoidedG) {
    return co2AvoidedG / GRAMS_PER_CREDIT;
}

export function createCreditEntry({ tripId, co2AvoidedG }) {
    if (!tripId) throw new RangeError('tripId est requis');
    if (!(Number.isFinite(co2AvoidedG) && co2AvoidedG >= 0)) {
        throw new RangeError('co2AvoidedG doit être un nombre ≥ 0');
    }
    return { tripId, co2AvoidedG, credits: creditsFromCo2(co2AvoidedG), status: CREDIT_STATUS.ESTIMATED };
}

// Passe à l'étape suivante (estimé → en validation → validé) ; renvoie une nouvelle entrée.
export function advanceCreditStatus(entry) {
    const next = NEXT_STATUS[entry.status];
    if (!next) throw new RangeError(`Aucune étape après « ${entry.status} »`);
    return { ...entry, status: next };
}

export function aggregateCredits(entries) {
    const totals = { estimated: 0, pending: 0, validated: 0, co2AvoidedG: 0 };
    for (const entry of entries) {
        totals[entry.status] += entry.credits;
        totals.co2AvoidedG += entry.co2AvoidedG;
    }
    return totals;
}
