// Parcours Conducteur — publication de trajet. Formulaire et estimation CO₂ : étape 4.
import { el } from '../dom.js';

export function render(root) {
    root.append(
        el('section', { class: 'card' },
            el('h2', { text: 'Publier un trajet' }),
            el('p', { class: 'placeholder', text: 'Publication, estimation de l’impact CO₂ et suivi des crédits carbone : bientôt disponibles.' }),
            el('a', { href: '#/', text: '← Retour' })
        )
    );
}
