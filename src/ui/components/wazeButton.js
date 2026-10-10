// Bouton « Naviguer avec Waze » : un vrai lien vers https://waze.com/ul, ouvert dans un nouvel onglet.
// Sur mobile, le système ouvre l'application Waze si elle est installée (lien universel iOS,
// lien d'application Android) ; sinon, et sur ordinateur, waze.com affiche la destination.
// Un lien cliqué par l'utilisateur est la méthode la plus fiable : aucune redirection en JavaScript,
// que les navigateurs mobiles bloquent souvent.
import { buildWazeLink } from '../../core/navigation.js';
import { el } from '../dom.js';

const REPEAT_DELAY_MS = 3000;

// place : { label, coords } ; purpose : texte affiché sous le bouton (« Arrivée », « Point de rendez-vous »…).
export function createWazeButton(place, { purpose = 'Destination' } = {}) {
    const link = buildWazeLink(place);
    if (!link.ok) {
        return el('p', { class: 'waze-unavailable', role: 'status', text: `Navigation Waze indisponible : ${link.reason}` });
    }

    const anchor = el('a', {
        class: 'button-link waze-button',
        href: link.url,
        target: '_blank',
        rel: 'noopener noreferrer',
        'aria-label': `Naviguer avec Waze vers ${link.label || 'la destination'} (s’ouvre dans Waze ou un nouvel onglet)`,
        text: 'Naviguer avec Waze'
    });
    const status = el('span', { class: 'hint', 'aria-live': 'polite' });

    // Un double appui n'ouvre pas deux fois Waze.
    let lastOpen = 0;
    anchor.addEventListener('click', event => {
        const now = Date.now();
        if (now - lastOpen < REPEAT_DELAY_MS) {
            event.preventDefault();
            return;
        }
        lastOpen = now;
        status.textContent = 'Ouverture de Waze…';
        setTimeout(() => { status.textContent = ''; }, REPEAT_DELAY_MS);
    });

    return el('div', { class: 'waze-block' },
        anchor,
        el('span', { class: 'hint', text: `${purpose} : ${link.label}${link.precise ? '' : ' (recherche par adresse dans Waze)'}` }),
        status);
}
