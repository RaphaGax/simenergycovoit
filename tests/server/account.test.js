// Compte : changement de mot de passe, mot de passe oublié, suppression (nLPD / RGPD).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../../server/db.js';
import { createApp } from '../../server/app.js';
import { createMailer, publicUrl } from '../../server/mailer.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
let clock = new Date('2026-10-10T12:00:00Z');
let server, base, db;
const sent = [];
const fakeMailer = { name: 'test', send: async mail => { sent.push(mail); } };

before(async () => {
    db = openDatabase(':memory:');
    server = createServer(createApp({
        db, staticDir: ROOT, now: () => clock, mailer: fakeMailer, publicUrl: 'https://ecovroom.test',
        limits: { authPerIp: 1000 }
    }));
    await new Promise(resolve => server.listen(0, resolve));
    base = `http://localhost:${server.address().port}`;
});

after(() => {
    server.close();
    db.close();
});

function client() {
    let cookie = '';
    async function post(path, body = {}) {
        const response = await fetch(base + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
            body: JSON.stringify(body)
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: response.status, json: await response.json() };
    }
    async function get(path) {
        const response = await fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
        return { status: response.status, json: await response.json() };
    }
    return { post, get };
}

let counter = 0;
async function newUser(name = 'Alex', password = 'motdepasse-solide') {
    const c = client();
    const email = `compte${++counter}@example.ch`;
    const res = await c.post('/api/auth/register', { email, password, name });
    assert.equal(res.status, 201);
    return Object.assign(c, { user: res.json.user, email, password });
}

const tokenFrom = mail => decodeURIComponent(mail.text.match(/jeton=([^\s]+)/)[1]);

test('configuration : mot de passe oublié activé avec un expéditeur et une adresse publique', async () => {
    assert.deepEqual((await client().get('/api/config')).json, { orsEnabled: false, passwordResetEnabled: true });
});

test('changement de mot de passe : ancien exigé, autres appareils déconnectés', async () => {
    const alex = await newUser();
    const otherDevice = client();
    await otherDevice.post('/api/auth/login', { email: alex.email, password: alex.password });

    const wrong = await alex.post('/api/me/password', { currentPassword: 'faux-mot-de-passe', newPassword: 'nouveau-mot-de-passe' });
    assert.equal(wrong.status, 403);
    const weak = await alex.post('/api/me/password', { currentPassword: alex.password, newPassword: 'court' });
    assert.equal(weak.status, 400);
    assert.ok(weak.json.fields.newPassword);

    assert.equal((await alex.post('/api/me/password', { currentPassword: alex.password, newPassword: 'nouveau-mot-de-passe' })).status, 200);
    assert.equal((await alex.get('/api/auth/me')).json.user.id, alex.user.id); // cet appareil reste connecté
    assert.equal((await otherDevice.get('/api/auth/me')).json.user, null); // l'autre est déconnecté
    assert.equal((await client().post('/api/auth/login', { email: alex.email, password: alex.password })).status, 401);
    assert.equal((await client().post('/api/auth/login', { email: alex.email, password: 'nouveau-mot-de-passe' })).status, 200);
});

test('mot de passe oublié : même réponse pour une adresse inconnue, lien à usage unique', async () => {
    const alex = await newUser();
    sent.length = 0;
    const known = await client().post('/api/auth/password-reset', { email: alex.email.toUpperCase() });
    const unknown = await client().post('/api/auth/password-reset', { email: 'personne@example.ch' });
    assert.equal(known.status, 200);
    assert.deepEqual(known.json, unknown.json); // rien n'indique si le compte existe
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, alex.email);
    assert.match(sent[0].text, /^Bonjour Alex/);
    assert.match(sent[0].text, /https:\/\/ecovroom\.test\/#\/mot-de-passe\/nouveau\?jeton=/);

    const token = tokenFrom(sent[0]);
    const weak = await client().post('/api/auth/password-reset/confirm', { token, password: 'court' });
    assert.equal(weak.status, 400);
    const reset = client();
    const ok = await reset.post('/api/auth/password-reset/confirm', { token, password: 'reinitialise-123' });
    assert.equal(ok.status, 200);
    assert.equal((await reset.get('/api/auth/me')).json.user.id, alex.user.id); // connecté directement
    assert.equal((await alex.get('/api/auth/me')).json.user, null); // anciennes sessions fermées
    assert.equal((await client().post('/api/auth/password-reset/confirm', { token, password: 'encore-un-autre' })).status, 400);
    assert.equal((await client().post('/api/auth/login', { email: alex.email, password: 'reinitialise-123' })).status, 200);
});

test('mot de passe oublié : lien expiré après 30 minutes, remplacé par une nouvelle demande, jeton bidon refusé', async () => {
    const alex = await newUser();
    sent.length = 0;
    await client().post('/api/auth/password-reset', { email: alex.email });
    await client().post('/api/auth/password-reset', { email: alex.email });
    await new Promise(resolve => setImmediate(resolve));
    const [first, second] = sent.map(tokenFrom);
    assert.equal((await client().post('/api/auth/password-reset/confirm', { token: first, password: 'nouveau-mdp-123' })).status, 400);

    clock = new Date(clock.getTime() + 31 * 60000);
    try {
        assert.equal((await client().post('/api/auth/password-reset/confirm', { token: second, password: 'nouveau-mdp-123' })).status, 400);
    } finally {
        clock = new Date('2026-10-10T12:00:00Z');
    }
    for (const token of ['', 'x'.repeat(43), null, 42]) {
        assert.equal((await client().post('/api/auth/password-reset/confirm', { token, password: 'nouveau-mdp-123' })).status, 400);
    }
});

test('mot de passe oublié : au plus 3 liens par heure et par adresse', async () => {
    const alex = await newUser();
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await client().post('/api/auth/password-reset', { email: alex.email })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429]);
});

test('suppression : mot de passe exigé ; données personnelles effacées, historique partagé anonymisé', async () => {
    const driver = await newUser('Dana');
    const { json: { trip: past } } = await driver.post('/api/trips', {
        origin: 'Lausanne', destination: 'Genève', departureAt: '2026-10-11T07:30:00.000Z', distanceKm: 60, seats: 3, vehicleType: 'diesel'
    });
    const { json: { trip: empty } } = await driver.post('/api/trips', {
        origin: 'Sion', destination: 'Martigny', departureAt: '2026-10-20T07:30:00.000Z', distanceKm: 30, seats: 3, vehicleType: 'diesel'
    });
    const pia = await newUser('Pia');
    const route = { pickup: { label: 'Rue de Pia 1, Morges', coords: [6.4983, 46.5113] }, dropoff: { label: 'Nyon', coords: [6.2393, 46.3833] }, passengerDistanceKm: 30, detourKm: 2 };
    const { json: { booking: pastBooking } } = await pia.post('/api/bookings', { tripId: past.id, seats: 1, route });
    const other = await newUser('Olga');
    const { json: { trip: future } } = await other.post('/api/trips', {
        origin: 'Fribourg', destination: 'Berne', departureAt: '2026-10-25T07:30:00.000Z', distanceKm: 34, seats: 2, vehicleType: 'electric'
    });
    const { json: { booking: futureBooking } } = await pia.post('/api/bookings', { tripId: future.id, seats: 2 });

    clock = new Date('2026-10-12T12:00:00Z'); // le premier trajet est passé
    try {
        assert.equal((await pia.post('/api/me/delete', { password: 'faux-mot-de-passe' })).status, 403);
        const deleted = await pia.post('/api/me/delete', { password: pia.password });
        assert.equal(deleted.status, 200);
        assert.deepEqual(deleted.json, { deleted: true, deletedTrips: 0, cancelledBookings: 1 });

        // Plus de connexion possible, adresse libérée.
        assert.equal((await pia.get('/api/auth/me')).json.user, null);
        assert.equal((await client().post('/api/auth/login', { email: pia.email, password: pia.password })).status, 401);
        assert.equal((await client().post('/api/auth/register', { email: pia.email, password: 'nouveau-compte-1', name: 'Pia' })).status, 201);

        // Réservation à venir annulée : la place revient au trajet d'Olga.
        assert.equal((await client().get(`/api/trips/${future.id}`)).json.seatsLeft, 2);
        assert.equal(db.bookings.get(futureBooking.id).status, 'cancelled');

        // Historique du conducteur conservé, sans e-mail, prénom ni adresse de prise en charge.
        const kept = db.bookings.get(pastBooking.id);
        assert.equal(kept.pickup, undefined);
        assert.equal(kept.passengerDistanceKm, 30);
        const mine = (await driver.get('/api/me/trips')).json.trips.find(t => t.trip.id === past.id);
        assert.equal(mine.bookings[0].passengerName, 'Compte supprimé');
        const row = db.users.get(pia.user.id);
        assert.equal(row.name, 'Compte supprimé');
        assert.ok(!JSON.stringify(row).includes(pia.email));

        // Conducteur : trajet à venir sans passager supprimé avec le compte.
        assert.equal((await driver.post('/api/me/delete', { password: driver.password })).json.deletedTrips, 1);
        assert.equal(db.trips.get(empty.id), undefined);
        assert.ok(db.trips.get(past.id)); // trajet passé conservé (historique des passagers)
    } finally {
        clock = new Date('2026-10-10T12:00:00Z');
    }
});

test('suppression refusée tant qu’un trajet à venir a des passagers', async () => {
    const driver = await newUser('Dana');
    const { json: { trip } } = await driver.post('/api/trips', {
        origin: 'Lausanne', destination: 'Genève', departureAt: '2026-10-20T07:30:00.000Z', distanceKm: 60, seats: 3, vehicleType: 'diesel'
    });
    const pia = await newUser('Pia');
    await pia.post('/api/bookings', { tripId: trip.id, seats: 1 });
    const refused = await driver.post('/api/me/delete', { password: driver.password });
    assert.equal(refused.status, 409);
    assert.match(refused.json.error, /Lausanne → Genève/);
    assert.equal((await driver.get('/api/auth/me')).json.user.name, 'Dana'); // rien n'a changé
});

test('expéditeur : console en développement, Resend avec clé et expéditeur, sinon aucun ; adresse publique sûre', async () => {
    const logs = [];
    await createMailer({ MAIL_TRANSPORT: 'console' }, { log: line => logs.push(line) }).send({ to: 'a@b.ch', subject: 'S', text: 'T' });
    assert.match(logs[0], /À : a@b\.ch/);

    const calls = [];
    const resend = createMailer({ RESEND_API_KEY: 'cle', MAIL_FROM: 'EcoVroom <noreply@ecovroom.ch>' }, {
        fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; }
    });
    await resend.send({ to: 'a@b.ch', subject: 'S', text: 'T' });
    assert.equal(calls[0].url, 'https://api.resend.com/emails');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer cle');
    assert.deepEqual(JSON.parse(calls[0].options.body), { from: 'EcoVroom <noreply@ecovroom.ch>', to: ['a@b.ch'], subject: 'S', text: 'T' });
    assert.equal(createMailer({ RESEND_API_KEY: 'cle' }), null);
    assert.equal(createMailer({}), null);

    assert.equal(publicUrl({ RENDER_EXTERNAL_URL: 'https://ecovroom.onrender.com/' }), 'https://ecovroom.onrender.com');
    assert.equal(publicUrl({ PUBLIC_URL: 'http://localhost:8000' }), 'http://localhost:8000');
    assert.equal(publicUrl({ PUBLIC_URL: 'http://ecovroom.ch' }), null); // HTTP refusé hors développement
    assert.equal(publicUrl({ PUBLIC_URL: 'javascript:alert(1)' }), null);
    assert.equal(publicUrl({}), null);
});
