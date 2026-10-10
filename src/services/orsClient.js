// Client openrouteservice : géocodage, itinéraire, matrice et optimisation (VROOM).
// Documentation : https://openrouteservice.org/dev/#/api-docs
export const ORS_BASE_URL = 'https://api.openrouteservice.org';
const DEFAULT_TIMEOUT_MS = 10000;

export class OrsError extends Error {
    constructor(message, { status = null, cause } = {}) {
        super(message, { cause });
        this.name = 'OrsError';
        this.status = status;
    }
}

function describeStatus(status) {
    if (status === 401 || status === 403) return 'Clé openrouteservice refusée.';
    if (status === 429) return 'Quota openrouteservice dépassé, réessayez plus tard.';
    if (status >= 500) return 'Service openrouteservice indisponible.';
    return `Requête openrouteservice refusée (${status}).`;
}

export function createOrsClient({ apiKey, baseUrl = ORS_BASE_URL, fetch = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    if (!apiKey) throw new OrsError('Clé openrouteservice manquante.');

    async function request(path, { method = 'GET', query, body, signal } = {}) {
        const url = new URL(path, baseUrl);
        for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);

        const timeout = AbortSignal.timeout(timeoutMs);
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
        let response;
        try {
            response = await fetch(url, {
                method,
                signal: combined,
                headers: {
                    Authorization: apiKey,
                    Accept: 'application/json, application/geo+json',
                    ...(body ? { 'Content-Type': 'application/json' } : {})
                },
                body: body ? JSON.stringify(body) : undefined
            });
        } catch (error) {
            if (signal?.aborted) throw error; // annulation voulue par l'appelant
            throw new OrsError(timeout.aborted ? 'openrouteservice ne répond pas.' : 'Connexion à openrouteservice impossible.', { cause: error });
        }
        if (!response.ok) throw new OrsError(describeStatus(response.status), { status: response.status });
        try {
            return await response.json();
        } catch (error) {
            throw new OrsError('Réponse openrouteservice illisible.', { cause: error });
        }
    }

    // Suggestions de lieux en Suisse : [{ label, coords: [lon, lat] }].
    async function autocomplete(text, { signal } = {}) {
        const data = await request('/geocode/autocomplete', {
            query: { text, 'boundary.country': 'CH', size: '6' },
            signal
        });
        return (data.features ?? [])
            .filter(feature => feature.geometry?.type === 'Point')
            .map(feature => ({ label: feature.properties.label, coords: feature.geometry.coordinates }));
    }

    // Itinéraire routier entre deux points : { distanceKm, durationMin }.
    async function directions(from, to, { signal } = {}) {
        const data = await request('/v2/directions/driving-car', {
            method: 'POST',
            body: { coordinates: [from, to] },
            signal
        });
        const summary = data.routes?.[0]?.summary;
        if (!summary) throw new OrsError('Aucun itinéraire trouvé entre ces deux lieux.');
        return { distanceKm: summary.distance / 1000, durationMin: summary.duration / 60 };
    }

    // Matrice routière : { durations (s), distances (km) } entre tous les lieux.
    async function matrix(locations, { signal } = {}) {
        const data = await request('/v2/matrix/driving-car', {
            method: 'POST',
            body: { locations, metrics: ['distance', 'duration'], units: 'km' },
            signal
        });
        if (!Array.isArray(data.durations) || !Array.isArray(data.distances)) {
            throw new OrsError('Matrice openrouteservice incomplète.');
        }
        return { durations: data.durations, distances: data.distances };
    }

    // Optimisation VROOM : renvoie la solution brute (voir core/vroom/parseTripSolution.js).
    function optimize(problem, { signal } = {}) {
        return request('/optimization', { method: 'POST', body: problem, signal });
    }

    return { autocomplete, directions, matrix, optimize };
}
