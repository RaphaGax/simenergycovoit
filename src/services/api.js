// Client de l'API EcoVroom (serveur Node, même origine). La session est un cookie HttpOnly :
// le JavaScript n'y a pas accès, le navigateur l'envoie automatiquement.
export class ApiError extends Error {
    constructor(message, { status, fields } = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.fields = fields ?? {};
    }
}

export function createApi({ fetch = globalThis.fetch.bind(globalThis), baseUrl = '' } = {}) {
    async function request(method, path, { body, query, signal } = {}) {
        const url = new URL(baseUrl + path, globalThis.location?.origin ?? 'http://localhost');
        for (const [name, value] of Object.entries(query ?? {})) {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, value);
        }
        let response;
        try {
            response = await fetch(url, {
                method,
                credentials: 'same-origin',
                signal,
                headers: {
                    Accept: 'application/json',
                    ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {})
                },
                body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined
            });
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            throw new ApiError('Serveur EcoVroom injoignable. Vérifiez votre connexion.', { status: 0 });
        }
        let data = null;
        try {
            data = await response.json();
        } catch {
            // réponse vide ou non JSON
        }
        if (!response.ok) {
            throw new ApiError(data?.error ?? `Erreur ${response.status}.`, { status: response.status, fields: data?.fields });
        }
        // Réponse « réussie » mais illisible (coupée, vide) : erreur claire plutôt qu'un null inattendu.
        if (data === null) throw new ApiError('Réponse du serveur illisible. Réessayez.', { status: response.status });
        return data;
    }

    const get = (path, query, options) => request('GET', path, { query, ...options });
    const post = (path, body, options) => request('POST', path, { body, ...options });
    const id = value => encodeURIComponent(value);

    return {
        config: () => get('/api/config'),
        auth: {
            me: async () => (await get('/api/auth/me')).user,
            register: async input => (await post('/api/auth/register', input)).user,
            login: async input => (await post('/api/auth/login', input)).user,
            logout: () => post('/api/auth/logout'),
            // Mot de passe oublié : la réponse est la même que l'adresse existe ou non.
            requestPasswordReset: async email => (await post('/api/auth/password-reset', { email })).message,
            confirmPasswordReset: async (token, password) => (await post('/api/auth/password-reset/confirm', { token, password })).user
        },
        account: {
            changePassword: (currentPassword, newPassword) => post('/api/me/password', { currentPassword, newPassword }),
            // { deleted, deletedTrips, cancelledBookings }
            delete: password => post('/api/me/delete', { password })
        },
        trips: {
            // [{ trip, seatsLeft, driverName }]
            search: async criteria => (await get('/api/trips', criteria)).results,
            get: tripId => get(`/api/trips/${id(tripId)}`),
            publish: async draft => (await post('/api/trips', draft)).trip,
            // [{ trip, bookings }] : trajets du conducteur connecté
            mine: async () => (await get('/api/me/trips')).trips,
            complete: tripId => post(`/api/trips/${id(tripId)}/complete`),
            itinerary: async tripId => (await post(`/api/trips/${id(tripId)}/itinerary`)).plan
        },
        bookings: {
            create: input => post('/api/bookings', input),
            get: bookingId => get(`/api/bookings/${id(bookingId)}`),
            cancel: bookingId => post(`/api/bookings/${id(bookingId)}/cancel`),
            // answer : 'confirmed' (« J'ai voyagé ») ou 'disputed' (« Le trajet n'a pas eu lieu »)
            proof: (bookingId, answer) => post(`/api/bookings/${id(bookingId)}/proof`, { answer }),
            // [{ booking, trip }]
            mine: async () => (await get('/api/me/bookings')).bookings
        },
        credits: {
            mine: async () => (await get('/api/me/credits')).entries,
            submit: async () => (await post('/api/me/credits/submit')).submitted
        },
        // Même interface que le client ORS direct : la clé reste sur le serveur.
        ors: {
            autocomplete: async (text, { signal } = {}) => (await get('/api/ors/autocomplete', { text }, { signal })).places,
            directions: (from, to, { signal } = {}) => post('/api/ors/directions', { from, to }, { signal }),
            matrix: (locations, { signal } = {}) => post('/api/ors/matrix', { locations }, { signal })
        }
    };
}
