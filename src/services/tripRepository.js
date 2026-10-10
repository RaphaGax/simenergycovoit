// Stockage des trajets publiés. Implémentation localStorage pour l'instant ;
// une API pourra la remplacer en gardant la même interface (list, get, save).
import { createLocalCollection } from './localCollection.js';

export function createTripRepository(storage) {
    return createLocalCollection('ecovroom.trips', storage);
}
