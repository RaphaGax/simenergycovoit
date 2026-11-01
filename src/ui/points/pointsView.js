// « Mes VroomPoints » : la progression de l'aventurier, conducteur comme passager.
// Les points viennent du serveur (/api/me/points), calculés par src/core/vroomPoints.js.
import { canComplete } from '../../core/tripCompletion.js';
import { seatsBooked } from '../../core/booking.js';
import { MIN_DISTANCE_KM, POINTS_STATUS } from '../../core/vroomPoints.js';
import { el } from '../dom.js';
import { icon } from '../components/icons.js';
import { pageHero } from '../components/pageHero.js';
import { formatDate, formatPoints } from '../format.js';
import { tripSummary, plural } from '../components/tripSummary.js';

const AWAITING_LABELS = {
    driver: 'En attente : le conducteur doit confirmer le trajet',
    passengers: 'En attente des confirmations des passagers',
    you: 'Confirmez le trajet pour gagner ces points'
};

function levelSection({ earned, pending, level }) {
    const nextText = level.next
        ? `Encore ${formatPoints(level.next.min - earned)} pour devenir ${level.next.name}.`
        : 'Niveau maximum atteint : bravo, Légende !';
    return el('section', { class: 'card level-card' },
        el('div', { class: 'level-head' },
            el('span', { class: 'level-icon' }, icon('star', { size: 28 })),
            el('div', {},
                el('p', { class: 'level-rank', text: `Niveau ${level.rank}` }),
                el('h2', { class: 'level-name', text: level.name }))),
        el('p', { class: 'points-total' },
            el('strong', { text: earned.toLocaleString('fr-CH') }),
            el('span', { text: earned >= 2 ? ' VroomPoints' : ' VroomPoint' })),
        ...(pending > 0 ? [el('p', { class: 'points-pending', text: `+ ${formatPoints(pending)} en attente de confirmation` })] : []),
        el('div', { class: 'progress-block' },
            el('label', { for: 'level-progress', text: nextText }),
            el('progress', { id: 'level-progress', max: '1', value: String(level.progress) })));
}

function toConfirmSection(trips, bookings, onComplete) {
    const section = el('section', { class: 'card' }, el('h2', { text: 'Trajets à confirmer (conducteur)' }),
        el('p', { class: 'hint', text: 'Confirmez vos trajets effectués : vos passagers pourront alors confirmer à leur tour, et chacun gagne ses VroomPoints.' }));
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

function historyItem(entry) {
    const earned = entry.status === POINTS_STATUS.EARNED;
    const item = el('li', { class: `points-item points-${entry.status}` },
        el('div', { class: 'points-item-body' },
            el('span', { class: 'points-role', text: entry.role === 'driver' ? 'Conducteur' : 'Passager' }),
            el('strong', { text: `${entry.trip.origin} → ${entry.trip.destination}` }),
            el('span', { class: 'hint', text: formatDate(entry.trip.departureAt) }),
            el('span', { class: 'points-state', text: earned ? 'Acquis ✓' : AWAITING_LABELS[entry.awaiting] })),
        el('span', { class: 'points-amount', text: `${earned ? '+' : ''}${entry.points}` }));
    if (entry.awaiting === 'you' && entry.bookingId) {
        item.querySelector('.points-item-body').append(
            el('a', { href: `#/passager/reservation/${encodeURIComponent(entry.bookingId)}`, text: 'Répondre →' }));
    }
    return item;
}

function historySection(entries) {
    const section = el('section', { class: 'card' }, el('h2', { text: 'Mes aventures' }));
    if (entries.length === 0) {
        section.append(el('p', { class: 'placeholder', text: 'Aucun point pour le moment : partagez ou réservez un trajet pour commencer l’aventure.' }));
        return section;
    }
    section.append(el('ul', { class: 'points-list' }, ...entries.map(historyItem)));
    return section;
}

function rulesSection() {
    return el('details', { class: 'card rules' },
        el('summary', { text: 'Règles du jeu' }),
        el('ul', { class: 'plain-list' },
            el('li', { text: '1 VroomPoint = 1 kg de CO₂ évité ensemble, selon le calcul EcoVroom.' }),
            el('li', { text: `Trajets d’au moins ${MIN_DISTANCE_KM} km.` }),
            el('li', { text: 'Voiture pleine : 100 % des points du trajet. À moitié pleine : déjà 80 %.' }),
            el('li', { text: 'Partage : la moitié pour le conducteur, l’autre moitié pour les passagers, selon leurs places.' }),
            el('li', { text: 'Les points sont acquis quand le conducteur et les passagers ont confirmé le trajet (7 jours pour répondre).' }),
            el('li', { text: 'Niveaux : Explorateur, Éclaireur (25), Pionnier (150), Légende (500).' })));
}

export async function render(root, context, route = {}) {
    const { api } = context;
    const [points, tripEntries] = await Promise.all([api.points(), api.trips.mine()]);
    const trips = tripEntries.map(entry => entry.trip);
    const bookings = tripEntries.flatMap(entry => entry.bookings);
    const now = new Date();
    const status = el('p', { class: 'form-status', role: 'status', text: route.message ?? '' });

    async function onComplete(trip, button) {
        button.disabled = true;
        try {
            await api.trips.complete(trip.id);
            root.replaceChildren();
            await render(root, context, { message: 'Trajet confirmé : vos passagers peuvent maintenant confirmer à leur tour.' });
        } catch (error) {
            console.error('Confirmation impossible :', error);
            status.textContent = error.message;
            button.disabled = false;
        }
    }

    const toConfirm = trips
        .filter(trip => canComplete(trip, now))
        .sort((a, b) => a.departureAt.localeCompare(b.departureAt));

    root.append(
        pageHero('Mes VroomPoints', 'Chaque kilo de CO₂ évité ensemble vous rapporte 1 VroomPoint.'),
        status,
        levelSection(points),
        ...(toConfirm.length ? [toConfirmSection(toConfirm, bookings, onComplete)] : []),
        historySection(points.entries),
        rulesSection());
}
