// Transforme la solution VROOM d'un trajet en liste d'arrêts lisible.
// Les heures d'arrivée VROOM sont en secondes Unix, car la fenêtre du véhicule l'est aussi.
const STOP_TYPES = new Set(['start', 'pickup', 'delivery', 'end']);

const toIso = seconds => new Date(seconds * 1000).toISOString();

// Renvoie { stops, durationMin, distanceKm, unassignedBookingIds }.
// distanceKm vaut null si le service ne renvoie pas les distances.
export function parseTripSolution(solution, shipmentBookingIds) {
    if (!solution || solution.code !== 0) {
        throw new Error(`Optimisation impossible (code ${solution?.code ?? 'inconnu'}) : ${solution?.error ?? 'réponse invalide'}`);
    }
    const bookingIdOf = shipmentId => shipmentBookingIds[shipmentId - 1];
    const route = solution.routes?.[0];

    const stops = (route?.steps ?? [])
        .filter(step => STOP_TYPES.has(step.type))
        .map(step => ({
            type: step.type,
            bookingId: step.type === 'pickup' || step.type === 'delivery' ? bookingIdOf(step.id) : null,
            location: step.location,
            arrivalAt: toIso(step.arrival),
            distanceKm: Number.isFinite(step.distance) ? step.distance / 1000 : null
        }));

    return {
        stops,
        durationMin: route ? route.duration / 60 : 0,
        distanceKm: Number.isFinite(route?.distance) ? route.distance / 1000 : null,
        unassignedBookingIds: [...new Set((solution.unassigned ?? []).map(task => bookingIdOf(task.id)))]
    };
}
