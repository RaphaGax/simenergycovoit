// Trajets publiés par les conducteurs : validation et création. Fonctions pures
// (l'identifiant et la date courante sont fournis par l'appelant).
import { VEHICLE_PROFILES } from './emissionFactors.js';

export const MAX_SEATS = 8;
export const MAX_DISTANCE_KM = 2000;

// Renvoie { valid, errors } ; errors associe chaque champ invalide à un message.
export function validateTrip(draft, { now = new Date() } = {}) {
    const errors = {};
    const origin = String(draft.origin ?? '').trim();
    const destination = String(draft.destination ?? '').trim();

    if (!origin) errors.origin = 'Indiquez le lieu de départ.';
    if (!destination) errors.destination = "Indiquez le lieu d'arrivée.";
    if (origin && destination && origin.toLowerCase() === destination.toLowerCase()) {
        errors.destination = "L'arrivée doit être différente du départ.";
    }

    const departure = new Date(draft.departureAt);
    if (Number.isNaN(departure.getTime())) errors.departureAt = 'Indiquez une date et une heure de départ.';
    else if (departure <= now) errors.departureAt = 'Le départ doit être dans le futur.';

    if (!(Number.isFinite(draft.distanceKm) && draft.distanceKm > 0 && draft.distanceKm <= MAX_DISTANCE_KM)) {
        errors.distanceKm = `La distance doit être comprise entre 0 et ${MAX_DISTANCE_KM} km.`;
    }
    if (!(Number.isInteger(draft.seats) && draft.seats >= 1 && draft.seats <= MAX_SEATS)) {
        errors.seats = `Proposez entre 1 et ${MAX_SEATS} places.`;
    }
    if (!VEHICLE_PROFILES[draft.vehicleType]) errors.vehicleType = 'Choisissez une motorisation.';

    return { valid: Object.keys(errors).length === 0, errors };
}

export function createTrip(draft, { id, driverId, now = new Date() }) {
    const { valid, errors } = validateTrip(draft, { now });
    if (!valid) throw new RangeError(`Trajet invalide : ${Object.keys(errors).join(', ')}`);
    return {
        id,
        driverId,
        origin: draft.origin.trim(),
        destination: draft.destination.trim(),
        departureAt: new Date(draft.departureAt).toISOString(),
        distanceKm: draft.distanceKm,
        seats: draft.seats,
        vehicleType: draft.vehicleType,
        createdAt: now.toISOString()
    };
}
