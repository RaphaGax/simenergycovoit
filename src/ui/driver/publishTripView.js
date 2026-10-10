// Parcours Conducteur — publication d'un trajet avec estimation CO₂ en direct.
import { validateTrip, createTrip, MAX_SEATS, MAX_DISTANCE_KM } from '../../core/trips.js';
import { co2AvoidedForTrip, co2AvoidedForBooking } from '../../core/co2.js';
import { VEHICLE_PROFILES, VEHICLE_TYPES } from '../../core/emissionFactors.js';
import { seatsBooked, hasDeparted, BOOKING_STATUS } from '../../core/booking.js';
import { isValidCoords } from '../../core/geo.js';
import { el } from '../dom.js';
import { VEHICLE_LABELS, formatCo2, formatDistance } from '../format.js';
import { LOCAL_DRIVER_ID } from '../session.js';
import { tripSummary } from '../components/tripSummary.js';
import { createPlaceInput } from '../components/placeInput.js';
import { createItineraryPanel } from './itineraryPanel.js';
import { driverNav } from './driverNav.js';
import { createCo2EstimatePanel } from './co2EstimatePanel.js';

const DEFAULT_VEHICLE = 'electric';
const FIELD_NAMES = ['origin', 'destination', 'departureAt', 'distanceKm', 'vehicleType', 'seats'];

const defaultSeatsFor = vehicleType => Math.max(1, VEHICLE_PROFILES[vehicleType].seats - 1);

function field(id, label, input, ...extra) {
    input.id = id;
    input.name = id;
    return el('div', { class: 'input-group' },
        el('label', { for: id, text: label }),
        input,
        ...extra,
        el('p', { class: 'field-error', id: `${id}-error`, 'aria-live': 'polite' }));
}

// Valeur datetime-local (heure locale) arrondie à la minute.
function toLocalInputValue(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function readDraft(form, places) {
    const data = new FormData(form);
    return {
        origin: data.get('origin'),
        destination: data.get('destination'),
        originCoords: places.origin.getPlace()?.coords ?? null,
        destinationCoords: places.destination.getPlace()?.coords ?? null,
        departureAt: data.get('departureAt'),
        distanceKm: parseFloat(data.get('distanceKm')),
        seats: Number(data.get('seats')),
        vehicleType: data.get('vehicleType')
    };
}

function renderTripList(container, trips, bookings, ors) {
    container.replaceChildren(el('h2', { text: 'Mes trajets publiés' }));
    const mine = trips
        .filter(trip => trip.driverId === LOCAL_DRIVER_ID)
        .sort((a, b) => a.departureAt.localeCompare(b.departureAt));
    if (mine.length === 0) {
        container.append(el('p', { class: 'placeholder', text: 'Aucun trajet publié pour le moment.' }));
        return;
    }
    container.append(el('ul', { class: 'trip-list' }, ...mine.map(trip => {
        const tripBookings = bookings.filter(b => b.tripId === trip.id && b.status === BOOKING_STATUS.CONFIRMED);
        const booked = seatsBooked(trip.id, bookings);
        const avoided = tripBookings.reduce((sum, booking) => sum + co2AvoidedForBooking(trip, booking), 0);
        const departed = hasDeparted(trip, new Date());
        const state = trip.completedAt
            ? el('span', { class: 'status-badge status-validated', text: 'Effectué ✓' })
            : departed
                ? el('a', { href: '#/conducteur/credits', text: 'Parti : à confirmer pour vos crédits →' })
                : null;
        const item = el('li', { class: 'trip-item' }, tripSummary(trip,
            ...(state ? [state] : []),
            el('span', { text: `Places réservées : ${booked}/${trip.seats}` }),
            el('span', { class: 'hint', text: `CO₂ évité avec les passagers actuels : ${formatCo2(avoided)}`
                + ` · jusqu’à ${formatCo2(co2AvoidedForTrip({ ...trip, passengers: trip.seats }))} si complet` })));
        // Itinéraire optimisé par VROOM : nécessite ORS, des coordonnées et au moins une réservation.
        if (ors && !departed && tripBookings.length > 0 && isValidCoords(trip.originCoords) && isValidCoords(trip.destinationCoords)) {
            item.append(createItineraryPanel({ trip, bookings: tripBookings, ors }));
        }
        return item;
    })));
}

export function render(root, { tripRepository, bookingRepository, ors }) {
    const now = new Date();
    const distanceInput = el('input', { type: 'number', min: '1', max: String(MAX_DISTANCE_KM), step: '0.1', inputmode: 'decimal' });
    const routeInfo = el('p', { class: 'hint', 'aria-live': 'polite' });
    let routeController;

    // Distance routière calculée par ORS dès que départ et arrivée sont localisés ; reste modifiable.
    async function updateRoute() {
        routeController?.abort();
        const from = places.origin.getPlace();
        const to = places.destination.getPlace();
        if (!ors || !from || !to) {
            routeInfo.textContent = ors ? 'Choisissez départ et arrivée dans les suggestions pour calculer la distance.' : '';
            return;
        }
        routeController = new AbortController();
        routeInfo.textContent = 'Calcul de l’itinéraire…';
        try {
            const route = await ors.directions(from.coords, to.coords, { signal: routeController.signal });
            distanceInput.value = String(Math.round(route.distanceKm * 10) / 10);
            routeInfo.textContent = `Itinéraire : ${formatDistance(route.distanceKm)}, environ ${Math.round(route.durationMin)} min.`;
            form.dispatchEvent(new Event('input'));
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.warn('Itinéraire indisponible :', error);
            routeInfo.textContent = `${error.message} Saisissez la distance à la main.`;
        }
    }
    const places = {
        origin: createPlaceInput({ id: 'origin', placeholder: 'Ex. Lausanne, gare', ors, onChange: updateRoute }),
        destination: createPlaceInput({ id: 'destination', placeholder: 'Ex. Genève, Cornavin', ors, onChange: updateRoute })
    };
    const vehicleSelect = el('select', {}, ...VEHICLE_TYPES.map(type =>
        el('option', { value: type, text: VEHICLE_LABELS[type] })));
    vehicleSelect.value = DEFAULT_VEHICLE;
    const seatsInput = el('input', { type: 'number', min: '1', max: String(MAX_SEATS), step: '1', value: String(defaultSeatsFor(DEFAULT_VEHICLE)) });

    const form = el('form', { class: 'trip-form', novalidate: '' },
        field('origin', 'Départ', places.origin.input, ...places.origin.extra),
        field('destination', 'Arrivée', places.destination.input, ...places.destination.extra),
        field('departureAt', 'Date et heure de départ', el('input', { type: 'datetime-local', min: toLocalInputValue(now) })),
        field('distanceKm', 'Distance (km)', distanceInput, routeInfo),
        field('vehicleType', 'Motorisation', vehicleSelect),
        field('seats', 'Places proposées', seatsInput),
        el('div', { class: 'button-group' }, el('button', { type: 'submit', text: 'Publier le trajet' }))
    );
    const panel = createCo2EstimatePanel();
    const status = el('p', { class: 'form-status', role: 'status' });
    const tripList = el('section', { class: 'card' });

    let seatsEdited = false;
    seatsInput.addEventListener('input', () => { seatsEdited = true; });
    vehicleSelect.addEventListener('change', () => {
        if (!seatsEdited) seatsInput.value = String(defaultSeatsFor(vehicleSelect.value));
    });

    // Affiche les erreurs ; avec onlyFlagged, ne met à jour que les champs déjà signalés
    // (une erreur disparaît dès que le champ est corrigé, sans en afficher de nouvelles en cours de saisie).
    function showErrors(errors, { onlyFlagged = false } = {}) {
        for (const name of FIELD_NAMES) {
            const input = form.elements[name];
            if (onlyFlagged && !input.hasAttribute('aria-invalid')) continue;
            form.querySelector(`#${name}-error`).textContent = errors[name] ?? '';
            input.toggleAttribute('aria-invalid', Boolean(errors[name]));
        }
    }

    const refreshEstimate = () => panel.update(readDraft(form, places));
    const onEdit = () => {
        refreshEstimate();
        showErrors(validateTrip(readDraft(form, places), { now: new Date() }).errors, { onlyFlagged: true });
    };
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const draft = readDraft(form, places);
        const { valid, errors } = validateTrip(draft, { now: new Date() });
        showErrors(errors);
        if (!valid) {
            status.textContent = '';
            form.querySelector('[aria-invalid]')?.focus();
            return;
        }

        let trip;
        try {
            trip = tripRepository.save(createTrip(draft, { id: crypto.randomUUID(), driverId: LOCAL_DRIVER_ID }));
        } catch (error) {
            console.error('Erreur de publication :', error);
            status.textContent = 'Le trajet n’a pas pu être enregistré. Vérifiez que le stockage du navigateur est autorisé.';
            return;
        }
        status.textContent = `Trajet ${trip.origin} → ${trip.destination} publié.`;
        form.reset();
        places.origin.reset();
        places.destination.reset();
        routeInfo.textContent = '';
        vehicleSelect.value = DEFAULT_VEHICLE;
        seatsInput.value = String(defaultSeatsFor(DEFAULT_VEHICLE));
        seatsEdited = false;
        refreshEstimate();
        renderTripList(tripList, tripRepository.list(), bookingRepository.list(), ors);
    });

    root.append(
        driverNav('/conducteur/publier'),
        el('section', { class: 'card' },
            el('h2', { text: 'Publier un trajet' }),
            el('div', { class: 'publish-layout' }, form, panel.root),
            status),
        tripList
    );
    refreshEstimate();
    updateRoute();
    renderTripList(tripList, tripRepository.list(), bookingRepository.list(), ors);
}
