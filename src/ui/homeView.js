// Accueil : choix du parcours Passager ou Conducteur.
import { el } from './dom.js';

export function render(root) {
    root.append(
        el('section', { class: 'card choice-card' },
            el('h2', { text: 'Je cherche un trajet' }),
            el('p', { text: 'Trajets 100 % gratuits pour les passagers : 0 CHF.' }),
            el('a', { class: 'button-link', href: '#/passager/recherche', text: 'Rechercher un trajet' })
        ),
        el('section', { class: 'card choice-card' },
            el('h2', { text: 'Je propose un trajet' }),
            el('p', { text: 'Publiez votre trajet, estimez le CO₂ évité et suivez vos crédits carbone.' }),
            el('a', { class: 'button-link', href: '#/conducteur/publier', text: 'Publier un trajet' })
        )
    );
}
