// Parcours Passager — récapitulatif et réservation gratuite (0 CHF).
// Le serveur revérifie tout au moment de confirmer (places, départ, prix) : la vérification
// faite ici sert seulement à afficher tout de suite un message clair.
import { bookingRefusal, PASSENGER_PRICE_CHF, BOOKING_STATUS } from '../../core/booking.js';
import { co2AvoidedForBooking } from '../../core/co2.js';
import { el } from '../dom.js';
import { navigate, loginPath, currentPath } from '../router.js';
import { formatCo2, formatDistance } from '../format.js';
import { tripSummary, plural } from '../components/tripSummary.js';
import { paramToCoords } from '../components/placeInput.js';

const backLink = () => el('a', { href: '#/passager/recherche', text: '← Retour à la recherche' });

// Points et distances transmis par la recherche par itinéraire, ou {} s'ils sont absents ou incomplets.
function routeFromQuery(query) {
    const route = {
        pickup: { label: query.pl ?? '', coords: paramToCoords(query.p) },
        dropoff: { label: query.dl ?? '', coords: paramToCoords(query.d) },
        passengerDistanceKm: Number(query.pkm),
        detourKm: Number(query.dkm)
    };
    const complete = route.pickup.label && route.pickup.coords && route.dropoff.label && route.dropoff.coords
        && Number.isFinite(route.passengerDistanceKm) && Number.isFinite(route.detourKm);
    return complete ? route : {};
}

async function loadTrip(api, tripId) {
    try {
        return await api.trips.get(tripId);
    } catch (error) {
        if (error.status === 404) return null;
        throw error;
    }
}

export async function render(root, { api, user }, { params, query }) {
    const card = el('section', { class: 'card' }, el('h2', { text: 'Réserver ce trajet' }));
    root.append(card);

    const found = await loadTrip(api, params.tripId);
    const trip = found?.trip ?? null;
    const left = found?.seatsLeft ?? 0;
    const route = routeFromQuery(query);
    const requested = Math.min(Math.max(1, Number(query.seats) || 1), Math.max(1, left));
    // Places déjà prises, résumées en une réservation fictive pour réutiliser la règle du core.
    const taken = trip ? [{ tripId: trip.id, seats: trip.seats - left, status: BOOKING_STATUS.CONFIRMED }] : [];
    const refusal = bookingRefusal({ trip, bookings: taken, passengerId: user?.id, seats: requested }, { now: new Date() });

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
        co2Line.textContent = formatCo2(co2AvoidedForBooking(trip, { ...route, seats: Number(seatsSelect.value) }));
    };
    seatsSelect.addEventListener('change', updateCo2);
    updateCo2();

    const recap = el('dl', { class: 'booking-recap' },
        ...(found.driverName ? [el('dt', { text: 'Conducteur' }), el('dd', { text: found.driverName })] : []),
        ...(route.pickup ? [
            el('dt', { text: 'Prise en charge' }), el('dd', { text: route.pickup.label }),
            el('dt', { text: 'Dépose' }), el('dd', { text: `${route.dropoff.label} (${formatDistance(route.passengerDistanceKm)})` }),
            el('dt', { text: 'Détour conducteur' }), el('dd', { text: formatDistance(route.detourKm) })
        ] : []),
        el('dt', { text: 'Prix' }), el('dd', {}, el('strong', { class: 'price', text: `${PASSENGER_PRICE_CHF} CHF` }), ' — gratuit pour les passagers'),
        el('dt', { text: 'CO₂ évité' }), el('dd', {}, co2Line, ' par rapport à un trajet seul en voiture'));
    const seatsField = el('div', { class: 'input-group' }, el('label', { for: 'seats', text: 'Nombre de places' }), seatsSelect);
    const summary = tripSummary(trip, el('span', { text: `${plural(left, 'place')} libre${left > 1 ? 's' : ''}` }));

    if (!user) {
        card.append(summary,
            el('div', { class: 'trip-form' }, seatsField, recap),
            el('p', { class: 'notice' }, el('a', { href: `#${loginPath(currentPath())}`, text: 'Connectez-vous ou créez un compte' }),
                ' pour confirmer cette réservation gratuite.'),
            backLink());
        return;
    }

    const status = el('p', { class: 'error-message', role: 'alert' });
    const confirmButton = el('button', { type: 'submit', text: 'Confirmer la réservation gratuite' });
    const form = el('form', { class: 'trip-form booking-form' }, seatsField, recap, status,
        el('div', { class: 'button-group' }, confirmButton));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        confirmButton.disabled = true;
        status.textContent = '';
        try {
            const { booking } = await api.bookings.create({ tripId: trip.id, seats: Number(seatsSelect.value), route });
            navigate(`/passager/reservation/${encodeURIComponent(booking.id)}`);
        } catch (error) {
            console.error('Erreur de réservation :', error);
            status.textContent = error.message;
            confirmButton.disabled = false;
        }
    });

    card.append(summary, form, backLink());
}
