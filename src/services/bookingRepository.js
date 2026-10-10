// Stockage des réservations passagers (même interface que tripRepository).
import { createLocalCollection } from './localCollection.js';

export function createBookingRepository(storage) {
    return createLocalCollection('ecovroom.bookings', storage);
}
