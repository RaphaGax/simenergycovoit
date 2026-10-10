// Point d'entrée de l'application utilisateur EcoVroom (Passager / Conducteur).
import { startRouter } from './ui/router.js';
import { createTripRepository } from './services/tripRepository.js';
import * as homeView from './ui/homeView.js';
import * as searchView from './ui/passenger/searchView.js';
import * as publishTripView from './ui/driver/publishTripView.js';

const routes = [
    { path: '/', title: 'Accueil', view: homeView },
    { path: '/passager/recherche', title: 'Rechercher un trajet', view: searchView },
    { path: '/conducteur/publier', title: 'Publier un trajet', view: publishTripView }
];

startRouter({
    root: document.getElementById('app'),
    routes,
    context: { tripRepository: createTripRepository() },
    onNavigate: route => {
        document.title = `${route.title} — EcoVroom`;
        for (const link of document.querySelectorAll('[data-nav]')) {
            link.toggleAttribute('aria-current', link.getAttribute('href') === `#${route.path}`);
        }
    }
});
