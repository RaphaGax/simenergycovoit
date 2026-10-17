// Confirmation d'un trajet effectué par le conducteur. Les crédits estimés ne comptent que les
// places confirmées par leurs passagers (double confirmation, voir tripProof.js) : l'entrée de
// crédits est créée à la confirmation du conducteur, puis recalculée à chaque réponse de passager.
import { BOOKING_STATUS, hasDeparted } from './booking.js';
import { co2AvoidedForBooking } from './co2.js';
import { createCreditEntry, CREDIT_STATUS } from './carbonCredits.js';
import { PASSENGER_PROOF } from './tripProof.js';

export function canComplete(trip, now) {
    return hasDeparted(trip, now) && !trip.completedAt;
}

const tripPassengers = (trip, bookings) =>
    bookings.filter(b => b.tripId === trip.id && b.status === BOOKING_STATUS.CONFIRMED);

// Crédits d'un trajet à partir des seules places confirmées par les passagers.
export function tripCreditEntry({ trip, bookings, driverId, now }) {
    const proven = tripPassengers(trip, bookings).filter(b => b.passengerProof === PASSENGER_PROOF.CONFIRMED);
    return createCreditEntry({
        tripId: trip.id,
        driverId,
        co2AvoidedG: proven.reduce((sum, b) => sum + co2AvoidedForBooking(trip, b), 0),
        passengerSeats: proven.reduce((sum, b) => sum + b.seats, 0),
        now
    });
}

// Recalcule une entrée encore « estimée » après une réponse de passager. Une entrée soumise
// ou validée n'est jamais modifiée.
export function refreshCreditEntry(entry, { trip, bookings }) {
    if (entry.status !== CREDIT_STATUS.ESTIMATED) return entry;
    const fresh = tripCreditEntry({ trip, bookings, driverId: entry.driverId, now: new Date(entry.estimatedAt) });
    return { ...entry, co2AvoidedG: fresh.co2AvoidedG, credits: fresh.credits, passengerSeats: fresh.passengerSeats };
}

// Soumissible pour validation : encore estimée, réponses des passagers closes, et non nulle.
export function isSubmittable(entry, proofSummary) {
    return entry.status === CREDIT_STATUS.ESTIMATED && proofSummary.closed && entry.credits > 0;
}

// Renvoie { trip, creditEntry } : le trajet marqué effectué et son entrée de crédits,
// ou creditEntry null si aucun passager n'avait réservé (rien à créditer).
export function completeTrip({ trip, bookings, driverId }, { now }) {
    if (trip.driverId !== driverId) throw new RangeError('Seul le conducteur peut confirmer ce trajet.');
    if (trip.completedAt) throw new RangeError('Ce trajet est déjà confirmé.');
    if (!hasDeparted(trip, now)) throw new RangeError('Ce trajet n’a pas encore eu lieu.');

    return {
        trip: { ...trip, completedAt: now.toISOString() },
        creditEntry: tripPassengers(trip, bookings).length > 0
            ? tripCreditEntry({ trip, bookings, driverId, now })
            : null
    };
}
