// Calculs CO₂ des trajets de covoiturage. Fonctions pures, résultats en grammes.
import { VEHICLE_PROFILES } from './emissionFactors.js';

// Hypothèse de référence : sans covoiturage, chaque passager aurait fait le trajet seul
// dans une voiture à essence. TODO: à valider avec la méthodologie de certification des crédits
// (le scénario de référence pourrait aussi être les transports publics).
export const BASELINE_VEHICLE_TYPE = 'petrol';

function factorFor(vehicleType) {
    const profile = VEHICLE_PROFILES[vehicleType];
    if (!profile) throw new RangeError(`Motorisation inconnue : ${vehicleType}`);
    return profile.co2; // g/km
}

function assertDistance(distanceKm) {
    if (!(Number.isFinite(distanceKm) && distanceKm >= 0)) {
        throw new RangeError('distanceKm doit être un nombre ≥ 0');
    }
}

// Émissions du véhicule sur le trajet.
export function estimateTripCo2({ distanceKm, vehicleType }) {
    assertDistance(distanceKm);
    return distanceKm * factorFor(vehicleType);
}

// Part des émissions par occupant (0 si personne à bord).
export function perOccupant(totalCo2, occupants) {
    return occupants > 0 ? totalCo2 / occupants : 0;
}

// CO₂ évité grâce aux passagers transportés : chaque passager évite un trajet solo de référence,
// moins les émissions du détour éventuel du conducteur. Jamais négatif.
export function co2AvoidedForTrip({ distanceKm, vehicleType, passengers, detourKm = 0, baselineVehicleType = BASELINE_VEHICLE_TYPE }) {
    assertDistance(distanceKm);
    assertDistance(detourKm);
    if (!(Number.isInteger(passengers) && passengers >= 0)) {
        throw new RangeError('passengers doit être un entier ≥ 0');
    }
    const avoided = passengers * distanceKm * factorFor(baselineVehicleType);
    const detour = detourKm * factorFor(vehicleType);
    return Math.max(0, avoided - detour);
}

// CO₂ évité par une réservation : sur la distance réelle du passager quand elle est connue
// (recherche par itinéraire), sinon sur toute la distance du trajet ; le détour est déduit.
export function co2AvoidedForBooking(trip, { seats, passengerDistanceKm, detourKm = 0 }) {
    return co2AvoidedForTrip({
        distanceKm: passengerDistanceKm ?? trip.distanceKm,
        vehicleType: trip.vehicleType,
        passengers: seats,
        detourKm
    });
}

// Estimation pour chaque nombre de passagers possible, de 1 à seats.
export function co2AvoidedBySeatsFilled({ distanceKm, vehicleType, seats, detourKm = 0 }) {
    return Array.from({ length: seats }, (_, index) => {
        const passengers = index + 1;
        return { passengers, co2AvoidedG: co2AvoidedForTrip({ distanceKm, vehicleType, passengers, detourKm }) };
    });
}
