// Recherche de trajets côté passager : filtrage local des trajets publiés.
// L'appariement par itinéraire (VROOM) viendra compléter ce filtrage à l'étape 6.
import { MAX_SEATS } from './trips.js';
import { seatsLeft, hasDeparted } from './booking.js';

// Minuscules, sans accents ni espaces superflus : « Genève » et « geneve » correspondent.
export function normalizeText(text) {
    return String(text ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

// Départ, arrivée et date sont facultatifs ; seats vaut au moins 1.
export function validateSearch(criteria) {
    const errors = {};
    if (!(Number.isInteger(criteria.seats) && criteria.seats >= 1 && criteria.seats <= MAX_SEATS)) {
        errors.seats = `Indiquez entre 1 et ${MAX_SEATS} places.`;
    }
    if (criteria.date && !/^\d{4}-\d{2}-\d{2}$/.test(criteria.date)) {
        errors.date = 'Date invalide.';
    }
    return { valid: Object.keys(errors).length === 0, errors };
}

// Jour local (AAAA-MM-JJ) d'une date ISO, pour comparer avec un champ <input type="date">.
export function localDay(iso) {
    const date = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Trajets à venir correspondant aux critères, avec assez de places, triés par heure de départ.
export function searchTrips(trips, bookings, { origin = '', destination = '', date = '', seats = 1 }, { now }) {
    const wantedOrigin = normalizeText(origin);
    const wantedDestination = normalizeText(destination);

    return trips
        .filter(trip => !hasDeparted(trip, now))
        .filter(trip => normalizeText(trip.origin).includes(wantedOrigin))
        .filter(trip => normalizeText(trip.destination).includes(wantedDestination))
        .filter(trip => !date || localDay(trip.departureAt) === date)
        .map(trip => ({ trip, seatsLeft: seatsLeft(trip, bookings) }))
        .filter(result => result.seatsLeft >= seats)
        .sort((a, b) => a.trip.departureAt.localeCompare(b.trip.departureAt));
}
