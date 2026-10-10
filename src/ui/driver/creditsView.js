// Parcours Conducteur — suivi des crédits carbone : trajets à confirmer, totaux par statut,
// historique et soumission pour validation. La validation elle-même est faite par un organisme
// de certification, jamais par l'application.
import {
    aggregateCredits, submitForValidation, progressToNextCredit, CREDIT_STATUS
} from '../../core/carbonCredits.js';
import { canComplete, completeTrip } from '../../core/tripCompletion.js';
import { seatsBooked } from '../../core/booking.js';
import { el } from '../dom.js';
import { formatCo2, formatCredits, formatDateTime } from '../format.js';
import { LOCAL_DRIVER_ID } from '../session.js';
import { tripSummary, plural } from '../components/tripSummary.js';
import { driverNav } from './driverNav.js';

const STATUS_LABELS = {
    [CREDIT_STATUS.ESTIMATED]: 'Estimé',
    [CREDIT_STATUS.PENDING]: 'En validation',
    [CREDIT_STATUS.VALIDATED]: 'Validé'
};

const statusBadge = status => el('span', { class: `status-badge status-${status}`, text: STATUS_LABELS[status] });

function totalsSection(entries) {
    const totals = aggregateCredits(entries);
    const all = totals.estimated + totals.pending + totals.validated;
    const { completed, fraction } = progressToNextCredit(all);
    const tile = (status, value) => el('div', { class: `credit-tile status-${status}` },
        el('span', { class: 'credit-tile-label', text: STATUS_LABELS[status] }),
        el('strong', { class: 'credit-tile-value', text: formatCredits(value) }));

    return el('section', { class: 'card' },
        el('h2', { text: 'Mes crédits carbone' }),
        el('p', {}, 'CO₂ évité grâce à vos passagers : ', el('strong', { text: formatCo2(totals.co2AvoidedG) })),
        el('div', { class: 'credit-tiles' },
            tile(CREDIT_STATUS.ESTIMATED, totals.estimated),
            tile(CREDIT_STATUS.PENDING, totals.pending),
            tile(CREDIT_STATUS.VALIDATED, totals.validated)),
        el('div', { class: 'progress-block' },
            el('label', { for: 'credit-progress', text: `Vers votre ${completed === 0 ? 'premier' : `${completed + 1}e`} crédit (1 tonne de CO₂) : ${Math.round(fraction * 100)}\u00a0%` }),
            el('progress', { id: 'credit-progress', max: '1', value: String(fraction) })),
        el('p', { class: 'hint', text: '1 crédit = 1 tonne de CO₂ évitée. Les crédits estimés sont calculés par EcoVroom ; '
            + 'une fois soumis, ils sont vérifiés par un organisme de certification avant d’être validés et valorisés '
            + 'auprès des partenaires RSE.' }));
}

function toConfirmSection(trips, bookings, onComplete) {
    const section = el('section', { class: 'card' }, el('h2', { text: 'Trajets à confirmer' }));
    if (trips.length === 0) {
        section.append(el('p', { class: 'placeholder', text: 'Aucun trajet en attente : les trajets apparaissent ici après leur heure de départ.' }));
        return section;
    }
    section.append(el('p', { class: 'hint', text: 'Confirmez les trajets effectués pour calculer les crédits correspondants.' }));
    section.append(el('ul', { class: 'trip-list' }, ...trips.map(trip => {
        const seats = seatsBooked(trip.id, bookings);
        const button = el('button', { type: 'button', text: 'Confirmer le trajet effectué' });
        button.addEventListener('click', () => onComplete(trip, button));
        return el('li', { class: 'trip-item' },
            tripSummary(trip, el('span', { text: seats > 0 ? `${plural(seats, 'place')} réservée${seats > 1 ? 's' : ''}` : 'Aucun passager' })),
            el('div', { class: 'trip-actions' }, button));
    })));
    return section;
}

function historySection(entries, tripsById, onSubmit) {
    const section = el('section', { class: 'card' }, el('h2', { text: 'Historique' }));
    if (entries.length === 0) {
        section.append(el('p', { class: 'placeholder', text: 'Aucun crédit pour le moment : confirmez un trajet effectué avec des passagers.' }));
        return section;
    }
    const estimatedCount = entries.filter(e => e.status === CREDIT_STATUS.ESTIMATED).length;
    if (estimatedCount > 0) {
        const submit = el('button', { type: 'button', text: `Soumettre ${plural(estimatedCount, 'trajet')} pour validation` });
        submit.addEventListener('click', () => onSubmit(submit));
        section.append(el('div', { class: 'button-group' }, submit));
    }

    const sorted = [...entries].sort((a, b) => b.estimatedAt.localeCompare(a.estimatedAt));
    section.append(el('div', { class: 'table-wrapper' }, el('table', { class: 'credits-table' },
        el('thead', {}, el('tr', {},
            ...['Trajet', 'Date', 'Passagers', 'CO₂ évité', 'Crédits', 'Statut'].map(h => el('th', { text: h })))),
        el('tbody', {}, ...sorted.map(entry => {
            const trip = tripsById.get(entry.tripId);
            return el('tr', {},
                el('td', { text: trip ? `${trip.origin} → ${trip.destination}` : 'Trajet supprimé' }),
                el('td', { text: trip ? formatDateTime(trip.departureAt) : '' }),
                el('td', { text: String(entry.passengerSeats) }),
                el('td', { text: formatCo2(entry.co2AvoidedG) }),
                el('td', { text: formatCredits(entry.credits) }),
                el('td', {}, statusBadge(entry.status)));
        })))));
    return section;
}

export function render(root, context) {
    const { tripRepository, bookingRepository, creditRepository } = context;
    const now = new Date();
    const trips = tripRepository.list().filter(trip => trip.driverId === LOCAL_DRIVER_ID);
    const bookings = bookingRepository.list();
    const entries = creditRepository.list().filter(entry => entry.driverId === LOCAL_DRIVER_ID);
    const status = el('p', { class: 'form-status', role: 'status' });
    const rerender = message => {
        root.replaceChildren();
        render(root, context);
        root.querySelector('.form-status').textContent = message;
    };

    function onComplete(trip, button) {
        button.disabled = true;
        try {
            const result = completeTrip({ trip, bookings: bookingRepository.list(), driverId: LOCAL_DRIVER_ID }, { now: new Date() });
            // Crédit d'abord : en cas d'échec de l'écriture du trajet, une nouvelle confirmation
            // remplace la même entrée (identifiant dérivé du trajet) sans la dupliquer.
            if (result.creditEntry) creditRepository.save(result.creditEntry);
            tripRepository.save(result.trip);
            rerender(result.creditEntry
                ? `Trajet confirmé : ${formatCredits(result.creditEntry.credits)} estimé (${formatCo2(result.creditEntry.co2AvoidedG)} de CO₂ évité).`
                : 'Trajet confirmé, sans passager : aucun crédit.');
        } catch (error) {
            console.error('Confirmation impossible :', error);
            status.textContent = error instanceof RangeError ? error.message : 'La confirmation n’a pas pu être enregistrée.';
            button.disabled = false;
        }
    }

    function onSubmit(button) {
        button.disabled = true;
        try {
            const submitted = submitForValidation(creditRepository.list().filter(e => e.driverId === LOCAL_DRIVER_ID), { now: new Date() });
            submitted.forEach(entry => creditRepository.save(entry));
            const total = submitted.reduce((sum, entry) => sum + entry.credits, 0);
            rerender(`${formatCredits(total)} soumis pour validation.`);
        } catch (error) {
            console.error('Soumission impossible :', error);
            status.textContent = 'La soumission n’a pas pu être enregistrée.';
            button.disabled = false;
        }
    }

    const toConfirm = trips
        .filter(trip => canComplete(trip, now))
        .sort((a, b) => a.departureAt.localeCompare(b.departureAt));

    root.append(
        driverNav('/conducteur/credits'),
        status,
        totalsSection(entries),
        toConfirmSection(toConfirm, bookings, onComplete),
        historySection(entries, new Map(trips.map(trip => [trip.id, trip])), onSubmit));
}
