// Valeurs par défaut du simulateur de parc (reprises de reset() dans script.js).
export const DEFAULT_FLEET_INPUT = Object.freeze({
    totalCars: 100,
    percentages: Object.freeze({
        electric: 20.9,
        hybridPlug: 9.2,
        diesel: 14.1,
        petrol: 55.8,
        gas: 0,
        hydrogen: 0
    }),
    aiRequests: 10
});
