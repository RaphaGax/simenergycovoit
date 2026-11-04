// Annulation d'un trajet par son conducteur, avant le départ : le trajet n'est plus proposé et
// toutes ses réservations sont annulées (les passagers sont prévenus par le serveur).
// Fonctions pures : la date courante est fournie par l'appelant.
import { BOOKING_STATUS, hasDeparted } from './booking.js';

// Raison pour laquelle le trajet ne peut pas être annulé, ou null s'il le peut.
export function tripCancellationRefusal(trip, now) {
    if (trip.cancelledAt) return 'Ce trajet est déjà annulé.';
    if (trip.completedAt || hasDeparted(trip, now)) return 'Ce trajet est déjà parti : il ne peut plus être annulé.';
    return null;
}

export const canCancelTrip = (trip, now) => tripCancellationRefusal(trip, now) === null;

// Renvoie { trip, cancelledBookings } : le trajet annulé et ses réservations confirmées, annulées.
export function cancelTrip({ trip, bookings, driverId }, { now }) {
    if (trip.driverId !== driverId) throw new RangeError('Seul le conducteur peut annuler ce trajet.');
    const refusal = tripCancellationRefusal(trip, now);
    if (refusal) throw new RangeError(refusal);
    const cancelledAt = now.toISOString();
    return {
        trip: { ...trip, cancelledAt },
        cancelledBookings: bookings
            .filter(b => b.tripId === trip.id && b.status === BOOKING_STATUS.CONFIRMED)
            .map(b => ({ ...b, status: BOOKING_STATUS.CANCELLED, cancelledAt }))
    };
}
