// Client de l'API EcoVroom light, avec repli sur le calcul local si le serveur est absent
// (ex. : page servie statiquement).

export class ApiError extends Error {
    /** status = 0 signifie que le serveur est injoignable. */
    constructor(status, message, details = []) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
    }

    get isNetworkError() {
        return this.status === 0;
    }
}

export function createApiClient({ fetchImpl = globalThis.fetch?.bind(globalThis), baseUrl = '' } = {}) {
    async function request(method, path, body) {
        let response;
        try {
            response = await fetchImpl(`${baseUrl}${path}`, {
                method,
                headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body)
            });
        } catch (error) {
            throw new ApiError(0, `Serveur injoignable : ${error.message}`);
        }
        if (response.status === 204) return null;

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            // Réponse non JSON : typiquement un serveur statique sans API.
            throw new ApiError(response.ok ? 0 : response.status, 'Réponse inattendue du serveur.');
        }
        if (!response.ok) {
            throw new ApiError(response.status, payload?.error || `Erreur HTTP ${response.status}`, payload?.details || []);
        }
        return payload;
    }

    return {
        health: () => request('GET', '/api/health'),
        simulate: input => request('POST', '/api/simulate', input),
        listScenarios: () => request('GET', '/api/scenarios').then(data => data.scenarios),
        getScenario: id => request('GET', `/api/scenarios/${encodeURIComponent(id)}`),
        saveScenario: (name, input) => request('POST', '/api/scenarios', { name, input }),
        deleteScenario: id => request('DELETE', `/api/scenarios/${encodeURIComponent(id)}`)
    };
}

/**
 * Exécute une simulation via le serveur, ou localement s'il est injoignable
 * (ou s'il ne répond pas comme l'API attendue, ex. 404 d'un hébergement statique).
 * Les erreurs de validation (400) sont propagées.
 */
export async function simulateWithFallback(api, localSimulate, input) {
    try {
        return { result: await api.simulate(input), source: 'server' };
    } catch (error) {
        if (error instanceof ApiError && (error.isNetworkError || error.status === 404 || error.status === 405)) {
            return { result: localSimulate(input), source: 'local' };
        }
        throw error;
    }
}
