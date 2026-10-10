// Crédits carbone des conducteurs. 1 crédit = 1 tonne de CO₂ équivalent évitée.
// Un crédit n'est « validé » qu'après vérification par un standard reconnu : l'application
// distingue toujours l'estimation de la validation, et ne valide jamais elle-même.
export const GRAMS_PER_CREDIT = 1_000_000;

export const CREDIT_STATUS = Object.freeze({
    ESTIMATED: 'estimated', // calculé par l'application après un trajet effectué
    PENDING: 'pending', // soumis pour vérification
    VALIDATED: 'validated' // vérifié et émis par l'organisme de certification
});

const NEXT_STATUS = {
    [CREDIT_STATUS.ESTIMATED]: CREDIT_STATUS.PENDING,
    [CREDIT_STATUS.PENDING]: CREDIT_STATUS.VALIDATED
};

export function creditsFromCo2(co2AvoidedG) {
    return co2AvoidedG / GRAMS_PER_CREDIT;
}

// Une entrée par trajet effectué (id dérivé du trajet : un trajet ne génère qu'une entrée).
export function createCreditEntry({ tripId, driverId = null, co2AvoidedG, passengerSeats = 0, now = new Date() }) {
    if (!tripId) throw new RangeError('tripId est requis');
    if (!(Number.isFinite(co2AvoidedG) && co2AvoidedG >= 0)) {
        throw new RangeError('co2AvoidedG doit être un nombre ≥ 0');
    }
    return {
        id: `credit-${tripId}`,
        tripId,
        driverId,
        passengerSeats,
        co2AvoidedG,
        credits: creditsFromCo2(co2AvoidedG),
        status: CREDIT_STATUS.ESTIMATED,
        estimatedAt: now.toISOString()
    };
}

// Passe à l'étape suivante (estimé → en validation → validé) et horodate le changement
// (pendingAt, validatedAt) ; renvoie une nouvelle entrée.
export function advanceCreditStatus(entry, { now = new Date() } = {}) {
    const next = NEXT_STATUS[entry.status];
    if (!next) throw new RangeError(`Aucune étape après « ${entry.status} »`);
    return { ...entry, status: next, [`${next}At`]: now.toISOString() };
}

// Soumet pour vérification toutes les entrées encore « estimées » ; renvoie les entrées modifiées.
export function submitForValidation(entries, { now = new Date() } = {}) {
    return entries
        .filter(entry => entry.status === CREDIT_STATUS.ESTIMATED)
        .map(entry => advanceCreditStatus(entry, { now }));
}

export function aggregateCredits(entries) {
    const totals = { estimated: 0, pending: 0, validated: 0, co2AvoidedG: 0 };
    for (const entry of entries) {
        totals[entry.status] += entry.credits;
        totals.co2AvoidedG += entry.co2AvoidedG;
    }
    return totals;
}

// Progression vers le prochain crédit entier (1 t), tous statuts confondus : { completed, fraction }.
export function progressToNextCredit(totalCredits) {
    const completed = Math.floor(totalCredits);
    return { completed, fraction: totalCredits - completed };
}
