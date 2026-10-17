// Tests de l'API : serveur réel sur un port libre, base SQLite en mémoire, horloge contrôlée.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../server/db.js';
import { createApp } from '../../server/app.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LAUSANNE = [6.6291, 46.5167];
const GENEVE = [6.1423, 46.2102];
const MORGES = [6.4983, 46.5113];
const NYON = [6.2393, 46.3833];

let clock = new Date('2026-10-10T12:00:00Z');
let server, base, db;
const orsCalls = [];
const fakeOrs = {
    autocomplete: async text => { orsCalls.push(['autocomplete', text]); return [{ label: 'Genève', coords: GENEVE }]; },
    directions: async () => ({ distanceKm: 62, durationMin: 50 }),
    matrix: async locations => { orsCalls.push(['matrix', locations.length]); return { durations: [[0]], distances: [[0]] }; },
    optimize: async problem => {
        orsCalls.push(['optimize', problem]);
        const t = problem.vehicles[0].time_window[0];
        return {
            code: 0, unassigned: [],
            routes: [{ vehicle: 1, duration: 3000, distance: 64000, steps: [
                { type: 'start', location: problem.vehicles[0].start, arrival: t },
                ...problem.shipments.flatMap(s => [
                    { type: 'pickup', id: s.pickup.id, location: s.pickup.location, arrival: t + 600 },
                    { type: 'delivery', id: s.delivery.id, location: s.delivery.location, arrival: t + 1800 }
                ]),
                { type: 'end', location: problem.vehicles[0].end, arrival: t + 3000 }
            ] }]
        };
    }
};
let orsEnabled = true;

before(async () => {
    db = openDatabase(':memory:');
    const app = createApp({
        db,
        ors: new Proxy({}, { get: (_, name) => (orsEnabled ? fakeOrs[name] : undefined) }),
        staticDir: ROOT,
        now: () => clock,
        limits: { authPerIp: 1000 } // tous les comptes de test viennent de la même adresse
    });
    // Variante sans ORS configuré : un second serveur partageant la même base.
    server = createServer((req, res) => (orsEnabled ? app(req, res) : noOrsApp(req, res)));
    const noOrsApp = createApp({ db, ors: null, staticDir: ROOT, now: () => clock, limits: { authPerIp: 1000 } });
    await new Promise(resolve => server.listen(0, resolve));
    base = `http://localhost:${server.address().port}`;
});

after(() => {
    server.close();
    db.close();
});

// Client HTTP avec son propre cookie de session.
function client() {
    let cookie = '';
    async function call(method, path, body, headers = {}) {
        const response = await fetch(base + path, {
            method,
            headers: {
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...(cookie ? { Cookie: cookie } : {}),
                ...headers
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const text = await response.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* réponse non JSON */ }
        return { status: response.status, json, headers: response.headers, setCookie };
    }
    return {
        get: path => call('GET', path),
        post: (path, body = {}, headers) => call('POST', path, body, headers),
        raw: call
    };
}

let counter = 0;
async function newUser(name = 'Alex') {
    const c = client();
    const email = `user${++counter}@example.ch`;
    const res = await c.post('/api/auth/register', { email, password: 'motdepasse-solide', name });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    return Object.assign(c, { user: res.json.user, email });
}

const tripDraft = (overrides = {}) => ({
    origin: 'Lausanne, gare', destination: 'Genève, Cornavin',
    originCoords: LAUSANNE, destinationCoords: GENEVE,
    departureAt: '2026-10-11T07:30:00.000Z', distanceKm: 62.5, seats: 3, vehicleType: 'diesel',
    ...overrides
});

test('inscription : cookie HttpOnly, mot de passe haché, e-mail unique et règles de saisie', async () => {
    const c = client();
    const res = await c.post('/api/auth/register', { email: ' Marie@Example.CH ', password: 'motdepasse-solide', name: 'Marie' });
    assert.equal(res.status, 201);
    assert.equal(res.json.user.email, 'marie@example.ch');
    assert.match(res.setCookie, /^ecovroom_session=.+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
    assert.equal((await c.get('/api/auth/me')).json.user.name, 'Marie');

    const stored = db.users.findCredentials('marie@example.ch').passwordHash;
    assert.match(stored, /^scrypt\$/);
    assert.ok(!stored.includes('motdepasse-solide'));

    const duplicate = await client().post('/api/auth/register', { email: 'marie@example.ch', password: 'autre-mot-de-passe', name: 'M' });
    assert.equal(duplicate.status, 400);
    assert.ok(duplicate.json.fields.email);

    const weak = await client().post('/api/auth/register', { email: 'x@example.ch', password: 'court', name: '' });
    assert.deepEqual(Object.keys(weak.json.fields).sort(), ['name', 'password']);
});

test('connexion, message d’erreur générique et déconnexion', async () => {
    const alex = await newUser();
    const c = client();
    const wrong = await c.post('/api/auth/login', { email: alex.email, password: 'mauvais-mot-de-passe' });
    const unknown = await c.post('/api/auth/login', { email: 'inconnu@example.ch', password: 'mauvais-mot-de-passe' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.json.error, unknown.json.error); // ne révèle pas si le compte existe

    assert.equal((await c.post('/api/auth/login', { email: alex.email, password: 'motdepasse-solide' })).status, 200);
    assert.equal((await c.get('/api/auth/me')).json.user.id, alex.user.id);
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).json.user, null);
});

test('limites : trop de tentatives sur un même compte ou depuis une même adresse → 429', async () => {
    const limited = createServer(createApp({ db, staticDir: ROOT, now: () => clock, limits: { authPerIp: 3 } }));
    await new Promise(resolve => limited.listen(0, resolve));
    try {
        const url = `http://localhost:${limited.address().port}/api/auth/login`;
        const statuses = [];
        for (let i = 0; i < 4; i++) {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `ip${i}@example.ch`, password: 'x' }) });
            statuses.push(res.status);
        }
        assert.deepEqual(statuses, [401, 401, 401, 429]);
    } finally {
        limited.close();
    }
});

test('derrière un proxy (TRUST_PROXY_HOPS=1) : limite par visiteur, adresse falsifiée ignorée', async () => {
    const limited = createServer(createApp({ db, staticDir: ROOT, now: () => clock, trustProxyHops: 1, limits: { authPerIp: 2 } }));
    await new Promise(resolve => limited.listen(0, resolve));
    // Ce test joue le rôle du proxy : il ajoute l'adresse du visiteur à la fin de l'en-tête.
    const login = (forwardedFor, i) => fetch(`http://localhost:${limited.address().port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
        body: JSON.stringify({ email: `proxy${i}@example.ch`, password: 'x' })
    }).then(res => res.status);
    try {
        const alice = [await login('203.0.113.1', 1), await login('203.0.113.1', 2), await login('203.0.113.1', 3)];
        assert.deepEqual(alice, [401, 401, 429]);
        // Un autre visiteur derrière le même proxy n'est pas bloqué par les essais d'Alice.
        assert.equal(await login('203.0.113.2', 4), 401);
        // Alice ne contourne pas la limite en inventant une adresse au début de l'en-tête.
        assert.equal(await login('9.9.9.9, 203.0.113.1', 5), 429);
    } finally {
        limited.close();
    }
});

test('sans proxy de confiance : X-Forwarded-For ne permet pas de contourner la limite', async () => {
    const limited = createServer(createApp({ db, staticDir: ROOT, now: () => clock, limits: { authPerIp: 2 } }));
    await new Promise(resolve => limited.listen(0, resolve));
    const login = (forwardedFor, i) => fetch(`http://localhost:${limited.address().port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
        body: JSON.stringify({ email: `direct${i}@example.ch`, password: 'x' })
    }).then(res => res.status);
    try {
        const statuses = [await login('1.1.1.1', 1), await login('2.2.2.2', 2), await login('3.3.3.3', 3)];
        assert.deepEqual(statuses, [401, 401, 429]);
    } finally {
        limited.close();
    }
});

test('connexion : trop de tentatives sur un même compte → 429', async () => {
    const alex = await newUser();
    const c = client();
    let last;
    for (let i = 0; i < 11; i++) last = await c.post('/api/auth/login', { email: alex.email, password: 'mauvais-mot-de-passe' });
    assert.equal(last.status, 429);
});

test('publication : connexion requise, validation du core, conducteur = utilisateur connecté', async () => {
    assert.equal((await client().post('/api/trips', tripDraft())).status, 401);
    const driver = await newUser('Dana');
    const invalid = await driver.post('/api/trips', tripDraft({ seats: 0, departureAt: '2020-01-01T00:00:00Z' }));
    assert.equal(invalid.status, 400);
    assert.deepEqual(Object.keys(invalid.json.fields).sort(), ['departureAt', 'seats']);

    const res = await driver.post('/api/trips', tripDraft({ driverId: 'usurpation' }));
    assert.equal(res.status, 201);
    assert.equal(res.json.trip.driverId, driver.user.id);
});

test('recherche publique : places restantes et prénom du conducteur, jamais son e-mail', async () => {
    const driver = await newUser('Dana');
    const { json } = await driver.post('/api/trips', tripDraft({ origin: 'Fribourg', destination: 'Berne', originCoords: null, destinationCoords: null }));
    const anonymous = await client().get('/api/trips?origin=fribourg&destination=berne&seats=1');
    assert.equal(anonymous.status, 200);
    const found = anonymous.json.results.find(r => r.trip.id === json.trip.id);
    assert.equal(found.seatsLeft, 3);
    assert.equal(found.driverName, 'Dana');
    assert.ok(!JSON.stringify(anonymous.json).includes(driver.email));

    // Le conducteur ne voit pas ses propres trajets dans la recherche.
    const own = await driver.get('/api/trips?origin=fribourg');
    assert.ok(!own.json.results.some(r => r.trip.id === json.trip.id));
    assert.equal((await client().get('/api/trips?seats=0')).status, 400);
});

test('réservation : 0 CHF, refus motivés, et pas de surréservation en cas de requêtes simultanées', async () => {
    const driver = await newUser('Dana');
    const { json: { trip } } = await driver.post('/api/trips', tripDraft({ seats: 2 }));
    const [p1, p2, p3] = [await newUser('P1'), await newUser('P2'), await newUser('P3')];

    assert.equal((await client().post('/api/bookings', { tripId: trip.id, seats: 1 })).status, 401);
    assert.equal((await driver.post('/api/bookings', { tripId: trip.id, seats: 1 })).status, 409); // propre trajet
    assert.equal((await p1.post('/api/bookings', { tripId: 'inexistant', seats: 1 })).status, 404);

    const first = await p1.post('/api/bookings', { tripId: trip.id, seats: 1, priceChf: 99 });
    assert.equal(first.status, 201);
    assert.equal(first.json.booking.priceChf, 0);
    assert.match(first.json.booking.reference, /^EV-[0-9A-F]{6}$/);

    // Deux passagers se disputent la dernière place.
    const results = await Promise.all([
        p2.post('/api/bookings', { tripId: trip.id, seats: 1 }),
        p3.post('/api/bookings', { tripId: trip.id, seats: 1 })
    ]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    assert.equal((await client().get(`/api/trips/${trip.id}`)).json.seatsLeft, 0);
    assert.equal(results.find(r => r.status === 409).json.error, 'Ce trajet est complet.');
});

test('réservation avec itinéraire : points enregistrés, données invalides refusées', async () => {
    const driver = await newUser('Dana');
    const { json: { trip } } = await driver.post('/api/trips', tripDraft());
    const passenger = await newUser('Pia');
    const route = { pickup: { label: 'Morges', coords: MORGES }, dropoff: { label: 'Nyon', coords: NYON }, passengerDistanceKm: 30, detourKm: 2 };
    const ok = await passenger.post('/api/bookings', { tripId: trip.id, seats: 1, route });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.json.booking.pickup, route.pickup);
    const bad = await passenger.post('/api/bookings', { tripId: trip.id, seats: 1, route: { ...route, pickup: { label: 'X', coords: [999, 0] } } });
    assert.equal(bad.status, 400);
});

test('réservation : visible par le passager et le conducteur seulement ; annulation par le passager', async () => {
    const driver = await newUser('Dana');
    const { json: { trip } } = await driver.post('/api/trips', tripDraft());
    const passenger = await newUser('Pia');
    const intruder = await newUser('Ivan');
    const { json: { booking } } = await passenger.post('/api/bookings', { tripId: trip.id, seats: 2 });

    assert.equal((await passenger.get(`/api/bookings/${booking.id}`)).status, 200);
    assert.equal((await driver.get(`/api/bookings/${booking.id}`)).status, 200);
    assert.equal((await intruder.get(`/api/bookings/${booking.id}`)).status, 404);
    assert.equal((await intruder.post(`/api/bookings/${booking.id}/cancel`)).status, 404);
    assert.equal((await driver.post(`/api/bookings/${booking.id}/cancel`)).status, 404);

    const mine = await passenger.get('/api/me/bookings');
    assert.deepEqual(mine.json.bookings.map(b => b.booking.id), [booking.id]);

    const cancelled = await passenger.post(`/api/bookings/${booking.id}/cancel`);
    assert.equal(cancelled.json.booking.status, 'cancelled');
    assert.equal((await passenger.post(`/api/bookings/${booking.id}/cancel`)).status, 409);
    assert.equal((await client().get(`/api/trips/${trip.id}`)).json.seatsLeft, 3);

    const driverView = await driver.get('/api/me/trips');
    const entry = driverView.json.trips.find(t => t.trip.id === trip.id);
    assert.equal(entry.bookings[0].passengerName, 'Pia');
});

test('trajet effectué et crédits : conducteur seul, après le départ, une fois ; soumission', async () => {
    clock = new Date('2026-10-10T12:00:00Z');
    try {
        const driver = await newUser('Dana');
        const { json: { trip } } = await driver.post('/api/trips', tripDraft());
        const passenger = await newUser('Pia');
        const { json: { booking } } = await passenger.post('/api/bookings', { tripId: trip.id, seats: 2 });

        assert.equal((await driver.post(`/api/trips/${trip.id}/complete`)).status, 409); // pas encore parti
        clock = new Date('2026-10-11T10:00:00Z');
        assert.equal((await passenger.post(`/api/trips/${trip.id}/complete`)).status, 404);

        const done = await driver.post(`/api/trips/${trip.id}/complete`);
        assert.equal(done.status, 200);
        assert.equal(done.json.creditEntry.co2AvoidedG, 0); // en attente de la passagère
        assert.equal(done.json.trip.completedAt, '2026-10-11T10:00:00.000Z');
        assert.equal((await driver.post(`/api/trips/${trip.id}/complete`)).status, 409);

        let credits = await driver.get('/api/me/credits');
        assert.deepEqual(credits.json.entries.map(e => [e.tripId, e.status]), [[trip.id, 'estimated']]);
        assert.deepEqual(credits.json.entries[0].proof, {
            confirmedSeats: 0, disputedSeats: 0, pendingSeats: 2, deadline: '2026-10-18T07:30:00.000Z', closed: false
        });
        assert.deepEqual((await passenger.get('/api/me/credits')).json.entries, []);
        // Rien à soumettre tant que la passagère n'a pas répondu.
        assert.equal((await driver.post('/api/me/credits/submit')).json.submitted.length, 0);

        const proof = await passenger.post(`/api/bookings/${booking.id}/proof`, { answer: 'confirmed' });
        assert.equal(proof.status, 200);
        assert.equal(proof.json.booking.passengerProof, 'confirmed');
        credits = await driver.get('/api/me/credits');
        assert.equal(credits.json.entries[0].co2AvoidedG, 2 * 62.5 * 140);
        assert.equal(credits.json.entries[0].proof.closed, true);

        const submitted = await driver.post('/api/me/credits/submit');
        assert.equal(submitted.json.submitted.length, 1);
        assert.equal((await driver.get('/api/me/credits')).json.entries[0].status, 'pending');
        assert.equal((await driver.post('/api/me/credits/submit')).json.submitted.length, 0);
    } finally {
        clock = new Date('2026-10-10T12:00:00Z');
    }
});

test('confirmation passager : seul le passager, après le départ, une fois, dans les 7 jours', async () => {
    clock = new Date('2026-10-10T12:00:00Z');
    try {
        const driver = await newUser('Dana');
        const { json: { trip } } = await driver.post('/api/trips', tripDraft({ seats: 3 }));
        const pia = await newUser('Pia');
        const leo = await newUser('Léo');
        const { json: { booking } } = await pia.post('/api/bookings', { tripId: trip.id, seats: 1 });
        const { json: { booking: leoBooking } } = await leo.post('/api/bookings', { tripId: trip.id, seats: 2 });

        assert.equal((await pia.post(`/api/bookings/${booking.id}/proof`, { answer: 'confirmed' })).status, 409); // pas parti
        clock = new Date('2026-10-11T09:00:00Z');
        assert.equal((await driver.post(`/api/bookings/${booking.id}/proof`, { answer: 'confirmed' })).status, 404);
        assert.equal((await leo.post(`/api/bookings/${booking.id}/proof`, { answer: 'confirmed' })).status, 404);
        assert.equal((await pia.post(`/api/bookings/${booking.id}/proof`, { answer: 'peut-être' })).status, 400);

        // Réponse avant la confirmation du conducteur : prise en compte à sa confirmation.
        assert.equal((await pia.post(`/api/bookings/${booking.id}/proof`, { answer: 'confirmed' })).status, 200);
        assert.equal((await pia.post(`/api/bookings/${booking.id}/proof`, { answer: 'disputed' })).status, 409); // une seule fois
        const done = await driver.post(`/api/trips/${trip.id}/complete`);
        assert.equal(done.json.creditEntry.passengerSeats, 1);

        // Léo conteste : ses places ne comptent pas ; tout le monde a répondu, l'entrée est soumissible.
        assert.equal((await leo.post(`/api/bookings/${leoBooking.id}/proof`, { answer: 'disputed' })).status, 200);
        const entry = (await driver.get('/api/me/credits')).json.entries.find(e => e.tripId === trip.id);
        assert.equal(entry.co2AvoidedG, 62.5 * 140);
        assert.deepEqual([entry.proof.confirmedSeats, entry.proof.disputedSeats, entry.proof.closed], [1, 2, true]);

        // Le conducteur voit les réponses de ses passagers.
        const mine = (await driver.get('/api/me/trips')).json.trips.find(t => t.trip.id === trip.id);
        assert.deepEqual(mine.bookings.map(b => b.passengerProof).sort(), ['confirmed', 'disputed']);
    } finally {
        clock = new Date('2026-10-10T12:00:00Z');
    }
});

test('délai de 7 jours : passé ce délai, plus de réponse et les places sans réponse ne comptent pas', async () => {
    clock = new Date('2026-10-10T12:00:00Z');
    try {
        const driver = await newUser('Dana');
        const { json: { trip } } = await driver.post('/api/trips', tripDraft());
        const pia = await newUser('Pia');
        const { json: { booking } } = await pia.post('/api/bookings', { tripId: trip.id, seats: 1 });
        clock = new Date('2026-10-11T10:00:00Z');
        await driver.post(`/api/trips/${trip.id}/complete`);

        clock = new Date('2026-10-18T08:00:00Z'); // départ + 7 jours + 30 min
        assert.equal((await pia.post(`/api/bookings/${booking.id}/proof`, { answer: 'confirmed' })).status, 409);
        const entry = (await driver.get('/api/me/credits')).json.entries.find(e => e.tripId === trip.id);
        assert.deepEqual([entry.proof.pendingSeats, entry.proof.closed, entry.credits], [1, true, 0]);
        // Montant nul : rien n'est soumis.
        assert.equal((await driver.post('/api/me/credits/submit')).json.submitted.length, 0);
    } finally {
        clock = new Date('2026-10-10T12:00:00Z');
    }
});

test('itinéraire VROOM côté serveur : conducteur seul, réservations confirmées uniquement', async () => {
    const driver = await newUser('Dana');
    const { json: { trip } } = await driver.post('/api/trips', tripDraft());
    const passenger = await newUser('Pia');
    assert.equal((await driver.post(`/api/trips/${trip.id}/itinerary`)).status, 400); // aucune réservation
    await passenger.post('/api/bookings', { tripId: trip.id, seats: 1,
        route: { pickup: { label: 'Morges', coords: MORGES }, dropoff: { label: 'Nyon', coords: NYON }, passengerDistanceKm: 30, detourKm: 2 } });

    assert.equal((await passenger.post(`/api/trips/${trip.id}/itinerary`)).status, 404);
    const res = await driver.post(`/api/trips/${trip.id}/itinerary`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.plan.stops.map(s => s.type), ['start', 'pickup', 'delivery', 'end']);
    assert.equal(res.json.plan.distanceKm, 64);
    const problem = orsCalls.filter(([name]) => name === 'optimize').at(-1)[1];
    assert.deepEqual(problem.shipments[0].pickup.location, MORGES);
});

test('proxy ORS : connexion requise, entrées validées, 503 sans clé', async () => {
    const user = await newUser();
    assert.equal((await client().get('/api/ors/autocomplete?text=Gen')).status, 401);
    assert.deepEqual((await user.get('/api/ors/autocomplete?text=Gen')).json.places, [{ label: 'Genève', coords: GENEVE }]);
    assert.equal((await user.get('/api/ors/autocomplete?text=G')).status, 400);
    assert.equal((await user.post('/api/ors/matrix', { locations: [LAUSANNE] })).status, 400);
    assert.equal((await user.post('/api/ors/matrix', { locations: [LAUSANNE, [500, 1]] })).status, 400);
    assert.equal((await user.post('/api/ors/matrix', { locations: Array(53).fill(LAUSANNE) })).status, 400);
    assert.equal((await user.post('/api/ors/matrix', { locations: [LAUSANNE, GENEVE] })).status, 200);
    assert.deepEqual((await user.post('/api/ors/directions', { from: LAUSANNE, to: GENEVE })).json, { distanceKm: 62, durationMin: 50 });

    orsEnabled = false;
    try {
        assert.equal((await user.post('/api/ors/directions', { from: LAUSANNE, to: GENEVE })).status, 503);
        assert.deepEqual((await client().get('/api/config')).json, { orsEnabled: false });
    } finally {
        orsEnabled = true;
    }
});

test('sécurité : origine étrangère et contenu non JSON refusés, en-têtes de sécurité', async () => {
    const user = await newUser();
    const foreign = await user.post('/api/me/credits/submit', {}, { Origin: 'https://site-malveillant.example' });
    assert.equal(foreign.status, 403);
    const form = await user.raw('POST', '/api/trips', undefined, { 'Content-Type': 'text/plain' });
    assert.equal(form.status, 415);

    const page = await client().get('/');
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    for (const path of ['/server/app.js', '/data/ecovroom.db', '/package.json', '/tests/server/api.test.js', '/.git/config']) {
        assert.equal((await client().get(path)).status, 404, path);
    }
    assert.equal((await client().get('/api/inconnu')).status, 404);
});
