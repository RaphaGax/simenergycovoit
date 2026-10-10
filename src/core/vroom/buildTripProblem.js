// Construit le problème VROOM d'un trajet : un véhicule (le conducteur) et un « shipment »
// (prise en charge puis dépose) par réservation. VROOM renvoie l'ordre optimal des arrêts.
// Format : https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
import { isValidCoords } from '../geo.js';

export const PICKUP_SERVICE_S = 120; // temps d'embarquement d'un passager
export const DROPOFF_SERVICE_S = 60;
export const MAX_ROUTE_S = 12 * 3600; // fenêtre de temps du conducteur après le départ

const toEpochSeconds = iso => Math.floor(new Date(iso).getTime() / 1000);

// Les réservations sans point de prise en charge ou de dépose utilisent le départ ou l'arrivée du trajet.
export function stopsForBooking(trip, booking) {
    return {
        pickup: booking.pickup?.coords ?? trip.originCoords,
        dropoff: booking.dropoff?.coords ?? trip.destinationCoords
    };
}

// Renvoie { problem, shipmentBookingIds } : shipmentBookingIds[i] est la réservation du shipment d'id i + 1.
export function buildTripProblem(trip, bookings) {
    if (!isValidCoords(trip.originCoords) || !isValidCoords(trip.destinationCoords)) {
        throw new RangeError('Le trajet doit avoir des coordonnées de départ et d’arrivée.');
    }
    if (bookings.length === 0) throw new RangeError('Aucune réservation à planifier.');

    const departure = toEpochSeconds(trip.departureAt);
    const shipments = bookings.map((booking, index) => {
        const { pickup, dropoff } = stopsForBooking(trip, booking);
        if (!isValidCoords(pickup) || !isValidCoords(dropoff)) {
            throw new RangeError(`Coordonnées invalides pour la réservation ${booking.id}.`);
        }
        return {
            amount: [booking.seats],
            pickup: { id: index + 1, location: pickup, service: PICKUP_SERVICE_S },
            delivery: { id: index + 1, location: dropoff, service: DROPOFF_SERVICE_S }
        };
    });

    return {
        problem: {
            vehicles: [{
                id: 1,
                profile: 'driving-car',
                start: trip.originCoords,
                end: trip.destinationCoords,
                capacity: [trip.seats],
                time_window: [departure, departure + MAX_ROUTE_S]
            }],
            shipments
        },
        shipmentBookingIds: bookings.map(booking => booking.id)
    };
}
