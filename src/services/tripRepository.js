// Stockage des trajets publiés. Implémentation localStorage pour l'instant ;
// une API pourra la remplacer en gardant la même interface (list, save).
const STORAGE_KEY = 'ecovroom.trips';

// storage est résolu à l'usage : l'accès à localStorage peut lever une erreur s'il est bloqué.
export function createTripRepository(storage) {
    const getStorage = () => storage ?? globalThis.localStorage;

    function list() {
        try {
            const trips = JSON.parse(getStorage().getItem(STORAGE_KEY) ?? '[]');
            return Array.isArray(trips) ? trips : [];
        } catch {
            return []; // stockage absent, bloqué ou corrompu
        }
    }

    // Lève une erreur si le stockage est indisponible : l'appelant doit la signaler.
    function save(trip) {
        const trips = [...list().filter(t => t.id !== trip.id), trip];
        getStorage().setItem(STORAGE_KEY, JSON.stringify(trips));
        return trip;
    }

    return { list, save };
}
