// Parcours Passager — recherche de trajet et liste de mes réservations.
// Les critères sont gardés dans l'adresse (#/passager/recherche?destination=…) pour survivre au retour arrière.
import { searchTrips, validateSearch } from '../../core/search.js';
import { co2AvoidedForTrip } from '../../core/co2.js';
import { BOOKING_STATUS } from '../../core/booking.js';
import { MAX_SEATS } from '../../core/trips.js';
import { el } from '../dom.js';
import { navigate } from '../router.js';
import { formatCo2 } from '../format.js';
import { LOCAL_PASSENGER_ID } from '../session.js';
import { tripSummary, priceBadge, plural } from '../components/tripSummary.js';

function criteriaFromQuery(query) {
    return {
        origin: query.origin ?? '',
        destination: query.destination ?? '',
        date: query.date ?? '',
        seats: query.seats ? Number(query.seats) : 1
    };
}

function searchForm(criteria) {
    const input = (id, label, attributes) => el('div', { class: 'input-group' },
        el('label', { for: id, text: label }),
        el('input', { id, name: id, ...attributes }),
        el('p', { class: 'field-error', id: `${id}-error`, 'aria-live': 'polite' }));

    return el('form', { class: 'trip-form search-form', novalidate: '' },
        input('origin', 'Départ', { type: 'text', autocomplete: 'off', placeholder: 'Ex. Lausanne', value: criteria.origin }),
        input('destination', 'Arrivée', { type: 'text', autocomplete: 'off', placeholder: 'Ex. Genève', value: criteria.destination }),
        input('date', 'Date (facultatif)', { type: 'date', value: criteria.date }),
        input('seats', 'Places', { type: 'number', min: '1', max: String(MAX_SEATS), step: '1', value: String(criteria.seats) }),
        el('div', { class: 'button-group' }, el('button', { type: 'submit', text: 'Rechercher' })));
}

function resultsSection(results, seats) {
    const section = el('section', { class: 'card', 'aria-live': 'polite' },
        el('h2', { text: results.length ? `${plural(results.length, 'trajet')} disponible${results.length > 1 ? 's' : ''}` : 'Aucun trajet trouvé' }));
    if (results.length === 0) {
        section.append(el('p', { class: 'placeholder', text: 'Essayez une autre date ou élargissez le départ et l’arrivée.' }));
        return section;
    }
    section.append(el('ul', { class: 'trip-list' }, ...results.map(({ trip, seatsLeft }) => el('li', { class: 'trip-item' },
        tripSummary(trip,
            el('span', { text: `${plural(seatsLeft, 'place')} libre${seatsLeft > 1 ? 's' : ''}` }),
            el('span', { class: 'hint', text: `Votre trajet évite ${formatCo2(co2AvoidedForTrip({ ...trip, passengers: seats }))} de CO₂` })),
        el('div', { class: 'trip-actions' },
            priceBadge(),
            el('a', { class: 'button-link', href: `#/passager/reserver/${encodeURIComponent(trip.id)}?seats=${seats}`, text: 'Réserver' }))
    ))));
    return section;
}

function myBookingsSection(bookings, tripRepository) {
    const mine = bookings
        .filter(b => b.passengerId === LOCAL_PASSENGER_ID && b.status === BOOKING_STATUS.CONFIRMED)
        .map(booking => ({ booking, trip: tripRepository.get(booking.tripId) }))
        .filter(({ trip }) => trip)
        .sort((a, b) => a.trip.departureAt.localeCompare(b.trip.departureAt));

    const section = el('section', { class: 'card' }, el('h2', { text: 'Mes réservations' }));
    if (mine.length === 0) {
        section.append(el('p', { class: 'placeholder', text: 'Aucune réservation en cours.' }));
        return section;
    }
    section.append(el('ul', { class: 'trip-list' }, ...mine.map(({ booking, trip }) => el('li', { class: 'trip-item' },
        tripSummary(trip, el('span', { text: `${plural(booking.seats, 'place')} · réf. ${booking.reference}` })),
        el('div', { class: 'trip-actions' },
            el('a', { href: `#/passager/reservation/${encodeURIComponent(booking.id)}`, text: 'Voir la réservation' }))
    ))));
    return section;
}

export function render(root, { tripRepository, bookingRepository }, { query }) {
    const criteria = criteriaFromQuery(query);
    const form = searchForm(criteria);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const data = new FormData(form);
        const next = {
            origin: data.get('origin').trim(),
            destination: data.get('destination').trim(),
            date: data.get('date'),
            seats: Number(data.get('seats'))
        };
        const { valid, errors } = validateSearch(next);
        for (const name of ['date', 'seats']) {
            form.querySelector(`#${name}-error`).textContent = errors[name] ?? '';
            form.elements[name].toggleAttribute('aria-invalid', Boolean(errors[name]));
        }
        if (!valid) return;
        const params = new URLSearchParams(Object.entries(next).filter(([, value]) => value !== ''));
        navigate(`/passager/recherche?${params}`);
    });

    const bookings = bookingRepository.list();
    root.append(el('section', { class: 'card' },
        el('h2', { text: 'Rechercher un trajet' }),
        el('p', { class: 'hint', text: 'Tous les trajets sont gratuits pour les passagers.' }),
        form));

    if (validateSearch(criteria).valid) {
        const results = searchTrips(tripRepository.list(), bookings, criteria, { now: new Date() })
            .filter(({ trip }) => trip.driverId !== LOCAL_PASSENGER_ID);
        root.append(resultsSection(results, criteria.seats));
    }
    root.append(myBookingsSection(bookings, tripRepository));
}
