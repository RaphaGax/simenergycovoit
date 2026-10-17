// Parcours Passager — recherche de trajet et liste de mes réservations.
// Les critères sont gardés dans l'adresse (#/passager/recherche?destination=…) pour survivre au retour arrière.
// Avec ORS et des lieux localisés, les trajets sont classés par détour du conducteur (matrice routière) ;
// sinon, ou en cas d'erreur ORS, la recherche se fait par nom de lieu.
import { validateSearch } from '../../core/search.js';
import { preselectCandidates, matrixLocations, rankByDetour, MAX_DETOUR_MIN } from '../../core/matching.js';
import { co2AvoidedForBooking } from '../../core/co2.js';
import { BOOKING_STATUS, hasDeparted } from '../../core/booking.js';
import { canRecordProof } from '../../core/tripProof.js';
import { MAX_SEATS } from '../../core/trips.js';
import { el } from '../dom.js';
import { navigate, loginPath } from '../router.js';
import { formatCo2, formatDistance } from '../format.js';
import { tripSummary, priceBadge, plural } from '../components/tripSummary.js';
import { createPlaceInput, coordsToParam, paramToCoords } from '../components/placeInput.js';

function criteriaFromQuery(query) {
    return {
        origin: query.origin ?? '',
        destination: query.destination ?? '',
        pickup: paramToCoords(query.p),
        dropoff: paramToCoords(query.d),
        date: query.date ?? '',
        seats: query.seats ? Number(query.seats) : 1
    };
}

function searchForm(criteria, ors) {
    const places = {
        origin: createPlaceInput({ id: 'origin', placeholder: 'Ex. Lausanne', ors,
            initial: criteria.pickup ? { label: criteria.origin, coords: criteria.pickup } : null }),
        destination: createPlaceInput({ id: 'destination', placeholder: 'Ex. Genève', ors,
            initial: criteria.dropoff ? { label: criteria.destination, coords: criteria.dropoff } : null })
    };
    if (!criteria.pickup) places.origin.input.value = criteria.origin;
    if (!criteria.dropoff) places.destination.input.value = criteria.destination;

    const group = (id, label, input, ...extra) => el('div', { class: 'input-group' },
        el('label', { for: id, text: label }), input, ...extra,
        el('p', { class: 'field-error', id: `${id}-error`, 'aria-live': 'polite' }));

    const form = el('form', { class: 'trip-form search-form', novalidate: '' },
        group('origin', 'Départ', places.origin.input, ...places.origin.extra),
        group('destination', 'Arrivée', places.destination.input, ...places.destination.extra),
        group('date', 'Date (facultatif)', el('input', { id: 'date', name: 'date', type: 'date', value: criteria.date })),
        group('seats', 'Places', el('input', { id: 'seats', name: 'seats', type: 'number', min: '1', max: String(MAX_SEATS), step: '1', value: String(criteria.seats) })),
        el('div', { class: 'button-group' }, el('button', { type: 'submit', text: 'Rechercher' })));
    return { form, places };
}

// Lien de réservation : places et, en recherche par itinéraire, points et distances calculés.
function bookingHref(result, criteria) {
    const params = new URLSearchParams({ seats: String(criteria.seats) });
    if (result.detourKm != null) {
        params.set('pl', criteria.origin);
        params.set('p', coordsToParam(criteria.pickup));
        params.set('dl', criteria.destination);
        params.set('d', coordsToParam(criteria.dropoff));
        params.set('pkm', String(result.passengerDistanceKm));
        params.set('dkm', String(result.detourKm));
    }
    return `#/passager/reserver/${encodeURIComponent(result.trip.id)}?${params}`;
}

function resultItem(result, criteria) {
    const { trip, seatsLeft } = result;
    const co2 = co2AvoidedForBooking(trip, {
        seats: criteria.seats,
        passengerDistanceKm: result.passengerDistanceKm,
        detourKm: result.detourKm
    });
    const driver = result.driverName ? `Avec ${result.driverName} · ` : '';
    const details = [el('span', { text: `${driver}${plural(seatsLeft, 'place')} libre${seatsLeft > 1 ? 's' : ''}` })];
    if (result.detourMin != null) {
        details.push(el('span', { class: 'detour', text: result.detourMin < 1
            ? 'Sur la route du conducteur'
            : `Détour du conducteur : +${Math.round(result.detourMin)} min (${formatDistance(result.detourKm)})` }));
    }
    details.push(el('span', { class: 'hint', text: `Votre trajet évite ${formatCo2(co2)} de CO₂` }));
    return el('li', { class: 'trip-item' },
        tripSummary(trip, ...details),
        el('div', { class: 'trip-actions' },
            priceBadge(),
            el('a', { class: 'button-link', href: bookingHref(result, criteria), text: 'Réserver' })));
}

function resultsSection(results, criteria, notice) {
    const section = el('section', { class: 'card', 'aria-live': 'polite' },
        el('h2', { text: results.length ? `${plural(results.length, 'trajet')} disponible${results.length > 1 ? 's' : ''}` : 'Aucun trajet trouvé' }));
    if (notice) section.append(el('p', { class: 'notice', text: notice }));
    if (results.length === 0) {
        section.append(el('p', { class: 'placeholder', text: 'Essayez une autre date ou élargissez le départ et l’arrivée.' }));
        return section;
    }
    section.append(el('ul', { class: 'trip-list' }, ...results.map(result => resultItem(result, criteria))));
    return section;
}

// Recherche par itinéraire : présélection à vol d'oiseau puis classement par détour routier.
async function searchAlongRoute(available, criteria, ors) {
    const request = { pickup: criteria.pickup, dropoff: criteria.dropoff };
    const candidates = preselectCandidates(available, request);
    if (candidates.length === 0) return [];
    const matrix = await ors.matrix(matrixLocations(request, candidates));
    return rankByDetour(candidates, matrix);
}

function myBookingsSection(entries) {
    const now = new Date();
    const byDeparture = (a, b) => a.trip.departureAt.localeCompare(b.trip.departureAt);
    const active = entries.filter(({ booking, trip }) => trip && booking.status === BOOKING_STATUS.CONFIRMED);
    const upcoming = active.filter(({ trip }) => !hasDeparted(trip, now)).sort(byDeparture);
    // Trajets passés en attente de la réponse du passager (« Le trajet a-t-il eu lieu ? »).
    const toConfirm = active.filter(({ booking, trip }) => canRecordProof(booking, trip, now)).sort(byDeparture);

    const item = ({ booking, trip }, linkText) => el('li', { class: 'trip-item' },
        tripSummary(trip, el('span', { text: `${plural(booking.seats, 'place')} · réf. ${booking.reference}` })),
        el('div', { class: 'trip-actions' },
            el('a', { href: `#/passager/reservation/${encodeURIComponent(booking.id)}`, text: linkText })));

    const section = el('section', { class: 'card' }, el('h2', { text: 'Mes réservations' }));
    if (toConfirm.length) {
        section.append(
            el('h3', { text: 'Trajets à confirmer' }),
            el('p', { class: 'hint', text: 'Indiquez si ces trajets ont bien eu lieu : votre réponse permet au conducteur d’obtenir ses crédits carbone.' }),
            el('ul', { class: 'trip-list' }, ...toConfirm.map(entry => item(entry, 'Répondre'))));
    }
    if (upcoming.length) {
        if (toConfirm.length) section.append(el('h3', { text: 'À venir' }));
        section.append(el('ul', { class: 'trip-list' }, ...upcoming.map(entry => item(entry, 'Voir la réservation'))));
    } else if (!toConfirm.length) {
        section.append(el('p', { class: 'placeholder', text: 'Aucune réservation à venir.' }));
    }
    return section;
}

function loginPrompt() {
    return el('section', { class: 'card' },
        el('h2', { text: 'Mes réservations' }),
        el('p', {}, el('a', { href: `#${loginPath()}`, text: 'Connectez-vous' }),
            ' pour réserver un trajet et retrouver vos réservations.'));
}

const loading = text => el('section', { class: 'card' }, el('p', { class: 'hint', text }));

export async function render(root, { api, user, ors }, { query }) {
    const criteria = criteriaFromQuery(query);
    const { form, places } = searchForm(criteria, ors);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const data = new FormData(form);
        const next = { date: data.get('date'), seats: Number(data.get('seats')) };
        const { valid, errors } = validateSearch(next);
        for (const name of ['date', 'seats']) {
            form.querySelector(`#${name}-error`).textContent = errors[name] ?? '';
            form.elements[name].toggleAttribute('aria-invalid', Boolean(errors[name]));
        }
        if (!valid) return;

        const params = new URLSearchParams();
        for (const name of ['origin', 'destination']) {
            const label = data.get(name).trim();
            if (label) params.set(name, label);
            const place = places[name].getPlace();
            if (place) params.set(name === 'origin' ? 'p' : 'd', coordsToParam(place.coords));
        }
        if (next.date) params.set('date', next.date);
        params.set('seats', String(next.seats));
        navigate(`/passager/recherche?${params}`);
    });

    root.append(el('section', { class: 'card' },
        el('h2', { text: 'Rechercher un trajet' }),
        el('p', { class: 'hint', text: ors
            ? 'Tous les trajets sont gratuits pour les passagers. Choisissez les lieux dans les suggestions pour trouver les trajets qui passent près de chez vous.'
            : 'Tous les trajets sont gratuits pour les passagers.' }),
        form));

    const resultsSlot = el('div');
    const bookingsSlot = el('div');
    root.append(resultsSlot, bookingsSlot);

    const bookingsTask = user
        ? api.bookings.mine().then(entries => bookingsSlot.replaceChildren(myBookingsSection(entries)))
        : Promise.resolve(bookingsSlot.replaceChildren(loginPrompt()));
    if (!validateSearch(criteria).valid) return bookingsTask;

    // Un libellé ORS (« Genève, GE, Suisse ») est réduit à sa première partie pour la recherche par nom.
    const placeName = (label, coords) => (coords ? label.split(',')[0].trim() : label);
    const byName = () => api.trips.search({
        origin: placeName(criteria.origin, criteria.pickup),
        destination: placeName(criteria.destination, criteria.dropoff),
        date: criteria.date,
        seats: criteria.seats
    });

    let resultsTask;
    if (!(ors && criteria.pickup && criteria.dropoff)) {
        resultsSlot.replaceChildren(loading('Recherche des trajets…'));
        resultsTask = byName().then(results => resultsSlot.replaceChildren(resultsSection(results, criteria)));
    } else {
        resultsSlot.replaceChildren(loading('Recherche des trajets sur votre itinéraire…'));
        resultsTask = api.trips.search({ date: criteria.date, seats: criteria.seats })
            .then(available => searchAlongRoute(available, criteria, ors))
            .then(results => resultsSlot.replaceChildren(resultsSection(results, criteria,
                `Trajets passant à moins de ${MAX_DETOUR_MIN} min de détour de votre itinéraire, du plus direct au moins direct.`)))
            .catch(async error => {
                if (error.name === 'ApiError' && error.status === 401) throw error;
                console.warn('Recherche par itinéraire indisponible :', error);
                const results = await byName();
                resultsSlot.replaceChildren(resultsSection(results, criteria, `${error.message} Résultats par nom de lieu.`));
            });
    }
    await Promise.all([resultsTask, bookingsTask]);
}
