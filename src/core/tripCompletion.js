// Confirmation d'un trajet effectué par le conducteur : seuls les trajets réellement partis,
// avec des passagers confirmés, génèrent une estimation de crédits carbone.
import { BOOKING_STATUS, hasDeparted } from './booking.js';
import { co2AvoidedForBooking } from './co2.js';
import { createCreditEntry } from './carbonCredits.js';

export function canComplete(trip, now) {
    return hasDeparted(trip, now) && !trip.completedAt;
}

// Renvoie { trip, creditEntry } : le trajet marqué effectué et l'entrée de crédits estimés,
// ou creditEntry null si aucun passager n'a voyagé (rien à créditer).
export function completeTrip({ trip, bookings, driverId }, { now }) {
    if (trip.driverId !== driverId) throw new RangeError('Seul le conducteur peut confirmer ce trajet.');
    if (trip.completedAt) throw new RangeError('Ce trajet est déjà confirmé.');
    if (!hasDeparted(trip, now)) throw new RangeError('Ce trajet n’a pas encore eu lieu.');

    const passengers = bookings.filter(b => b.tripId === trip.id && b.status === BOOKING_STATUS.CONFIRMED);
    const passengerSeats = passengers.reduce((sum, b) => sum + b.seats, 0);
    const co2AvoidedG = passengers.reduce((sum, b) => sum + co2AvoidedForBooking(trip, b), 0);

    return {
        trip: { ...trip, completedAt: now.toISOString() },
        creditEntry: passengerSeats > 0
            ? createCreditEntry({ tripId: trip.id, driverId, co2AvoidedG, passengerSeats, now })
            : null
    };
}
