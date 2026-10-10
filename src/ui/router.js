// Routeur par hash (#/passager/reserver/abc?seats=2). matchRoute est pur ; startRouter branche le navigateur.
export const DEFAULT_PATH = '/';

// Sépare le chemin et la chaîne de requête ; un hash vide ou invalide donne DEFAULT_PATH.
export function parseHash(hash) {
    const raw = String(hash ?? '').replace(/^#/, '');
    const [pathPart, queryPart = ''] = raw.split('?');
    const path = pathPart.replace(/\/+$/, '');
    return {
        path: path.startsWith('/') ? path : DEFAULT_PATH,
        query: Object.fromEntries(new URLSearchParams(queryPart))
    };
}

// Compare un chemin à un motif (« /passager/reserver/:tripId ») ; renvoie les paramètres ou null.
export function matchPath(pattern, path) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    if (patternParts.length !== pathParts.length) return null;
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            if (!pathParts[i]) return null;
            params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
        } else if (patternParts[i] !== pathParts[i]) {
            return null;
        }
    }
    return params;
}

// Renvoie { route, params, query } ; l'accueil si aucune route ne correspond.
export function matchRoute(hash, routes) {
    const { path, query } = parseHash(hash);
    for (const route of routes) {
        const params = matchPath(route.path, path);
        if (params) return { route, params, query };
    }
    return { route: routes.find(route => route.path === DEFAULT_PATH), params: {}, query };
}

export function navigate(path) {
    window.location.hash = `#${path}`;
}

// Chemin courant (avec sa requête), pour revenir après la connexion.
export const currentPath = () => window.location.hash.replace(/^#/, '') || DEFAULT_PATH;
export const loginPath = (returnTo = currentPath()) => `/connexion?retour=${encodeURIComponent(returnTo)}`;

// context (services partagés, utilisateur connecté) est transmis à chaque vue :
// await view.render(container, context, { params, query }).
// Une route { auth: true } redirige vers la connexion sans utilisateur connecté.
// Chaque affichage a son propre conteneur : une vue lente qui se termine après un changement
// de page écrit dans un conteneur détaché, sans effet visible.
export function startRouter({ root, routes, context = {}, onNavigate = () => {}, renderError }) {
    const render = async () => {
        const match = matchRoute(window.location.hash, routes);
        if (match.route.auth && !context.user) {
            navigate(loginPath());
            return;
        }
        const container = document.createElement('div');
        container.className = 'view';
        container.setAttribute('aria-busy', 'true');
        root.replaceChildren(container);
        onNavigate(match.route);
        window.scrollTo(0, 0);
        try {
            await match.route.view.render(container, context, { params: match.params, query: match.query });
        } catch (error) {
            if (error?.status === 401) {
                navigate(loginPath());
                return;
            }
            console.error('Erreur d’affichage :', error);
            container.replaceChildren(renderError(error));
        } finally {
            container.removeAttribute('aria-busy');
        }
    };
    window.addEventListener('hashchange', render);
    render();
}
