// Service worker EcoVroom : rend l'application installable et ouvrable hors connexion.
// - Fichiers de l'application (même origine, hors /api) : réseau d'abord, copie en cache pour
//   le hors-ligne ; une nouvelle version déployée est donc prise immédiatement.
// - /api/* : jamais mis en cache (données personnelles, toujours à jour).
// - Autres origines (simulateur : Chart.js) : non interceptées.
const CACHE = 'ecovroom-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/src/ui/app.css', '/src/main.js', '/manifest.webmanifest',
    '/src/ui/assets/logo.png', '/src/ui/assets/icon-192.png'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    event.respondWith((async () => {
        try {
            const response = await fetch(request);
            if (response.ok) {
                const copy = response.clone();
                event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
            }
            return response;
        } catch (error) {
            const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
            if (cached) return cached;
            if (request.mode === 'navigate') {
                const shell = await caches.match('/index.html');
                if (shell) return shell;
            }
            throw error;
        }
    })());
});
