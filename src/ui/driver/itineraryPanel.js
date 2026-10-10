// Itinéraire optimisé d'un trajet : le serveur construit le problème VROOM à partir des
// réservations confirmées et interroge ORS /optimization ; on affiche l'ordre des arrêts.
import { el } from '../dom.js';
import { formatDistance } from '../format.js';
import { plural } from '../components/tripSummary.js';

const formatTime = iso => new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

function stopLabel(stop, trip, bookingsById) {
    if (stop.type === 'start') return `Départ : ${trip.origin}`;
    if (stop.type === 'end') return `Arrivée : ${trip.destination}`;
    const booking = bookingsById.get(stop.bookingId) ?? { seats: 0, reference: '?' };
    const place = stop.type === 'pickup'
        ? booking.pickup?.label ?? trip.origin
        : booking.dropoff?.label ?? trip.destination;
    const who = `${booking.passengerName || plural(booking.seats, 'passager')} (${plural(booking.seats, 'place')}, réf. ${booking.reference})`;
    return stop.type === 'pickup' ? `Prise en charge : ${place} — ${who}` : `Dépose : ${place} — ${who}`;
}

export function createItineraryPanel({ trip, bookings, api }) {
    const bookingsById = new Map(bookings.map(booking => [booking.id, booking]));
    const result = el('div', { class: 'itinerary', 'aria-live': 'polite' });
    const button = el('button', { type: 'button', class: 'button-secondary-neutral', text: 'Planifier l’itinéraire (VROOM)' });

    button.addEventListener('click', async () => {
        button.disabled = true;
        result.replaceChildren(el('p', { class: 'hint', text: 'Optimisation de l’itinéraire…' }));
        try {
            const plan = await api.trips.itinerary(trip.id);
            const summary = [`${Math.round(plan.durationMin)} min`];
            if (plan.distanceKm != null) summary.unshift(formatDistance(plan.distanceKm));

            result.replaceChildren(
                el('p', { class: 'hint', text: `Itinéraire optimisé : ${summary.join(', ')}` }),
                el('ol', { class: 'stop-list' }, ...plan.stops.map(stop => el('li', {},
                    el('span', { class: 'stop-time', text: formatTime(stop.arrivalAt) }),
                    el('span', { text: stopLabel(stop, trip, bookingsById) })))));
            if (plan.unassignedBookingIds.length > 0) {
                const refs = plan.unassignedBookingIds.map(id => bookingsById.get(id)?.reference).join(', ');
                result.append(el('p', { class: 'error-message', text: `Non planifiable dans le délai : ${refs}` }));
            }
        } catch (error) {
            console.error('Optimisation impossible :', error);
            result.replaceChildren(el('p', { class: 'error-message', text: error.message }));
        } finally {
            button.disabled = false;
        }
    });

    return el('div', { class: 'itinerary-panel' }, button, result);
}
