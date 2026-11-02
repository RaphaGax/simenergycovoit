// Consommation estimée d'un trajet, à titre pédagogique (aucun point n'en dépend).
// Valeurs par km reprises des commentaires de `vehicleData` (ancien script.js), voir emissionFactors.js.
// TODO: source — rattacher chaque valeur à une référence (SuisseEnergie / OFEN).
export const CONSUMPTION_PER_KM = Object.freeze({
    electric: Object.freeze([{ amount: 0.17, unit: 'kWh', label: 'd’électricité' }]),
    hybridPlug: Object.freeze([{ amount: 0.10, unit: 'kWh', label: 'd’électricité' }, { amount: 0.02, unit: 'L', label: 'd’essence' }]),
    diesel: Object.freeze([{ amount: 0.054, unit: 'L', label: 'de diesel' }]),
    petrol: Object.freeze([{ amount: 0.06, unit: 'L', label: 'd’essence' }]),
    gas: Object.freeze([{ amount: 0.045, unit: 'kg', label: 'de gaz naturel' }]),
    hydrogen: Object.freeze([{ amount: 0.01, unit: 'kg', label: 'd’hydrogène' }])
});

// [{ amount, unit, label }] pour la distance donnée.
export function estimateConsumption({ distanceKm, vehicleType }) {
    const perKm = CONSUMPTION_PER_KM[vehicleType];
    if (!perKm) throw new RangeError(`Motorisation inconnue : ${vehicleType}`);
    if (!(Number.isFinite(distanceKm) && distanceKm >= 0)) throw new RangeError('distanceKm doit être un nombre ≥ 0');
    return perKm.map(part => ({ ...part, amount: part.amount * distanceKm }));
}
