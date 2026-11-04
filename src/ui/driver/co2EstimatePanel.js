// Panneau « Votre impact et vos points », recalculé à chaque saisie du formulaire de publication.
// La consommation et les émissions s'affichent dès la distance saisie, même sans passager
// (usage pédagogique) ; les points demandent au moins un passager.
import { estimateTripCo2 } from '../../core/co2.js';
import { estimateConsumption, CONSUMPTION_SOURCE } from '../../core/consumption.js';
import { pointsBySeatsFilled, MIN_DISTANCE_KM } from '../../core/vroomPoints.js';
import { el } from '../dom.js';
import { formatCo2, formatPoints } from '../format.js';

const formatAmount = ({ amount, unit, label }) =>
    `${amount.toLocaleString('fr-CH', { maximumFractionDigits: amount < 10 ? 1 : 0 })} ${unit} ${label}`;

const percent = share => `${Math.round(share * 100)}\u00a0%`;

export function createCo2EstimatePanel() {
    const root = el('aside', { class: 'co2-panel', 'aria-live': 'polite' });

    function update({ distanceKm, vehicleType, seats, carSeats, otherOccupiedSeats }) {
        root.replaceChildren(el('h3', { text: 'Votre impact et vos points' }));
        if (!(Number.isFinite(distanceKm) && distanceKm > 0) || !vehicleType) {
            root.append(el('p', { class: 'placeholder', text: 'Renseignez la distance pour voir votre consommation et vos émissions.' }));
            return;
        }

        root.append(
            el('p', {}, 'Consommation estimée : ',
                el('strong', { text: estimateConsumption({ distanceKm, vehicleType }).map(formatAmount).join(' + ') }),
                el('span', { class: 'hint', text: ` (moyenne ${CONSUMPTION_SOURCE})` })),
            el('p', {}, 'Émissions de votre véhicule : ', el('strong', { text: formatCo2(estimateTripCo2({ distanceKm, vehicleType })) })));

        const free = carSeats - otherOccupiedSeats;
        const seatsOk = [seats, carSeats, otherOccupiedSeats].every(Number.isInteger) && seats >= 1 && otherOccupiedSeats >= 0 && seats <= free;
        if (distanceKm < MIN_DISTANCE_KM) {
            root.append(el('p', { class: 'notice', text: `Les trajets de moins de ${MIN_DISTANCE_KM} km ne produisent pas de points.` }));
        } else if (seatsOk) {
            const rows = pointsBySeatsFilled({ distanceKm, vehicleType, seats, carSeats, otherOccupiedSeats });
            const best = rows[rows.length - 1];
            root.append(
                el('p', {}, `Avec ${seats} passager${seats > 1 ? 's' : ''} : `, el('strong', { text: formatPoints(best.driverPoints) }),
                    ` pour vous (${percent(best.driverShare)} des points).`),
                el('table', { class: 'co2-table' },
                    el('thead', {}, el('tr', {},
                        el('th', { text: 'Passagers' }), el('th', { text: 'CO₂ évité' }),
                        el('th', { text: 'Vos points' }), el('th', { text: 'Par passager' }))),
                    el('tbody', {}, ...rows.map(row => el('tr', {},
                        el('td', { text: String(row.passengers) }),
                        el('td', { text: formatCo2(row.co2AvoidedKg * 1000) }),
                        el('td', { text: `${row.driverPoints}\u00a0(${percent(row.driverShare)})` }),
                        el('td', { text: String(row.passengerPoints) }))))));
        }

        root.append(el('p', { class: 'hint', text: 'Seul au volant, ce calcul est indicatif : il faut au moins un passager pour produire des points. '
            + 'Les points d’un trajet correspondent au CO₂ réellement évité par vos passagers (chacun évite un trajet seul en voiture à essence). '
            + 'Votre part va de 50 % avec un seul siège occupé à 80 % voiture pleine ; le reste revient aux passagers. '
            + 'Les points sont acquis après confirmation du trajet par vous et vos passagers.' }));
    }

    return { root, update };
}
