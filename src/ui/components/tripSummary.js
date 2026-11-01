// Résumé d'un trajet, comme les cartes de la maquette : itinéraire, date, heure, distance, motorisation.
import { el } from '../dom.js';
import { icon } from './icons.js';
import { VEHICLE_LABELS, formatDate, formatTime, formatDistance, formatCo2, initial } from '../format.js';

const line = (iconName, text, className = 'trip-line') =>
    el('span', { class: className }, icon(iconName), el('span', { text }));

function summaryLines(trip) {
    return [
        el('strong', { class: 'trip-line trip-route' }, icon('pin'), el('span', { text: `${trip.origin} → ${trip.destination}` })),
        el('span', { class: 'trip-when' },
            line('calendar', formatDate(trip.departureAt)),
            line('clock', formatTime(trip.departureAt))),
        el('span', { class: 'trip-meta', text: `${formatDistance(trip.distanceKm)} · ${VEHICLE_LABELS[trip.vehicleType]}` })
    ];
}

export function tripSummary(trip, ...extra) {
    return el('div', { class: 'trip-summary' }, ...summaryLines(trip), ...extra);
}

// Variante avec l'avatar du conducteur (initiale de son prénom, jamais de photo inventée).
export function tripSummaryWithDriver(trip, driverName, ...extra) {
    return el('div', { class: 'trip-summary has-avatar' },
        el('span', { class: 'avatar', 'aria-hidden': 'true', text: initial(driverName) }),
        el('div', { class: 'trip-summary-body' }, ...summaryLines(trip), ...extra));
}

export function priceBadge() {
    return el('span', { class: 'price-badge', text: '0 CHF' });
}

export function co2Badge(grams) {
    return el('span', { class: 'co2-badge' }, icon('leaf', { size: 14 }), el('span', { text: `${formatCo2(grams)} de CO₂ évités` }));
}

export const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;
