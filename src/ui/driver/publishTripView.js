// Parcours Conducteur — publication d'un trajet avec estimation CO₂ en direct.
import { validateTrip, MAX_SEATS, MAX_DISTANCE_KM } from '../../core/trips.js';
import { co2AvoidedForTrip, co2AvoidedForBooking } from '../../core/co2.js';
import { VEHICLE_TYPES } from '../../core/emissionFactors.js';
import { seatsBooked, hasDeparted, BOOKING_STATUS } from '../../core/booking.js';
import { isValidCoords } from '../../core/geo.js';
import { el } from '../dom.js';
import { VEHICLE_LABELS, formatCo2, formatDistance } from '../format.js';
import { tripSummary, plural } from '../components/tripSummary.js';
import { createPlaceInput } from '../components/placeInput.js';
import { createItineraryPanel } from './itineraryPanel.js';
import { createWazeButton } from '../components/wazeButton.js';
import { pageHero } from '../components/pageHero.js';
import { driverDestination } from '../../core/navigation.js';
import { canCancelTrip } from '../../core/tripCancellation.js';
import { driverNav } from './driverNav.js';
import { createCo2EstimatePanel } from './co2EstimatePanel.js';

const DEFAULT_VEHICLE = 'electric';
const FIELD_NAMES = ['origin', 'destination', 'departureAt', 'distanceKm', 'vehicleType', 'carSeats', 'otherOccupiedSeats', 'seats'];
const DEFAULT_CAR_SEATS = 4;

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

function toIsoOrEmpty(localValue) {
    const date = new Date(localValue);
    return localValue && !Number.isNaN(date.getTime()) ? date.toISOString() : '';
}

function readDraft(form, places) {
    const data = new FormData(form);
    return {
        origin: data.get('origin'),
        destination: data.get('destination'),
        originCoords: places.origin.getPlace()?.coords ?? null,
        destinationCoords: places.destination.getPlace()?.coords ?? null,
        // Heure locale du navigateur convertie en ISO : le serveur ne dépend pas de son propre fuseau.
        departureAt: toIsoOrEmpty(data.get('departureAt')),
        distanceKm: parseFloat(data.get('distanceKm')),
        seats: Number(data.get('seats')),
        carSeats: Number(data.get('carSeats')),
        otherOccupiedSeats: Number(data.get('otherOccupiedSeats')),
        vehicleType: data.get('vehicleType')
    };
}

// entries : [{ trip, bookings }] renvoyés par le serveur pour le conducteur connecté.
// Bouton « Annuler le trajet » : un premier clic demande confirmation, le second annule.
function cancelButton(trip, passengers, { api, onCancelled }) {
    const button = el('button', { type: 'button', class: 'button-secondary', text: 'Annuler le trajet' });
    const error = el('p', { class: 'error-message', role: 'alert' });
    let armed = false;
    button.addEventListener('click', async () => {
        if (!armed) {
            armed = true;
            button.textContent = passengers > 0
                ? `Confirmer l’annulation (${plural(passengers, 'passager')} prévenu${passengers > 1 ? 's' : ''})`
                : 'Confirmer l’annulation';
            return;
        }
        button.disabled = true;
        try {
            onCancelled(trip, await api.trips.cancel(trip.id));
        } catch (cause) {
            console.error('Annulation impossible :', cause);
            error.textContent = cause.message;
            button.disabled = false;
        }
    });
    return el('div', { class: 'cancel-trip' }, button, error);
}

function renderTripList(container, entries, { api, ors, onCancelled }) {
    container.replaceChildren(el('h2', { text: 'Mes trajets publiés' }));
    if (entries.length === 0) {
        container.append(el('p', { class: 'placeholder', text: 'Aucun trajet publié pour le moment.' }));
        return;
    }
    const sorted = [...entries].sort((a, b) => a.trip.departureAt.localeCompare(b.trip.departureAt));
    container.append(el('ul', { class: 'trip-list' }, ...sorted.map(({ trip, bookings }) => {
        const tripBookings = bookings.filter(b => b.status === BOOKING_STATUS.CONFIRMED);
        const booked = seatsBooked(trip.id, bookings);
        const avoided = tripBookings.reduce((sum, booking) => sum + co2AvoidedForBooking(trip, booking), 0);
        const departed = hasDeparted(trip, new Date());
        const state = trip.cancelledAt
            ? el('span', { class: 'status-badge status-cancelled', text: 'Annulé' })
            : trip.completedAt
            ? el('span', { class: 'status-badge status-validated', text: 'Effectué ✓' })
            : departed
                ? el('a', { href: '#/vroompoints', text: 'Parti : à confirmer pour gagner vos VroomPoints →' })
                : null;
        const item = el('li', { class: 'trip-item' }, tripSummary(trip,
            ...(state ? [state] : []),
            el('span', { text: `Places réservées : ${booked}/${trip.seats}` }),
            ...(tripBookings.length ? [el('span', {}, 'Passagers : ', ...tripBookings.flatMap((b, i) => [
                ...(i > 0 ? [', '] : []),
                el('a', { href: `#/passager/reservation/${encodeURIComponent(b.id)}`, text: `${b.passengerName} (${plural(b.seats, 'place')})` })
            ]))] : []),
            el('span', { class: 'hint', text: `CO₂ évité avec les passagers actuels : ${formatCo2(avoided)}`
                + ` · jusqu’à ${formatCo2(co2AvoidedForTrip({ ...trip, passengers: trip.seats }))} si complet` })));
        // Navigation vers l'arrivée tant que le trajet n'est pas marqué effectué. Waze ne gère qu'une
        // destination : le conducteur est prévenu s'il doit d'abord prendre des passagers ailleurs.
        if (!trip.completedAt && !trip.cancelledAt) {
            const waze = createWazeButton(driverDestination(trip), { purpose: 'Arrivée' });
            const pickups = [...new Set(tripBookings.map(b => b.pickup?.label).filter(Boolean))];
            if (pickups.length) {
                waze.append(el('span', { class: 'hint', text: `Waze ne gère pas les étapes : passez d’abord prendre vos passagers (${pickups.join(', ')}).` }));
            }
            item.append(waze);
        }
        // Itinéraire optimisé par VROOM : nécessite ORS, des coordonnées et au moins une réservation.
        if (ors && !departed && !trip.cancelledAt && tripBookings.length > 0 && isValidCoords(trip.originCoords) && isValidCoords(trip.destinationCoords)) {
            item.append(createItineraryPanel({ trip, bookings: tripBookings, api }));
        }
        if (canCancelTrip(trip, new Date())) {
            const passengers = new Set(tripBookings.map(b => b.passengerId)).size;
            item.append(cancelButton(trip, passengers, { api, onCancelled }));
        }
        return item;
    })));
}

export async function render(root, { api, ors }) {
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
    const seatInput = value => el('input', { type: 'number', min: '0', max: String(MAX_SEATS), step: '1', inputmode: 'numeric', value: String(value) });
    const carSeatsInput = seatInput(DEFAULT_CAR_SEATS);
    carSeatsInput.min = '1';
    const otherInput = seatInput(0);
    const seatsInput = seatInput(DEFAULT_CAR_SEATS);
    seatsInput.min = '1';

    const form = el('form', { class: 'trip-form', novalidate: '' },
        field('origin', 'Départ', places.origin.input, ...places.origin.extra),
        field('destination', 'Arrivée', places.destination.input, ...places.destination.extra),
        field('departureAt', 'Date et heure de départ', el('input', { type: 'datetime-local', min: toLocalInputValue(now) })),
        field('distanceKm', 'Distance (km)', distanceInput, routeInfo),
        field('vehicleType', 'Motorisation', vehicleSelect),
        field('carSeats', 'Sièges passagers dans la voiture (sans le vôtre)', carSeatsInput),
        field('otherOccupiedSeats', 'Sièges déjà occupés (famille, marchandise)', otherInput,
            el('p', { class: 'hint', text: 'Une voiture pleine augmente votre part des points, sans en produire plus.' })),
        field('seats', 'Places proposées sur EcoVroom', seatsInput),
        el('div', { class: 'button-group' }, el('button', { type: 'submit', text: 'Publier le trajet' }))
    );
    const panel = createCo2EstimatePanel();
    const status = el('p', { class: 'form-status', role: 'status' });
    const tripList = el('section', { class: 'card' });

    // Places proposées = sièges libres, tant que le conducteur ne les a pas modifiées lui-même.
    let seatsEdited = false;
    seatsInput.addEventListener('input', () => { seatsEdited = true; });
    const followFreeSeats = () => {
        const free = Number(carSeatsInput.value) - Number(otherInput.value);
        if (!seatsEdited && Number.isInteger(free) && free >= 1) seatsInput.value = String(free);
    };
    carSeatsInput.addEventListener('input', followFreeSeats);
    otherInput.addEventListener('input', followFreeSeats);

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

    const onCancelled = async (trip, result) => {
        status.textContent = result.cancelledBookings === 0
            ? `Trajet ${trip.origin} → ${trip.destination} annulé.`
            : `Trajet ${trip.origin} → ${trip.destination} annulé : ${plural(result.cancelledBookings, 'réservation')} annulée${result.cancelledBookings > 1 ? 's' : ''}`
                + (result.notified > 0 ? ', vos passagers ont été prévenus par e-mail.' : ', vos passagers le verront dans l’application.');
        await reloadList();
    };
    const reloadList = async () => renderTripList(tripList, await api.trips.mine(), { api, ors, onCancelled });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        // Lieux tapés sans choisir de suggestion : localisés, pour que les passagers trouvent le trajet.
        await Promise.all([places.origin.resolve(), places.destination.resolve()]);
        const draft = readDraft(form, places);
        const { valid, errors } = validateTrip(draft, { now: new Date() });
        showErrors(errors);
        if (!valid) {
            status.textContent = '';
            form.querySelector('[aria-invalid]')?.focus();
            return;
        }

        const submit = form.querySelector('button[type=submit]');
        submit.disabled = true;
        let trip;
        try {
            trip = await api.trips.publish(draft);
        } catch (error) {
            console.error('Erreur de publication :', error);
            showErrors(error.fields ?? {});
            status.textContent = error.message;
            return;
        } finally {
            submit.disabled = false;
        }
        status.textContent = `Trajet ${trip.origin} → ${trip.destination} publié.`;
        form.reset();
        places.origin.reset();
        places.destination.reset();
        routeInfo.textContent = '';
        vehicleSelect.value = DEFAULT_VEHICLE;
        carSeatsInput.value = String(DEFAULT_CAR_SEATS);
        otherInput.value = '0';
        seatsInput.value = String(DEFAULT_CAR_SEATS);
        seatsEdited = false;
        refreshEstimate();
        await reloadList();
    });

    root.append(
        pageHero('Je partage mon trajet', 'Publiez votre trajet : vos passagers voyagent gratuitement, vous gagnez des VroomPoints.'),
        driverNav('/conducteur/publier'),
        el('section', { class: 'card' },
            el('h2', { text: 'Publier un trajet' }),
            el('div', { class: 'publish-layout' }, form, panel.root),
            status),
        tripList
    );
    refreshEstimate();
    updateRoute();
    tripList.append(el('p', { class: 'hint', text: 'Chargement de vos trajets…' }));
    await reloadList();
}
