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

// Nombre entier de VroomPoints : « 1 VroomPoint », « 1 250 VroomPoints ».
export function formatPoints(points) {
    return `${number(points, 0)} VroomPoint${Math.abs(points) >= 2 ? 's' : ''}`;
}

export function formatDistance(km) {
    return `${km.toLocaleString('fr-CH', { maximumFractionDigits: 1 })} km`;
}

export function formatDateTime(iso) {
    return new Date(iso).toLocaleString('fr-CH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso) {
    return new Date(iso).toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
}

// Initiale d'un prénom pour l'avatar (« É » pour « élodie »), « ? » sans prénom.
export function initial(name) {
    const first = [...String(name ?? '').trim()][0];
    return first ? first.toLocaleUpperCase('fr-CH') : '?';
}
