// Collection d'objets { id, ... } stockée en JSON dans localStorage.
// storage est résolu à l'usage : l'accès à localStorage peut lever une erreur s'il est bloqué.
export function createLocalCollection(key, storage) {
    const getStorage = () => storage ?? globalThis.localStorage;

    function list() {
        try {
            const items = JSON.parse(getStorage().getItem(key) ?? '[]');
            return Array.isArray(items) ? items : [];
        } catch {
            return []; // stockage absent, bloqué ou corrompu
        }
    }

    function get(id) {
        return list().find(item => item.id === id) ?? null;
    }

    // Ajoute ou remplace l'objet de même id. Lève une erreur si le stockage est
    // indisponible : l'appelant doit la signaler.
    function save(item) {
        const items = [...list().filter(existing => existing.id !== item.id), item];
        getStorage().setItem(key, JSON.stringify(items));
        return item;
    }

    return { list, get, save };
}
