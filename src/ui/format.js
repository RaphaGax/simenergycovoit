// Mise en forme pour l'affichage (pure, sans DOM).
export const VEHICLE_LABELS = Object.freeze({
    electric: 'Électrique',
    hybridPlug: 'Hybride rechargeable',
    diesel: 'Diesel',
    petrol: 'Essence',
    gas: 'Gaz naturel',
    hydrogen: 'Hydrogène'
});

const number = (value, digits) =>
    value.toLocaleString('fr-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Grammes → « 850 g » ou « 12,4 kg ».
export function formatCo2(grams) {
    return grams < 1000 ? `${number(grams, 0)} g` : `${number(grams / 1000, 1)} kg`;
}

export function formatCredits(credits) {
    return `${number(credits, 4)} crédit${credits >= 2 ? 's' : ''}`;
}

export function formatDistance(km) {
    return `${km.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} km`;
}

export function formatDateTime(iso) {
    return new Date(iso).toLocaleString('fr-CH', { dateStyle: 'medium', timeStyle: 'short' });
}
