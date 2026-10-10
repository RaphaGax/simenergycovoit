// Panneau d'estimation CO₂, recalculé à chaque saisie du formulaire de publication.
import { estimateTripCo2, co2AvoidedBySeatsFilled } from '../../core/co2.js';
import { creditsFromCo2 } from '../../core/carbonCredits.js';
import { el } from '../dom.js';
import { formatCo2, formatCredits } from '../format.js';

export function createCo2EstimatePanel() {
    const root = el('aside', { class: 'co2-panel', 'aria-live': 'polite' });

    function update({ distanceKm, vehicleType, seats }) {
        root.replaceChildren(el('h3', { text: 'Impact CO₂ estimé' }));
        const ready = Number.isFinite(distanceKm) && distanceKm > 0 && Number.isInteger(seats) && seats >= 1;
        if (!ready || !vehicleType) {
            root.append(el('p', { class: 'placeholder', text: 'Renseignez la distance et les places pour voir l’estimation.' }));
            return;
        }

        const tripCo2 = estimateTripCo2({ distanceKm, vehicleType });
        const rows = co2AvoidedBySeatsFilled({ distanceKm, vehicleType, seats });
        const full = rows[rows.length - 1];

        root.append(
            el('p', {}, 'Émissions de votre véhicule : ', el('strong', { text: formatCo2(tripCo2) })),
            el('p', {}, `CO₂ évité si vos ${seats} place${seats > 1 ? 's sont occupées' : ' est occupée'} : `,
                el('strong', { text: formatCo2(full.co2AvoidedG) }),
                ` (${formatCredits(creditsFromCo2(full.co2AvoidedG))} estimé)`),
            el('table', { class: 'co2-table' },
                el('thead', {}, el('tr', {},
                    el('th', { text: 'Passagers' }), el('th', { text: 'CO₂ évité' }), el('th', { text: 'Crédits estimés' }))),
                el('tbody', {}, ...rows.map(row => el('tr', {},
                    el('td', { text: String(row.passengers) }),
                    el('td', { text: formatCo2(row.co2AvoidedG) }),
                    el('td', { text: formatCredits(creditsFromCo2(row.co2AvoidedG)) }))))
            ),
            el('p', { class: 'hint', text: 'Estimation : chaque passager évite un trajet seul en voiture à essence. '
                + 'Les crédits ne sont validés qu’après vérification des trajets effectués.' })
        );
    }

    return { root, update };
}
