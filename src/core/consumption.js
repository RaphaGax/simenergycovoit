// Consommation estimée d'un trajet, à titre pédagogique (aucun point n'en dépend).
//
// Source officielle : Office fédéral de l'énergie (OFEN/BFE ; SuisseEnergie est un programme de l'OFEN),
// « Energieverbrauch und Energieeffizienz der neuen Personenwagen und leichten Nutzfahrzeuge 2025 »,
// 30e rapport selon l'ordonnance sur l'efficacité énergétique, 23 juin 2026, tableau 1
// « Mittlere Kennzahlen pro Treibstoffart, für alle PW-Neufahrzeuge » : consommation normalisée (WLTP)
// moyenne des voitures de tourisme neuves immatriculées en Suisse en 2025.
// Gaz naturel : aucune immatriculation en 2025, valeur du rapport 2024 (26 juin 2025, tableau 3).
// Ce sont des valeurs normalisées de voitures neuves : la consommation réelle est en général plus élevée.
export const CONSUMPTION_SOURCE = 'OFEN, voitures neuves 2025 (valeurs normalisées WLTP)';

const per100 = value => value / 100;

export const CONSUMPTION_PER_KM = Object.freeze({
    petrol: Object.freeze([{ amount: per100(6.30), unit: 'L', label: 'd’essence' }]), // Benzin (inkl. Hybrid)
    diesel: Object.freeze([{ amount: per100(6.41), unit: 'L', label: 'de diesel' }]), // Diesel (inkl. Hybrid)
    electric: Object.freeze([{ amount: per100(17.12), unit: 'kWh', label: 'd’électricité' }]), // Elektrisch
    hybridPlug: Object.freeze([ // Benzin-PHEV / Range Extender : les deux consommations s'additionnent
        { amount: per100(20.28), unit: 'kWh', label: 'd’électricité' },
        { amount: per100(1.25), unit: 'L', label: 'd’essence' }]),
    gas: Object.freeze([{ amount: per100(5.48), unit: 'm³', label: 'de gaz naturel' }]), // CNG, rapport 2024
    hydrogen: Object.freeze([{ amount: per100(0.84), unit: 'kg', label: 'd’hydrogène' }]) // Wasserstoff H2
});

// [{ amount, unit, label }] pour la distance donnée.
export function estimateConsumption({ distanceKm, vehicleType }) {
    const perKm = CONSUMPTION_PER_KM[vehicleType];
    if (!perKm) throw new RangeError(`Motorisation inconnue : ${vehicleType}`);
    if (!(Number.isFinite(distanceKm) && distanceKm >= 0)) throw new RangeError('distanceKm doit être un nombre ≥ 0');
    return perKm.map(part => ({ ...part, amount: part.amount * distanceKm }));
}
