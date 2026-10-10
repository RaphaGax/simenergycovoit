// Appariement passager ↔ trajets par détour, à partir d'une matrice de distances/durées routières
// (ORS /v2/matrix). Pour chaque trajet candidat (départ O, arrivée E) et la demande (prise P, dépose D) :
//   détour = O→P + P→D + D→E − O→E
import { isValidCoords, haversineKm } from './geo.js';

export const MAX_DETOUR_MIN = 20;
export const MAX_CANDIDATES = 25; // limite la taille de la matrice (2 + 2 × 25 lieux)
// Présélection à vol d'oiseau : le détour routier est au moins égal au détour à vol d'oiseau.
const MAX_PRESELECT_DETOUR_KM = 30;

// Écart à vol d'oiseau, borne inférieure du détour routier.
export function straightLineDetourKm(trip, pickup, dropoff) {
    return haversineKm(trip.originCoords, pickup) + haversineKm(pickup, dropoff)
        + haversineKm(dropoff, trip.destinationCoords) - haversineKm(trip.originCoords, trip.destinationCoords);
}

// Garde les trajets géolocalisés plausibles, du plus petit détour estimé au plus grand.
export function preselectCandidates(results, { pickup, dropoff }) {
    return results
        .filter(({ trip }) => isValidCoords(trip.originCoords) && isValidCoords(trip.destinationCoords))
        .map(result => ({ ...result, estimate: straightLineDetourKm(result.trip, pickup, dropoff) }))
        .filter(result => result.estimate <= MAX_PRESELECT_DETOUR_KM)
        .sort((a, b) => a.estimate - b.estimate)
        .slice(0, MAX_CANDIDATES)
        .map(({ estimate, ...result }) => result);
}

// Lieux de la matrice : [P, D, O1, E1, O2, E2, …].
export function matrixLocations({ pickup, dropoff }, candidates) {
    return [pickup, dropoff, ...candidates.flatMap(({ trip }) => [trip.originCoords, trip.destinationCoords])];
}

// matrix : { durations: secondes, distances: km } indexées comme matrixLocations.
// Renvoie les candidats enrichis de detourMin, detourKm et passengerDistanceKm,
// sans ceux dont le détour dépasse maxDetourMin, triés par détour croissant.
export function rankByDetour(candidates, matrix, { maxDetourMin = MAX_DETOUR_MIN } = {}) {
    const { durations, distances } = matrix;
    const P = 0, D = 1;
    // ORS renvoie null pour un lieu injoignable : le détour devient alors NaN (et non 0).
    const detour = (table, O, E) => {
        const cells = [table[O]?.[P], table[P]?.[D], table[D]?.[E], table[O]?.[E]];
        if (!cells.every(Number.isFinite)) return NaN;
        return cells[0] + cells[1] + cells[2] - cells[3];
    };

    return candidates
        .map((candidate, index) => {
            const O = 2 + 2 * index, E = O + 1;
            const clamp = value => (Number.isNaN(value) ? NaN : Math.max(0, value));
            return {
                ...candidate,
                detourMin: clamp(detour(durations, O, E) / 60),
                detourKm: clamp(detour(distances, O, E)),
                passengerDistanceKm: distances[P][D]
            };
        })
        .filter(c => [c.detourMin, c.detourKm, c.passengerDistanceKm].every(Number.isFinite))
        .filter(candidate => candidate.detourMin <= maxDetourMin)
        .sort((a, b) => a.detourMin - b.detourMin || a.trip.departureAt.localeCompare(b.trip.departureAt));
}
