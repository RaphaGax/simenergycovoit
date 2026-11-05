// Accueil, d'après la maquette : logo, slogan et choix du parcours Passager ou Conducteur.
import { el } from './dom.js';
import { icon } from './components/icons.js';
import { loginPath } from './router.js';
import { installCard } from './install.js';

function choice({ href, className, iconName, title, text }) {
    return el('a', { class: `button-link choice-button ${className}`, href },
        el('span', { class: 'choice-icon' }, icon(iconName, { size: 24 })),
        el('span', {}, el('strong', { text: title }), el('span', { text })));
}

export function render(root, { user } = {}) {
    root.append(
        el('section', { class: 'home-hero' },
            el('img', { src: './src/ui/assets/logo.png', alt: '', width: '227', height: '215' }),
            el('p', { class: 'slogan', text: 'Ensemble, nous allons plus loin' }),
            el('p', { class: 'promise', text: '0 CHF pour les passagers, des VroomPoints pour tous les aventuriers.' })),
        el('section', { class: 'card home-sheet' },
            el('h2', { text: 'Que souhaitez-vous faire ?' }),
            el('div', { class: 'choice-list' },
                choice({
                    href: '#/passager/recherche', className: 'choice-passenger', iconName: 'search',
                    title: 'Je trouve mon EcoVroom', text: 'Trajets 100 % gratuits : 0 CHF.'
                }),
                choice({
                    href: '#/conducteur/publier', className: 'choice-driver', iconName: 'car',
                    title: 'Je partage mon trajet', text: 'Estimez le CO₂ évité, gagnez des VroomPoints.'
                })),
            el('p', { class: 'home-account' }, user
                ? el('a', { href: '#/compte', text: 'Mon compte' })
                : el('a', { href: `#${loginPath('/')}`, text: 'Je me connecte ou je crée mon compte' }))),
        installCard());
}
