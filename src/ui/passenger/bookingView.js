// Parcours Passager — récapitulatif et réservation gratuite (0 CHF).
import { bookingRefusal, createBooking, seatsLeft, PASSENGER_PRICE_CHF } from '../../core/booking.js';
import { co2AvoidedForTrip } from '../../core/co2.js';
import { el } from '../dom.js';
import { navigate } from '../router.js';
import { formatCo2 } from '../format.js';
import { LOCAL_PASSENGER_ID, newBookingIds } from '../session.js';
import { tripSummary, plural } from '../components/tripSummary.js';

const backLink = () => el('a', { href: '#/passager/recherche', text: '← Retour à la recherche' });

export function render(root, { tripRepository, bookingRepository }, { params, query }) {
    const trip = tripRepository.get(params.tripId);
    const left = trip ? seatsLeft(trip, bookingRepository.list()) : 0;
    const requested = Math.min(Math.max(1, Number(query.seats) || 1), Math.max(1, left));
    const refusal = bookingRefusal(
        { trip, bookings: bookingRepository.list(), passengerId: LOCAL_PASSENGER_ID, seats: requested },
        { now: new Date() });

    const card = el('section', { class: 'card' }, el('h2', { text: 'Réserver ce trajet' }));
    root.append(card);
    if (refusal) {
        if (trip) card.append(tripSummary(trip));
        card.append(el('p', { class: 'error-message', role: 'alert', text: refusal }), backLink());
        return;
    }

    const seatsSelect = el('select', { id: 'seats', name: 'seats' }, ...Array.from({ length: left }, (_, i) =>
        el('option', { value: String(i + 1), text: plural(i + 1, 'place') })));
    seatsSelect.value = String(requested);
    const co2Line = el('strong');
    const updateCo2 = () => {
        co2Line.textContent = formatCo2(co2AvoidedForTrip({ ...trip, passengers: Number(seatsSelect.value) }));
    };
    seatsSelect.addEventListener('change', updateCo2);
    updateCo2();

    const status = el('p', { class: 'error-message', role: 'alert' });
    const confirmButton = el('button', { type: 'submit', text: 'Confirmer la réservation gratuite' });
    const form = el('form', { class: 'trip-form booking-form' },
        el('div', { class: 'input-group' }, el('label', { for: 'seats', text: 'Nombre de places' }), seatsSelect),
        el('dl', { class: 'booking-recap' },
            el('dt', { text: 'Prix' }), el('dd', {}, el('strong', { class: 'price', text: `${PASSENGER_PRICE_CHF} CHF` }), ' — gratuit pour les passagers'),
            el('dt', { text: 'CO₂ évité' }), el('dd', {}, co2Line, ' par rapport à un trajet seul en voiture')),
        status,
        el('div', { class: 'button-group' }, confirmButton));

    form.addEventListener('submit', event => {
        event.preventDefault();
        confirmButton.disabled = true;
        try {
            // Relecture des réservations : une autre réservation a pu prendre les places entre-temps.
            const booking = createBooking(
                { trip, bookings: bookingRepository.list(), passengerId: LOCAL_PASSENGER_ID, seats: Number(seatsSelect.value) },
                { ...newBookingIds(), now: new Date() });
            bookingRepository.save(booking);
            navigate(`/passager/reservation/${encodeURIComponent(booking.id)}`);
        } catch (error) {
            console.error('Erreur de réservation :', error);
            status.textContent = error instanceof RangeError
                ? error.message
                : 'La réservation n’a pas pu être enregistrée. Vérifiez que le stockage du navigateur est autorisé.';
            confirmButton.disabled = false;
        }
    });

    card.append(tripSummary(trip, el('span', { text: `${plural(left, 'place')} libre${left > 1 ? 's' : ''}` })), form, backLink());
}
