// Réservations des passagers. Le trajet est toujours gratuit pour le passager (0 CHF).
// Fonctions pures : l'identifiant, la référence et la date courante sont fournis par l'appelant.
import { isValidCoords } from './geo.js';

export const PASSENGER_PRICE_CHF = 0;

export const BOOKING_STATUS = Object.freeze({
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled'
});

// Places réservées sur un trajet (les réservations annulées libèrent leurs places).
export function seatsBooked(tripId, bookings) {
    return bookings
        .filter(b => b.tripId === tripId && b.status === BOOKING_STATUS.CONFIRMED)
        .reduce((sum, b) => sum + b.seats, 0);
}

export function seatsLeft(trip, bookings) {
    return Math.max(0, trip.seats - seatsBooked(trip.id, bookings));
}

export const hasDeparted = (trip, now) => new Date(trip.departureAt) <= now;

// Raison pour laquelle la réservation est impossible, ou null si elle est possible.
export function bookingRefusal({ trip, bookings, passengerId, seats }, { now }) {
    if (!trip) return 'Ce trajet n’existe pas ou n’est plus disponible.';
    if (hasDeparted(trip, now)) return 'Ce trajet est déjà parti.';
    if (trip.driverId === passengerId) return 'Vous ne pouvez pas réserver votre propre trajet.';
    if (!(Number.isInteger(seats) && seats >= 1)) return 'Choisissez au moins une place.';
    const left = seatsLeft(trip, bookings);
    if (seats > left) {
        return left === 0
            ? 'Ce trajet est complet.'
            : `Il ne reste que ${left} place${left > 1 ? 's' : ''} sur ce trajet.`;
    }
    return null;
}

// Points de prise en charge et de dépose facultatifs ({ label, coords }), issus de la recherche
// par itinéraire, avec la distance du passager et le détour du conducteur calculés par ORS.
function routeDetails({ pickup, dropoff, passengerDistanceKm, detourKm }) {
    if (pickup == null && dropoff == null) return {};
    for (const point of [pickup, dropoff]) {
        if (!point || !String(point.label ?? '').trim() || !isValidCoords(point.coords)) {
            throw new RangeError('Points de prise en charge et de dépose invalides.');
        }
    }
    for (const value of [passengerDistanceKm, detourKm]) {
        if (!(Number.isFinite(value) && value >= 0)) throw new RangeError('Distance de trajet invalide.');
    }
    return { pickup, dropoff, passengerDistanceKm, detourKm };
}

export function createBooking({ trip, bookings, passengerId, seats, route = {} }, { id, reference, now }) {
    const refusal = bookingRefusal({ trip, bookings, passengerId, seats }, { now });
    if (refusal) throw new RangeError(refusal);
    return {
        id,
        reference,
        tripId: trip.id,
        passengerId,
        seats,
        ...routeDetails(route),
        priceChf: PASSENGER_PRICE_CHF,
        status: BOOKING_STATUS.CONFIRMED,
        createdAt: now.toISOString()
    };
}

export function canCancel(booking, trip, now) {
    return booking.status === BOOKING_STATUS.CONFIRMED && !hasDeparted(trip, now);
}

export function cancelBooking(booking, trip, { now }) {
    if (!canCancel(booking, trip, now)) {
        throw new RangeError('Cette réservation ne peut plus être annulée.');
    }
    return { ...booking, status: BOOKING_STATUS.CANCELLED, cancelledAt: now.toISOString() };
}
