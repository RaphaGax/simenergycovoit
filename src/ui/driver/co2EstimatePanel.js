// Panneau d'estimation CO₂ et VroomPoints, recalculé à chaque saisie du formulaire de publication.
import { estimateTripCo2, co2AvoidedBySeatsFilled } from '../../core/co2.js';
import { pointsBySeatsFilled, MIN_DISTANCE_KM } from '../../core/vroomPoints.js';
import { el } from '../dom.js';
import { formatCo2, formatPoints } from '../format.js';

export function createCo2EstimatePanel() {
    const root = el('aside', { class: 'co2-panel', 'aria-live': 'polite' });

    function update({ distanceKm, vehicleType, seats }) {
        root.replaceChildren(el('h3', { text: 'Impact CO₂ et VroomPoints' }));
        const ready = Number.isFinite(distanceKm) && distanceKm > 0 && Number.isInteger(seats) && seats >= 1;
        if (!ready || !vehicleType) {
            root.append(el('p', { class: 'placeholder', text: 'Renseignez la distance et les places pour voir l’estimation.' }));
            return;
        }

        const tripCo2 = estimateTripCo2({ distanceKm, vehicleType });
        const rows = co2AvoidedBySeatsFilled({ distanceKm, vehicleType, seats });
        const points = pointsBySeatsFilled({ distanceKm, vehicleType, seats });
        const full = rows[rows.length - 1];
        const eligible = distanceKm >= MIN_DISTANCE_KM;

        root.append(
            el('p', {}, 'Émissions de votre véhicule : ', el('strong', { text: formatCo2(tripCo2) })),
            el('p', {}, `CO₂ évité si vos ${seats} place${seats > 1 ? 's sont occupées' : ' est occupée'} : `,
                el('strong', { text: formatCo2(full.co2AvoidedG) })),
            eligible
                ? el('p', {}, 'Voiture pleine : ', el('strong', { text: formatPoints(points[points.length - 1].driverPoints) }), ' pour vous.')
                : el('p', { class: 'notice', text: `Les trajets de moins de ${MIN_DISTANCE_KM} km ne rapportent pas de VroomPoints.` }),
            el('table', { class: 'co2-table' },
                el('thead', {}, el('tr', {},
                    el('th', { text: 'Passagers' }), el('th', { text: 'CO₂ évité' }),
                    el('th', { text: 'Vos points' }), el('th', { text: 'Par passager' }))),
                el('tbody', {}, ...rows.map((row, index) => el('tr', {},
                    el('td', { text: String(row.passengers) }),
                    el('td', { text: formatCo2(row.co2AvoidedG) }),
                    el('td', { text: String(points[index].driverPoints) }),
                    el('td', { text: String(points[index].passengerPoints) }))))
            ),
            el('p', { class: 'hint', text: 'Estimation : chaque passager évite un trajet seul en voiture à essence. '
                + '1 VroomPoint = 1 kg de CO₂ évité ; à moitié pleine, la voiture rapporte déjà 80 % des points. '
                + 'Les points sont acquis après confirmation du trajet par vous et vos passagers.' })
        );
    }

    return { root, update };
}
