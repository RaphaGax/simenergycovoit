// Onglets de l'espace conducteur.
import { el } from '../dom.js';

const TABS = [
    { path: '/conducteur/publier', label: 'Publier un trajet' },
    { path: '/conducteur/credits', label: 'Mes crédits carbone' }
];

export function driverNav(currentPath) {
    return el('nav', { class: 'sub-nav', 'aria-label': 'Espace conducteur' }, ...TABS.map(tab => {
        const link = el('a', { href: `#${tab.path}`, text: tab.label });
        if (tab.path === currentPath) link.setAttribute('aria-current', 'page');
        return link;
    }));
}
