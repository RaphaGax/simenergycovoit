// Parcours Passager — confirmation de réservation, avec annulation possible avant le départ.
import { canCancel, hasDeparted, BOOKING_STATUS } from '../../core/booking.js';
import { passengerMeetingPoint } from '../../core/navigation.js';
import { createWazeButton } from '../components/wazeButton.js';
import { co2AvoidedForBooking } from '../../core/co2.js';
import { el } from '../dom.js';
import { formatCo2, formatDateTime } from '../format.js';
import { tripSummary, plural } from '../components/tripSummary.js';

const backLink = () => el('a', { href: '#/passager/recherche', text: '← Retour à la recherche' });

function details(booking, trip) {
    return el('dl', { class: 'booking-recap' },
        el('dt', { text: 'Référence' }), el('dd', {}, el('strong', { text: booking.reference })),
        el('dt', { text: 'Rendez-vous' }), el('dd', { text: booking.pickup
            ? `${booking.pickup.label} (départ du conducteur : ${formatDateTime(trip.departureAt)})`
            : `${trip.origin}, ${formatDateTime(trip.departureAt)}` }),
        ...(booking.dropoff ? [el('dt', { text: 'Dépose' }), el('dd', { text: booking.dropoff.label })] : []),
        el('dt', { text: 'Places' }), el('dd', { text: plural(booking.seats, 'place') }),
        el('dt', { text: 'Prix' }), el('dd', {}, el('strong', { class: 'price', text: `${booking.priceChf} CHF` })),
        el('dt', { text: 'CO₂ évité' }), el('dd', { text: formatCo2(co2AvoidedForBooking(trip, booking)) }));
}

export async function render(root, context, { params }) {
    const { api, user } = context;
    const card = el('section', { class: 'card' });
    root.append(card);

    let found;
    try {
        found = await api.bookings.get(params.bookingId);
    } catch (error) {
        if (error.status !== 404) throw error;
        card.append(el('h2', { text: 'Réservation introuvable' }), backLink());
        return;
    }
    const { booking, trip } = found;
    const isPassenger = booking.passengerId === user.id;

    const cancelled = booking.status === BOOKING_STATUS.CANCELLED;
    card.append(
        el('p', { class: cancelled ? 'banner banner-cancelled' : 'banner banner-confirmed', role: 'status',
            text: cancelled ? 'Réservation annulée.' : 'Réservation confirmée ! Le trajet est gratuit pour le passager.' }),
        el('h2', { text: isPassenger ? 'Votre réservation' : 'Réservation d’un passager' }),
        tripSummary(trip),
        details(booking, trip));

    // Navigation vers le point de rendez-vous : réservation confirmée dont le trajet n'est pas encore parti.
    if (isPassenger && booking.status === BOOKING_STATUS.CONFIRMED && !trip.completedAt && !hasDeparted(trip, new Date())) {
        card.append(createWazeButton(passengerMeetingPoint(booking, trip), { purpose: 'Point de rendez-vous' }));
    }

    if (isPassenger && canCancel(booking, trip, new Date())) {
        const status = el('p', { class: 'error-message', role: 'alert' });
        const cancelButton = el('button', { type: 'button', class: 'button-secondary', text: 'Annuler la réservation' });
        let armed = false;
        cancelButton.addEventListener('click', async () => {
            // Premier clic : demande de confirmation ; second clic : annulation.
            if (!armed) {
                armed = true;
                cancelButton.textContent = 'Confirmer l’annulation';
                return;
            }
            cancelButton.disabled = true;
            try {
                await api.bookings.cancel(booking.id);
                root.replaceChildren();
                await render(root, context, { params });
            } catch (error) {
                console.error('Erreur d’annulation :', error);
                status.textContent = error.message;
                cancelButton.disabled = false;
            }
        });
        card.append(el('div', { class: 'button-group' }, cancelButton), status);
    }
    card.append(backLink());
}
