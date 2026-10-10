// Point d'entrée de l'application utilisateur EcoVroom (Passager / Conducteur).
// Les données sont partagées sur le serveur (API /api) ; la session est un cookie HttpOnly.
import { startRouter, loginPath } from './ui/router.js';
import { createApi } from './services/api.js';
import { el } from './ui/dom.js';
import * as homeView from './ui/homeView.js';
import * as loginView from './ui/loginView.js';
import * as searchView from './ui/passenger/searchView.js';
import * as bookingView from './ui/passenger/bookingView.js';
import * as confirmationView from './ui/passenger/confirmationView.js';
import * as publishTripView from './ui/driver/publishTripView.js';
import * as creditsView from './ui/driver/creditsView.js';

const routes = [
    { path: '/', title: 'Accueil', view: homeView },
    { path: '/connexion', title: 'Connexion', view: loginView },
    { path: '/passager/recherche', section: 'passager', title: 'Rechercher un trajet', view: searchView },
    { path: '/passager/reserver/:tripId', section: 'passager', title: 'Réserver', view: bookingView },
    { path: '/passager/reservation/:bookingId', section: 'passager', title: 'Ma réservation', view: confirmationView, auth: true },
    { path: '/conducteur/publier', section: 'conducteur', title: 'Publier un trajet', view: publishTripView, auth: true },
    { path: '/conducteur/credits', section: 'conducteur', title: 'Mes crédits carbone', view: creditsView, auth: true }
];

function renderAccount(container, { api, user }) {
    if (!user) {
        container.replaceChildren(el('a', { class: 'account-link', href: `#${loginPath()}`, text: 'Connexion' }));
        container.querySelector('a').addEventListener('click', event => {
            event.currentTarget.href = `#${loginPath()}`; // retour sur la page affichée au moment du clic
        });
        return;
    }
    const logout = el('button', { type: 'button', class: 'link-button', text: 'Déconnexion' });
    logout.addEventListener('click', async () => {
        logout.disabled = true;
        try {
            await api.auth.logout();
        } finally {
            window.location.hash = '#/';
            window.location.reload();
        }
    });
    container.replaceChildren(el('span', { text: `Bonjour ${user.name}` }), logout);
}

function renderError(error) {
    return el('section', { class: 'card' },
        el('h2', { text: 'Une erreur est survenue' }),
        el('p', { class: 'error-message', text: error?.message ?? 'Erreur inconnue.' }),
        el('a', { href: '#/', text: '← Accueil' }));
}

const api = createApi();
const app = document.getElementById('app');
let user = null;
let config = { orsEnabled: false };
try {
    [user, config] = await Promise.all([api.auth.me(), api.config()]);
} catch (error) {
    app.replaceChildren(renderError(error));
    throw error;
}

renderAccount(document.getElementById('account'), { api, user });

startRouter({
    root: app,
    routes,
    // Itinéraires (ORS via le serveur) réservés aux utilisateurs connectés : ors vaut null sinon.
    context: { api, user, ors: user && config.orsEnabled ? api.ors : null },
    renderError,
    onNavigate: route => {
        document.title = `${route.title} — EcoVroom`;
        for (const link of document.querySelectorAll('[data-nav]')) {
            link.toggleAttribute('aria-current', link.dataset.nav === route.section);
        }
    }
});
