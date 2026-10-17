// Confirmation du trajet par le passager : preuve indépendante du conducteur que le trajet
// a bien eu lieu. Seules les places confirmées par leur passager comptent pour les crédits.
// Fonctions pures : la date courante est fournie par l'appelant.
import { BOOKING_STATUS, hasDeparted } from './booking.js';

export const PROOF_WINDOW_DAYS = 7;

export const PASSENGER_PROOF = Object.freeze({
    CONFIRMED: 'confirmed', // « J'ai voyagé »
    DISPUTED: 'disputed' // « Le trajet n'a pas eu lieu »
});

const ANSWERS = new Set(Object.values(PASSENGER_PROOF));

export function proofDeadline(trip) {
    return new Date(new Date(trip.departureAt).getTime() + PROOF_WINDOW_DAYS * 86400000);
}

// Raison pour laquelle le passager ne peut pas (ou plus) répondre, ou null s'il le peut.
export function proofRefusal(booking, trip, now) {
    if (booking.status !== BOOKING_STATUS.CONFIRMED) return 'Cette réservation a été annulée.';
    if (!hasDeparted(trip, now)) return 'Le trajet n’a pas encore eu lieu.';
    if (booking.passengerProof) return 'Vous avez déjà répondu pour ce trajet.';
    if (now > proofDeadline(trip)) return `Le délai de confirmation (${PROOF_WINDOW_DAYS} jours après le départ) est dépassé.`;
    return null;
}

export const canRecordProof = (booking, trip, now) => proofRefusal(booking, trip, now) === null;

// Renvoie une nouvelle réservation avec la réponse du passager.
export function recordPassengerProof(booking, trip, { answer, now }) {
    if (!ANSWERS.has(answer)) throw new TypeError('Réponse attendue : « confirmed » ou « disputed ».');
    const refusal = proofRefusal(booking, trip, now);
    if (refusal) throw new RangeError(refusal);
    return { ...booking, passengerProof: answer, passengerProofAt: now.toISOString() };
}

// État des réponses des passagers d'un trajet. closed : plus rien à attendre (tout le monde a
// répondu, ou le délai est passé : les places sans réponse ne comptent alors pas).
export function summarizeProof(trip, bookings, now) {
    const passengers = bookings.filter(b => b.tripId === trip.id && b.status === BOOKING_STATUS.CONFIRMED);
    const seatsWhere = predicate => passengers.filter(predicate).reduce((sum, b) => sum + b.seats, 0);
    const deadline = proofDeadline(trip);
    const pendingSeats = seatsWhere(b => !b.passengerProof);
    return {
        confirmedSeats: seatsWhere(b => b.passengerProof === PASSENGER_PROOF.CONFIRMED),
        disputedSeats: seatsWhere(b => b.passengerProof === PASSENGER_PROOF.DISPUTED),
        pendingSeats,
        deadline: deadline.toISOString(),
        closed: pendingSeats === 0 || now > deadline
    };
}
