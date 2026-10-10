// Parcours Conducteur — publication d'un trajet avec estimation CO₂ en direct.
import { validateTrip, createTrip, MAX_SEATS, MAX_DISTANCE_KM } from '../../core/trips.js';
import { co2AvoidedForTrip } from '../../core/co2.js';
import { VEHICLE_PROFILES, VEHICLE_TYPES } from '../../core/emissionFactors.js';
import { seatsBooked } from '../../core/booking.js';
import { el } from '../dom.js';
import { VEHICLE_LABELS, formatCo2 } from '../format.js';
import { LOCAL_DRIVER_ID } from '../session.js';
import { tripSummary } from '../components/tripSummary.js';
import { createCo2EstimatePanel } from './co2EstimatePanel.js';

const DEFAULT_VEHICLE = 'electric';
const FIELD_NAMES = ['origin', 'destination', 'departureAt', 'distanceKm', 'vehicleType', 'seats'];

const defaultSeatsFor = vehicleType => Math.max(1, VEHICLE_PROFILES[vehicleType].seats - 1);

function field(id, label, input) {
    input.id = id;
    input.name = id;
    return el('div', { class: 'input-group' },
        el('label', { for: id, text: label }),
        input,
        el('p', { class: 'field-error', id: `${id}-error`, 'aria-live': 'polite' }));
}

// Valeur datetime-local (heure locale) arrondie à la minute.
function toLocalInputValue(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function readDraft(form) {
    const data = new FormData(form);
    return {
        origin: data.get('origin'),
        destination: data.get('destination'),
        departureAt: data.get('departureAt'),
        distanceKm: parseFloat(data.get('distanceKm')),
        seats: Number(data.get('seats')),
        vehicleType: data.get('vehicleType')
    };
}

function renderTripList(container, trips, bookings) {
    container.replaceChildren(el('h2', { text: 'Mes trajets publiés' }));
    const mine = trips
        .filter(trip => trip.driverId === LOCAL_DRIVER_ID)
        .sort((a, b) => a.departureAt.localeCompare(b.departureAt));
    if (mine.length === 0) {
        container.append(el('p', { class: 'placeholder', text: 'Aucun trajet publié pour le moment.' }));
        return;
    }
    container.append(el('ul', { class: 'trip-list' }, ...mine.map(trip => {
        const booked = seatsBooked(trip.id, bookings);
        return el('li', { class: 'trip-item' }, tripSummary(trip,
            el('span', { text: `Places réservées : ${booked}/${trip.seats}` }),
            el('span', { class: 'hint', text: `CO₂ évité avec les passagers actuels : ${formatCo2(co2AvoidedForTrip({ ...trip, passengers: booked }))}`
                + ` · jusqu’à ${formatCo2(co2AvoidedForTrip({ ...trip, passengers: trip.seats }))} si complet` })));
    })));
}

export function render(root, { tripRepository, bookingRepository }) {
    const now = new Date();
    const vehicleSelect = el('select', {}, ...VEHICLE_TYPES.map(type =>
        el('option', { value: type, text: VEHICLE_LABELS[type] })));
    vehicleSelect.value = DEFAULT_VEHICLE;
    const seatsInput = el('input', { type: 'number', min: '1', max: String(MAX_SEATS), step: '1', value: String(defaultSeatsFor(DEFAULT_VEHICLE)) });

    const form = el('form', { class: 'trip-form', novalidate: '' },
        field('origin', 'Départ', el('input', { type: 'text', autocomplete: 'off', placeholder: 'Ex. Lausanne, gare' })),
        field('destination', 'Arrivée', el('input', { type: 'text', autocomplete: 'off', placeholder: 'Ex. Genève, Cornavin' })),
        field('departureAt', 'Date et heure de départ', el('input', { type: 'datetime-local', min: toLocalInputValue(now) })),
        // Saisie manuelle en attendant le calcul d'itinéraire (étape VROOM).
        field('distanceKm', 'Distance (km)', el('input', { type: 'number', min: '1', max: String(MAX_DISTANCE_KM), step: '0.1', inputmode: 'decimal' })),
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

    const refreshEstimate = () => panel.update(readDraft(form));
    const onEdit = () => {
        refreshEstimate();
        showErrors(validateTrip(readDraft(form), { now: new Date() }).errors, { onlyFlagged: true });
    };
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);

    form.addEventListener('submit', event => {
        event.preventDefault();
        const draft = readDraft(form);
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
        vehicleSelect.value = DEFAULT_VEHICLE;
        seatsInput.value = String(defaultSeatsFor(DEFAULT_VEHICLE));
        seatsEdited = false;
        refreshEstimate();
        renderTripList(tripList, tripRepository.list(), bookingRepository.list());
    });

    root.append(
        el('section', { class: 'card' },
            el('h2', { text: 'Publier un trajet' }),
            el('div', { class: 'publish-layout' }, form, panel.root),
            status),
        tripList
    );
    refreshEstimate();
    renderTripList(tripList, tripRepository.list(), bookingRepository.list());
}
