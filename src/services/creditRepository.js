// Stockage des entrées de crédits carbone (même interface que tripRepository).
import { createLocalCollection } from './localCollection.js';

export function createCreditRepository(storage) {
    return createLocalCollection('ecovroom.credits', storage);
}
