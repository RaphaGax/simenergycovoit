// Parcours Passager — confirmation de réservation, avec annulation possible avant le départ.
import { canCancel, cancelBooking, BOOKING_STATUS } from '../../core/booking.js';
import { co2AvoidedForTrip } from '../../core/co2.js';
import { el } from '../dom.js';
import { formatCo2, formatDateTime } from '../format.js';
import { tripSummary, plural } from '../components/tripSummary.js';

const backLink = () => el('a', { href: '#/passager/recherche', text: '← Retour à la recherche' });

function details(booking, trip) {
    return el('dl', { class: 'booking-recap' },
        el('dt', { text: 'Référence' }), el('dd', {}, el('strong', { text: booking.reference })),
        el('dt', { text: 'Rendez-vous' }), el('dd', { text: `${trip.origin}, ${formatDateTime(trip.departureAt)}` }),
        el('dt', { text: 'Places' }), el('dd', { text: plural(booking.seats, 'place') }),
        el('dt', { text: 'Prix' }), el('dd', {}, el('strong', { class: 'price', text: `${booking.priceChf} CHF` })),
        el('dt', { text: 'CO₂ évité' }), el('dd', { text: formatCo2(co2AvoidedForTrip({ ...trip, passengers: booking.seats })) }));
}

export function render(root, { tripRepository, bookingRepository }, { params }) {
    const booking = bookingRepository.get(params.bookingId);
    const trip = booking && tripRepository.get(booking.tripId);
    const card = el('section', { class: 'card' });
    root.append(card);

    if (!booking || !trip) {
        card.append(el('h2', { text: 'Réservation introuvable' }), backLink());
        return;
    }

    const cancelled = booking.status === BOOKING_STATUS.CANCELLED;
    card.append(
        el('p', { class: cancelled ? 'banner banner-cancelled' : 'banner banner-confirmed', role: 'status',
            text: cancelled ? 'Réservation annulée.' : 'Réservation confirmée ! Votre trajet est gratuit.' }),
        el('h2', { text: 'Votre réservation' }),
        tripSummary(trip),
        details(booking, trip));

    if (canCancel(booking, trip, new Date())) {
        const status = el('p', { class: 'error-message', role: 'alert' });
        const cancelButton = el('button', { type: 'button', class: 'button-secondary', text: 'Annuler la réservation' });
        let armed = false;
        cancelButton.addEventListener('click', () => {
            // Premier clic : demande de confirmation ; second clic : annulation.
            if (!armed) {
                armed = true;
                cancelButton.textContent = 'Confirmer l’annulation';
                return;
            }
            try {
                bookingRepository.save(cancelBooking(booking, trip, { now: new Date() }));
                root.replaceChildren();
                render(root, { tripRepository, bookingRepository }, { params });
            } catch (error) {
                console.error('Erreur d’annulation :', error);
                status.textContent = error instanceof RangeError ? error.message : 'L’annulation n’a pas pu être enregistrée.';
            }
        });
        card.append(el('div', { class: 'button-group' }, cancelButton), status);
    }
    card.append(backLink());
}
