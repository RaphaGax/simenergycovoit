// Résumé d'un trajet : itinéraire, horaire, distance, motorisation.
import { el } from '../dom.js';
import { VEHICLE_LABELS, formatDateTime, formatDistance } from '../format.js';

export function tripSummary(trip, ...extra) {
    return el('div', { class: 'trip-summary' },
        el('strong', { class: 'trip-route', text: `${trip.origin} → ${trip.destination}` }),
        el('span', { text: `${formatDateTime(trip.departureAt)} · ${formatDistance(trip.distanceKm)} · ${VEHICLE_LABELS[trip.vehicleType]}` }),
        ...extra);
}

export function priceBadge() {
    return el('span', { class: 'price-badge', text: '0 CHF' });
}

export const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
