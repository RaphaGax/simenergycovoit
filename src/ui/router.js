// Routeur par hash (#/passager/recherche…). matchRoute est pur ; startRouter branche le navigateur.
export const DEFAULT_PATH = '/';

export function normalizePath(hash) {
    const path = String(hash ?? '').replace(/^#/, '').replace(/\/+$/, '');
    return path.startsWith('/') ? path : DEFAULT_PATH;
}

// Renvoie la route correspondant au hash, ou celle de DEFAULT_PATH si aucune ne correspond.
export function matchRoute(hash, routes) {
    const path = normalizePath(hash);
    return routes.find(route => route.path === path)
        ?? routes.find(route => route.path === DEFAULT_PATH);
}

// context (services partagés) est transmis à chaque vue : view.render(root, context).
export function startRouter({ root, routes, context = {}, onNavigate = () => {} }) {
    const render = () => {
        const route = matchRoute(window.location.hash, routes);
        root.replaceChildren();
        route.view.render(root, context);
        onNavigate(route);
    };
    window.addEventListener('hashchange', render);
    render();
}
