// Application HTTP EcoVroom : API JSON sous /api et fichiers statiques de l'application.
// Les règles métier viennent de src/core (mêmes fonctions pures que le client) : le serveur
// les applique sur les données partagées et reste seul juge (prix 0 CHF, places, droits).
import { randomUUID, randomBytes } from 'node:crypto';
import { validateTrip, createTrip } from '../src/core/trips.js';
import { searchTrips, validateSearch } from '../src/core/search.js';
import {
    bookingRefusal, createBooking, cancelBooking, canCancel, hasDeparted, seatsBooked, BOOKING_STATUS
} from '../src/core/booking.js';
import { completeTrip, refreshCreditEntry, isSubmittable } from '../src/core/tripCompletion.js';
import { recordPassengerProof, summarizeProof } from '../src/core/tripProof.js';
import { submitForValidation } from '../src/core/carbonCredits.js';
import { isValidCoords } from '../src/core/geo.js';
import { buildTripProblem } from '../src/core/vroom/buildTripProblem.js';
import { parseTripSolution } from '../src/core/vroom/parseTripSolution.js';
import { MAX_CANDIDATES } from '../src/core/matching.js';
import {
    createAuth, createRateLimiter, passwordProblem, normalizeEmail, SESSION_COOKIE, SESSION_DAYS, RESET_TOKEN_MINUTES
} from './auth.js';
import {
    HttpError, readJson, sendJson, parseCookies, serializeCookie, createRouter, createStaticHandler, clientIp
} from './http.js';

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net", // Chart.js du simulateur de parc
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        'font-src https://fonts.gstatic.com',
        "connect-src 'self'",
        "img-src 'self' data:",
        "frame-ancestors 'none'"
    ].join('; ')
};

const MAX_MATRIX_LOCATIONS = 2 + 2 * MAX_CANDIDATES;

function bookingReference() {
    return `EV-${randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
}

function requireCoords(value, name) {
    if (!isValidCoords(value)) throw new HttpError(400, `Coordonnées invalides : ${name}.`);
    return value;
}

// Seules les erreurs métier du core (RangeError) remontent telles quelles à l'utilisateur.
function businessError(error, status = 400) {
    if (error instanceof RangeError) return new HttpError(status, error.message);
    return error;
}

export const DEFAULT_LIMITS = Object.freeze({
    authPerIp: 30, // inscriptions et connexions par adresse IP, sur 15 minutes
    loginPerEmail: 10, // tentatives de connexion par compte, sur 15 minutes
    orsPerUser: 120 // appels d'itinéraire par utilisateur, par minute
});

export function createApp({
    db, ors = null, staticDir, secureCookies = false, trustProxyHops = 0, debugClientIp = false,
    mailer = null, publicUrl = null,
    now = () => new Date(), limits = {}
}) {
    const { authPerIp, loginPerEmail, orsPerUser } = { ...DEFAULT_LIMITS, ...limits };
    const auth = createAuth(db, { now });
    const serveStatic = createStaticHandler(staticDir);
    const loginByIp = createRateLimiter({ limit: authPerIp, windowMs: 15 * 60000 });
    const loginByEmail = createRateLimiter({ limit: loginPerEmail, windowMs: 15 * 60000 });
    const orsByUser = createRateLimiter({ limit: orsPerUser, windowMs: 60000 });
    const resetByEmail = createRateLimiter({ limit: 3, windowMs: 60 * 60000 }); // 3 liens par heure et par adresse
    const passwordResetEnabled = Boolean(mailer && publicUrl);

    const sessionCookie = (token, maxAge) => serializeCookie(SESSION_COOKIE, token, { maxAge, secure: secureCookies });

    // Actions sensibles : mot de passe actuel exigé, tentatives limitées par compte.
    async function requirePassword(user, password) {
        if (!loginByEmail.take(user.email)) throw new HttpError(429, 'Trop de tentatives, réessayez dans quelques minutes.');
        if (!(await auth.checkPassword(user.id, password))) {
            throw new HttpError(403, 'Mot de passe incorrect.', { fields: { password: 'Mot de passe incorrect.' } });
        }
        loginByEmail.reset(user.email);
    }

    function requireUser(ctx) {
        if (!ctx.user) throw new HttpError(401, 'Connectez-vous pour continuer.');
        return ctx.user;
    }

    // Trajets publics avec places restantes et prénom du conducteur (jamais son e-mail).
    function withAvailability(trips) {
        const seats = db.bookings.seatsBookedByTrip(trips.map(t => t.id));
        const names = db.users.names([...new Set(trips.map(t => t.driverId))]);
        return trips.map(trip => ({
            trip,
            seatsLeft: Math.max(0, trip.seats - (seats.get(trip.id) ?? 0)),
            driverName: names.get(trip.driverId) ?? ''
        }));
    }

    // État des réponses des passagers du trajet d'une entrée de crédits.
    function proofOf(entry) {
        const trip = db.trips.get(entry.tripId);
        return summarizeProof(trip, db.bookings.byTrip(trip.id), now());
    }

    function ownTrip(ctx, tripId) {
        const user = requireUser(ctx);
        const trip = db.trips.get(tripId);
        if (!trip || trip.driverId !== user.id) throw new HttpError(404, 'Trajet introuvable.');
        return trip;
    }

    function requireOrs(ctx) {
        const user = requireUser(ctx);
        if (!ors) throw new HttpError(503, 'Les itinéraires ne sont pas configurés sur ce serveur.');
        if (!orsByUser.take(user.id)) throw new HttpError(429, 'Trop de requêtes d’itinéraire, réessayez dans une minute.');
        return ors;
    }

    async function callOrs(fn) {
        try {
            return await fn();
        } catch (error) {
            if (error.name === 'OrsError') throw new HttpError(502, error.message);
            throw error;
        }
    }

    const routes = [
        ['GET', '/api/config', () => ({ orsEnabled: Boolean(ors), passwordResetEnabled })],

        // Authentification
        ['POST', '/api/auth/register', async ctx => {
            const body = await readJson(ctx.req);
            if (!loginByIp.take(ctx.ip)) throw new HttpError(429, 'Trop de tentatives, réessayez plus tard.');
            const { user, errors } = await auth.register(body);
            if (errors) throw new HttpError(400, 'Inscription impossible.', { fields: errors });
            const { token } = auth.startSession(user.id);
            ctx.setCookie(sessionCookie(token, SESSION_DAYS * 86400));
            return { status: 201, body: { user } };
        }],
        ['POST', '/api/auth/login', async ctx => {
            const body = await readJson(ctx.req);
            const email = String(body.email ?? '').trim().toLowerCase();
            if (!loginByIp.take(ctx.ip) || !loginByEmail.take(email)) {
                throw new HttpError(429, 'Trop de tentatives, réessayez dans quelques minutes.');
            }
            const user = await auth.authenticate(email, body.password);
            if (!user) throw new HttpError(401, 'E-mail ou mot de passe incorrect.');
            loginByEmail.reset(email);
            const { token } = auth.startSession(user.id);
            ctx.setCookie(sessionCookie(token, SESSION_DAYS * 86400));
            return { user };
        }],
        ['POST', '/api/auth/logout', ctx => {
            auth.endSession(ctx.token);
            ctx.setCookie(sessionCookie('', 0));
            return { ok: true };
        }],
        ['GET', '/api/auth/me', ctx => ({ user: ctx.user ?? null })],

        // Mot de passe oublié : même réponse que l'adresse existe ou non (rien n'est révélé),
        // e-mail envoyé sans attendre (la durée de réponse ne trahit pas non plus l'existence du compte).
        ['POST', '/api/auth/password-reset', async ctx => {
            const body = await readJson(ctx.req);
            if (!passwordResetEnabled) throw new HttpError(503, 'La réinitialisation par e-mail n’est pas encore disponible.');
            const email = normalizeEmail(body.email);
            if (!loginByIp.take(ctx.ip) || !resetByEmail.take(email)) {
                throw new HttpError(429, 'Trop de demandes, réessayez plus tard.');
            }
            const found = email ? db.users.findCredentials(email) : null;
            if (found) {
                const token = auth.createResetToken(found.user.id);
                const link = `${publicUrl}/#/mot-de-passe/nouveau?jeton=${encodeURIComponent(token)}`;
                mailer.send({
                    to: found.user.email,
                    subject: 'EcoVroom : réinitialisation de votre mot de passe',
                    text: `Bonjour ${found.user.name},\n\n`
                        + `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable ${RESET_TOKEN_MINUTES} minutes, une seule fois) :\n`
                        + `${link}\n\n`
                        + 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.\n\nEcoVroom'
                }).catch(error => console.error('Envoi du lien de réinitialisation impossible :', error.message));
            }
            return { message: 'Si un compte existe avec cette adresse, un lien de réinitialisation vient d’y être envoyé.' };
        }],
        ['POST', '/api/auth/password-reset/confirm', async ctx => {
            const body = await readJson(ctx.req);
            if (!loginByIp.take(ctx.ip)) throw new HttpError(429, 'Trop de tentatives, réessayez plus tard.');
            const user = auth.userForResetToken(body.token);
            if (!user) throw new HttpError(400, 'Lien invalide ou expiré. Faites une nouvelle demande.');
            const problem = passwordProblem(body.password);
            if (problem) throw new HttpError(400, 'Mot de passe refusé.', { fields: { password: problem } });
            await auth.setPassword(user.id, body.password); // ferme les sessions et invalide le lien
            const { token } = auth.startSession(user.id);
            ctx.setCookie(sessionCookie(token, SESSION_DAYS * 86400));
            return { user };
        }],

        // Compte : changement de mot de passe et suppression (mot de passe actuel exigé).
        ['POST', '/api/me/password', async ctx => {
            const body = await readJson(ctx.req);
            const user = requireUser(ctx);
            await requirePassword(user, body.currentPassword);
            const problem = passwordProblem(body.newPassword);
            if (problem) throw new HttpError(400, 'Mot de passe refusé.', { fields: { newPassword: problem } });
            await auth.setPassword(user.id, body.newPassword); // déconnecte aussi les autres appareils
            const { token } = auth.startSession(user.id);
            ctx.setCookie(sessionCookie(token, SESSION_DAYS * 86400));
            return { ok: true };
        }],
        ['POST', '/api/me/delete', async ctx => {
            const body = await readJson(ctx.req);
            const user = requireUser(ctx);
            await requirePassword(user, body.password);
            const summary = db.transaction(() => {
                const current = now();
                const upcoming = db.trips.byDriver(user.id).filter(trip => !hasDeparted(trip, current));
                const withPassengers = upcoming.filter(trip => seatsBooked(trip.id, db.bookings.byTrip(trip.id)) > 0);
                if (withPassengers.length) {
                    throw new HttpError(409, 'Suppression impossible : des passagers ont réservé vos trajets à venir ('
                        + withPassengers.map(trip => `${trip.origin} → ${trip.destination}`).join(', ')
                        + '). Réessayez une fois ces trajets passés.');
                }
                upcoming.forEach(trip => db.trips.deleteWithBookings(trip.id));
                const toCancel = db.bookings.byPassenger(user.id)
                    .filter(booking => canCancel(booking, db.trips.get(booking.tripId), current));
                toCancel.forEach(booking => db.bookings.cancel(booking.id, current.toISOString()));
                db.bookings.clearPlacesForPassenger(user.id);
                db.sessions.deleteForUser(user.id);
                db.passwordResets.deleteForUser(user.id);
                db.users.anonymize(user.id, current.toISOString());
                return { deletedTrips: upcoming.length, cancelledBookings: toCancel.length };
            });
            ctx.setCookie(sessionCookie('', 0));
            return { deleted: true, ...summary };
        }],

        // Trajets
        ['GET', '/api/trips', ctx => {
            const q = ctx.query;
            const criteria = {
                origin: q.get('origin') ?? '',
                destination: q.get('destination') ?? '',
                date: q.get('date') ?? '',
                seats: q.has('seats') ? Number(q.get('seats')) : 1
            };
            const { valid, errors } = validateSearch(criteria);
            if (!valid) throw new HttpError(400, 'Recherche invalide.', { fields: errors });
            const current = now();
            const upcoming = db.trips.upcoming(current.toISOString()).filter(trip => trip.driverId !== ctx.user?.id);
            const seats = db.bookings.seatsBookedByTrip(upcoming.map(t => t.id));
            const pseudoBookings = [...seats].map(([tripId, booked]) => ({ tripId, seats: booked, status: BOOKING_STATUS.CONFIRMED }));
            const ids = new Set(searchTrips(upcoming, pseudoBookings, criteria, { now: current }).map(r => r.trip.id));
            return { results: withAvailability(upcoming.filter(trip => ids.has(trip.id))) };
        }],
        ['GET', '/api/trips/:id', ctx => {
            const trip = db.trips.get(ctx.params.id);
            if (!trip) throw new HttpError(404, 'Ce trajet n’existe pas ou n’est plus disponible.');
            return withAvailability([trip])[0];
        }],
        ['POST', '/api/trips', async ctx => {
            const user = requireUser(ctx);
            const body = await readJson(ctx.req);
            const draft = {
                origin: body.origin, destination: body.destination,
                originCoords: body.originCoords ?? null, destinationCoords: body.destinationCoords ?? null,
                departureAt: body.departureAt, distanceKm: body.distanceKm, seats: body.seats, vehicleType: body.vehicleType
            };
            const { valid, errors } = validateTrip(draft, { now: now() });
            if (!valid) throw new HttpError(400, 'Trajet invalide.', { fields: errors });
            const trip = db.trips.insert(createTrip(draft, { id: randomUUID(), driverId: user.id, now: now() }));
            return { status: 201, body: { trip } };
        }],
        ['POST', '/api/trips/:id/complete', async ctx => {
            await readJson(ctx.req);
            const user = requireUser(ctx);
            return db.transaction(() => {
                const trip = ownTrip(ctx, ctx.params.id);
                let result;
                try {
                    result = completeTrip({ trip, bookings: db.bookings.byTrip(trip.id), driverId: user.id }, { now: now() });
                } catch (error) {
                    throw businessError(error, 409);
                }
                db.trips.markCompleted(trip.id, result.trip.completedAt);
                if (result.creditEntry) db.credits.upsert(result.creditEntry);
                return result;
            });
        }],
        ['POST', '/api/trips/:id/itinerary', async ctx => {
            await readJson(ctx.req);
            const trip = ownTrip(ctx, ctx.params.id);
            const client = requireOrs(ctx);
            const bookings = db.bookings.byTrip(trip.id).filter(b => b.status === BOOKING_STATUS.CONFIRMED);
            let built;
            try {
                built = buildTripProblem(trip, bookings);
            } catch (error) {
                throw businessError(error);
            }
            const solution = await callOrs(() => client.optimize(built.problem));
            try {
                return { plan: parseTripSolution(solution, built.shipmentBookingIds) };
            } catch (error) {
                throw new HttpError(502, error.message);
            }
        }],

        // Réservations
        ['POST', '/api/bookings', async ctx => {
            const user = requireUser(ctx);
            const body = await readJson(ctx.req);
            const seats = Number(body.seats);
            // Lecture des places et écriture dans la même transaction : pas de surréservation possible.
            return db.transaction(() => {
                const trip = db.trips.get(String(body.tripId ?? ''));
                const bookings = trip ? db.bookings.byTrip(trip.id) : [];
                const refusal = bookingRefusal({ trip, bookings, passengerId: user.id, seats }, { now: now() });
                if (refusal) throw new HttpError(trip ? 409 : 404, refusal);
                let booking;
                try {
                    booking = createBooking(
                        { trip, bookings, passengerId: user.id, seats, route: body.route ?? {} },
                        { id: randomUUID(), reference: bookingReference(), now: now() });
                } catch (error) {
                    throw businessError(error);
                }
                for (let attempt = 0; ; attempt++) {
                    try {
                        db.bookings.insert(booking);
                        break;
                    } catch (error) {
                        if (attempt < 3 && String(error.message).includes('bookings.reference')) {
                            booking = { ...booking, reference: bookingReference() };
                            continue;
                        }
                        throw error;
                    }
                }
                return { status: 201, body: { booking, trip } };
            });
        }],
        ['GET', '/api/bookings/:id', ctx => {
            const user = requireUser(ctx);
            const booking = db.bookings.get(ctx.params.id);
            const trip = booking && db.trips.get(booking.tripId);
            // Visible par le passager et par le conducteur du trajet uniquement.
            if (!booking || (booking.passengerId !== user.id && trip.driverId !== user.id)) {
                throw new HttpError(404, 'Réservation introuvable.');
            }
            return { booking, trip };
        }],
        ['POST', '/api/bookings/:id/cancel', async ctx => {
            await readJson(ctx.req);
            const user = requireUser(ctx);
            return db.transaction(() => {
                const booking = db.bookings.get(ctx.params.id);
                if (!booking || booking.passengerId !== user.id) throw new HttpError(404, 'Réservation introuvable.');
                const trip = db.trips.get(booking.tripId);
                let cancelled;
                try {
                    cancelled = cancelBooking(booking, trip, { now: now() });
                } catch (error) {
                    throw businessError(error, 409);
                }
                db.bookings.cancel(booking.id, cancelled.cancelledAt);
                return { booking: cancelled, trip };
            });
        }],

        // Confirmation du trajet par le passager (« J'ai voyagé » / « Le trajet n'a pas eu lieu »).
        ['POST', '/api/bookings/:id/proof', async ctx => {
            const body = await readJson(ctx.req);
            const user = requireUser(ctx);
            return db.transaction(() => {
                const booking = db.bookings.get(ctx.params.id);
                if (!booking || booking.passengerId !== user.id) throw new HttpError(404, 'Réservation introuvable.');
                const trip = db.trips.get(booking.tripId);
                let answered;
                try {
                    answered = recordPassengerProof(booking, trip, { answer: body.answer, now: now() });
                } catch (error) {
                    if (error instanceof TypeError) throw new HttpError(400, error.message);
                    throw businessError(error, 409);
                }
                db.bookings.setProof(booking.id, answered.passengerProof, answered.passengerProofAt);
                // Le trajet déjà confirmé par le conducteur : ses crédits estimés suivent la réponse.
                const entry = db.credits.byTrip(trip.id);
                if (entry) db.credits.upsert(refreshCreditEntry(entry, { trip, bookings: db.bookings.byTrip(trip.id) }));
                return { booking: answered, trip };
            });
        }],

        // Espace personnel
        ['GET', '/api/me/bookings', ctx => {
            const user = requireUser(ctx);
            return {
                bookings: db.bookings.byPassenger(user.id).map(booking => ({ booking, trip: db.trips.get(booking.tripId) }))
            };
        }],
        ['GET', '/api/me/trips', ctx => {
            const user = requireUser(ctx);
            const trips = db.trips.byDriver(user.id);
            const bookings = db.bookings.byTrips(trips.map(t => t.id));
            const names = db.users.names([...new Set(bookings.map(b => b.passengerId))]);
            return {
                trips: trips.map(trip => ({
                    trip,
                    bookings: bookings
                        .filter(b => b.tripId === trip.id)
                        .map(b => ({ ...b, passengerName: names.get(b.passengerId) ?? '' }))
                }))
            };
        }],
        ['GET', '/api/me/credits', ctx => {
            const user = requireUser(ctx);
            return { entries: db.credits.byDriver(user.id).map(entry => ({ ...entry, proof: proofOf(entry) })) };
        }],
        ['POST', '/api/me/credits/submit', async ctx => {
            await readJson(ctx.req);
            const user = requireUser(ctx);
            return db.transaction(() => {
                // Seules les entrées dont les passagers ont répondu (ou dont le délai est passé) partent.
                const submitted = submitForValidation(db.credits.byDriver(user.id), {
                    now: now(),
                    canSubmit: entry => isSubmittable(entry, proofOf(entry))
                });
                submitted.forEach(entry => db.credits.upsert(entry));
                return { submitted };
            });
        }],

        // openrouteservice : la clé reste sur le serveur ; seules ces opérations sont exposées.
        ['GET', '/api/ors/autocomplete', async ctx => {
            const client = requireOrs(ctx);
            const text = String(ctx.query.get('text') ?? '').trim();
            if (text.length < 2 || text.length > 100) throw new HttpError(400, 'Texte de recherche invalide.');
            return { places: await callOrs(() => client.autocomplete(text)) };
        }],
        ['POST', '/api/ors/directions', async ctx => {
            const body = await readJson(ctx.req);
            const client = requireOrs(ctx);
            const from = requireCoords(body.from, 'départ');
            const to = requireCoords(body.to, 'arrivée');
            return await callOrs(() => client.directions(from, to));
        }],
        ['POST', '/api/ors/matrix', async ctx => {
            const body = await readJson(ctx.req);
            const client = requireOrs(ctx);
            const locations = body.locations;
            if (!Array.isArray(locations) || locations.length < 2 || locations.length > MAX_MATRIX_LOCATIONS) {
                throw new HttpError(400, 'Liste de lieux invalide.');
            }
            locations.forEach((coords, i) => requireCoords(coords, `lieu ${i + 1}`));
            return await callOrs(() => client.matrix(locations));
        }]
    ];
    const match = createRouter(routes);

    return async function handle(req, res) {
        const url = new URL(req.url, 'http://localhost');
        const extraHeaders = { ...SECURITY_HEADERS };
        const cookies = [];

        try {
            if (!url.pathname.startsWith('/api/')) {
                if ((req.method === 'GET' || req.method === 'HEAD') && await serveStatic(url.pathname, res, extraHeaders)) return;
                throw new HttpError(404, 'Page introuvable.');
            }

            // Protection CSRF : une requête d'écriture venant d'un autre site est refusée
            // (en plus du cookie SameSite=Lax et du contenu JSON obligatoire).
            if (req.method !== 'GET' && req.headers.origin) {
                const origin = new URL(req.headers.origin);
                if (origin.host !== req.headers.host) throw new HttpError(403, 'Origine refusée.');
            }

            const found = match(req.method, url.pathname);
            if (!found) throw new HttpError(404, 'Ressource introuvable.');

            const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
            const ctx = {
                req,
                params: found.params,
                query: url.searchParams,
                token,
                user: auth.userForToken(token),
                ip: clientIp(req, trustProxyHops),
                setCookie: cookie => cookies.push(cookie)
            };
            // Diagnostic temporaire (DEBUG_CLIENT_IP=1) pour régler TRUST_PROXY_HOPS : journalise
            // l'en-tête brut et l'adresse retenue, uniquement sur l'inscription et la connexion.
            if (debugClientIp && url.pathname.startsWith('/api/auth/') && req.method === 'POST') {
                console.log(`[ip] ${url.pathname} X-Forwarded-For="${req.headers['x-forwarded-for'] ?? ''}" `
                    + `socket=${req.socket.remoteAddress} → retenue=${ctx.ip} (TRUST_PROXY_HOPS=${trustProxyHops})`);
            }
            const result = await found.handler(ctx);
            const { status = 200, body = result } = result && 'status' in result && 'body' in result ? result : {};
            sendJson(res, status, body, { ...extraHeaders, ...(cookies.length ? { 'Set-Cookie': cookies } : {}) });
        } catch (error) {
            if (!(error instanceof HttpError)) console.error('Erreur serveur :', error);
            const status = error instanceof HttpError ? error.status : 500;
            const message = error instanceof HttpError ? error.message : 'Erreur interne du serveur.';
            if (url.pathname.startsWith('/api/') || status !== 404) {
                sendJson(res, status, { error: message, ...(error.fields ? { fields: error.fields } : {}) }, extraHeaders);
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...extraHeaders });
                res.end('Page introuvable.');
            }
        }
    };
}
