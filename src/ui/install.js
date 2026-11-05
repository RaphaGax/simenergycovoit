// Application installable : enregistre le service worker (sw.js) et propose l'installation.
// - Chrome (Android, ordinateur), Edge, Samsung Internet : bouton qui ouvre la fenêtre d'installation
//   du navigateur (événement beforeinstallprompt).
// - iPhone, iPad, Safari sur Mac : pas d'installation automatique, on explique le geste à faire.
// Rien n'est affiché quand l'application est déjà ouverte depuis l'écran d'accueil.
import { el } from './dom.js';

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach(listener => listener());

export function initInstall() {
    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Service worker non enregistré :', error));
    }
    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault(); // le bouton de l'accueil ouvrira la fenêtre au bon moment
        deferredPrompt = event;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        notify();
    });
}

export const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iPhone, iPad (iPadOS se présente comme un Mac tactile) et Safari sur Mac.
function appleDevice() {
    const ua = navigator.userAgent;
    const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const macSafari = /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua) && !iOS;
    return iOS ? 'ios' : macSafari ? 'mac-safari' : null;
}

const APPLE_STEPS = {
    ios: 'Sur iPhone ou iPad, dans Safari : touchez le bouton Partager (carré avec une flèche), puis « Sur l’écran d’accueil ».',
    'mac-safari': 'Dans Safari sur Mac : menu Fichier, puis « Ajouter au Dock ».'
};

// Carte « Installer EcoVroom », mise à jour quand le navigateur autorise l'installation.
export function installCard() {
    const card = el('section', { class: 'card install-card', hidden: '' });
    let shown = false;
    function render() {
        // Carte d'une page quittée : on cesse de la mettre à jour.
        if (shown && !card.isConnected) {
            listeners.delete(render);
            return;
        }
        shown = true;
        card.replaceChildren();
        if (isStandalone()) {
            card.hidden = true;
            return;
        }
        const apple = appleDevice();
        if (!deferredPrompt && !apple) {
            card.hidden = true;
            return;
        }
        card.hidden = false;
        card.append(
            el('h2', { text: 'Installer EcoVroom' }),
            el('p', { class: 'hint', text: 'Ajoutez EcoVroom à votre écran d’accueil : il s’ouvre en plein écran, comme une application.' }));
        if (deferredPrompt) {
            const button = el('button', { type: 'button', text: 'Installer l’application' });
            button.addEventListener('click', async () => {
                const prompt = deferredPrompt;
                deferredPrompt = null;
                await prompt.prompt();
                await prompt.userChoice.catch(() => null);
                notify();
            });
            card.append(button);
        } else {
            card.append(el('p', { text: APPLE_STEPS[apple] }));
        }
    }
    listeners.add(render);
    render();
    return card;
}
