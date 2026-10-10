// Parcours Passager — recherche de trajet. Formulaire et résultats : étape 5.
import { el } from '../dom.js';

export function render(root) {
    root.append(
        el('section', { class: 'card' },
            el('h2', { text: 'Rechercher un trajet' }),
            el('p', { class: 'placeholder', text: 'Recherche, réservation gratuite (0 CHF) et confirmation : bientôt disponibles.' }),
            el('a', { href: '#/', text: '← Retour' })
        )
    );
}
