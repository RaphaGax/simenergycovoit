// Point d'entrée de l'application utilisateur EcoVroom (Passager / Conducteur).
import { startRouter } from './ui/router.js';
import { createTripRepository } from './services/tripRepository.js';
import { createBookingRepository } from './services/bookingRepository.js';
import { loadConfig } from './services/config.js';
import { createOrsClient } from './services/orsClient.js';
import * as homeView from './ui/homeView.js';
import * as searchView from './ui/passenger/searchView.js';
import * as bookingView from './ui/passenger/bookingView.js';
import * as confirmationView from './ui/passenger/confirmationView.js';
import * as publishTripView from './ui/driver/publishTripView.js';

const routes = [
    { path: '/', title: 'Accueil', view: homeView },
    { path: '/passager/recherche', section: 'passager', title: 'Rechercher un trajet', view: searchView },
    { path: '/passager/reserver/:tripId', section: 'passager', title: 'Réserver', view: bookingView },
    { path: '/passager/reservation/:bookingId', section: 'passager', title: 'Ma réservation', view: confirmationView },
    { path: '/conducteur/publier', section: 'conducteur', title: 'Publier un trajet', view: publishTripView }
];

// Sans clé openrouteservice, ors vaut null : l'application fonctionne sans géocodage ni itinéraires.
const config = await loadConfig();
const ors = config.orsApiKey ? createOrsClient({ apiKey: config.orsApiKey }) : null;

startRouter({
    root: document.getElementById('app'),
    routes,
    context: {
        tripRepository: createTripRepository(),
        bookingRepository: createBookingRepository(),
        ors
    },
    onNavigate: route => {
        document.title = `${route.title} — EcoVroom`;
        for (const link of document.querySelectorAll('[data-nav]')) {
            link.toggleAttribute('aria-current', link.dataset.nav === route.section);
        }
    }
});
