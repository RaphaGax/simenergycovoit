// Base de données SQLite (module node:sqlite intégré à Node 22, sans dépendance).
// Toutes les opérations sont synchrones : une requête HTTP qui lit puis écrit dans une même
// transaction ne peut pas être entrecoupée par une autre (Node exécute un seul fil JavaScript).
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    driver_id TEXT NOT NULL REFERENCES users(id),
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    origin_coords TEXT,
    destination_coords TEXT,
    departure_at TEXT NOT NULL,
    distance_km REAL NOT NULL,
    seats INTEGER NOT NULL,
    vehicle_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS trips_departure ON trips(departure_at);
CREATE INDEX IF NOT EXISTS trips_driver ON trips(driver_id);

CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL UNIQUE,
    trip_id TEXT NOT NULL REFERENCES trips(id),
    passenger_id TEXT NOT NULL REFERENCES users(id),
    seats INTEGER NOT NULL,
    pickup TEXT,
    dropoff TEXT,
    passenger_distance_km REAL,
    detour_km REAL,
    price_chf INTEGER NOT NULL CHECK (price_chf = 0),
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    cancelled_at TEXT,
    passenger_proof TEXT,
    passenger_proof_at TEXT
);
CREATE INDEX IF NOT EXISTS bookings_trip ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS bookings_passenger ON bookings(passenger_id);

CREATE TABLE IF NOT EXISTS credits (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL UNIQUE REFERENCES trips(id),
    driver_id TEXT NOT NULL REFERENCES users(id),
    passenger_seats INTEGER NOT NULL,
    co2_avoided_g REAL NOT NULL,
    credits REAL NOT NULL,
    status TEXT NOT NULL,
    estimated_at TEXT NOT NULL,
    pending_at TEXT,
    validated_at TEXT
);
CREATE INDEX IF NOT EXISTS credits_driver ON credits(driver_id);
`;

const json = value => (value == null ? null : JSON.stringify(value));
const parse = text => (text == null ? null : JSON.parse(text));
// Les champs facultatifs absents ne sont pas renvoyés (mêmes objets que ceux du core).
const withoutNulls = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value != null));

const tripFromRow = row => row && {
    id: row.id,
    driverId: row.driver_id,
    origin: row.origin,
    destination: row.destination,
    originCoords: parse(row.origin_coords),
    destinationCoords: parse(row.destination_coords),
    departureAt: row.departure_at,
    distanceKm: row.distance_km,
    seats: row.seats,
    vehicleType: row.vehicle_type,
    createdAt: row.created_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {})
};

const bookingFromRow = row => row && withoutNulls({
    id: row.id,
    reference: row.reference,
    tripId: row.trip_id,
    passengerId: row.passenger_id,
    seats: row.seats,
    pickup: parse(row.pickup),
    dropoff: parse(row.dropoff),
    passengerDistanceKm: row.passenger_distance_km,
    detourKm: row.detour_km,
    priceChf: row.price_chf,
    status: row.status,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    passengerProof: row.passenger_proof,
    passengerProofAt: row.passenger_proof_at
});

const creditFromRow = row => row && withoutNulls({
    id: row.id,
    tripId: row.trip_id,
    driverId: row.driver_id,
    passengerSeats: row.passenger_seats,
    co2AvoidedG: row.co2_avoided_g,
    credits: row.credits,
    status: row.status,
    estimatedAt: row.estimated_at,
    pendingAt: row.pending_at,
    validatedAt: row.validated_at
});

const userFromRow = row => row && { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };

// Colonnes ajoutées après la création des premières bases : ajoutées si elles manquent.
const ADDED_COLUMNS = [
    ['bookings', 'passenger_proof', 'TEXT'],
    ['bookings', 'passenger_proof_at', 'TEXT']
];

function migrate(db) {
    for (const [table, column, type] of ADDED_COLUMNS) {
        const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(info => info.name === column);
        if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
}

export function openDatabase(path = ':memory:') {
    const db = new DatabaseSync(path);
    db.exec(SCHEMA);
    migrate(db);
    if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');

    const statements = new Map();
    const sql = text => {
        if (!statements.has(text)) statements.set(text, db.prepare(text));
        return statements.get(text);
    };

    // Exécute fn dans une transaction ; annule tout en cas d'erreur.
    function transaction(fn) {
        db.exec('BEGIN IMMEDIATE');
        try {
            const result = fn();
            db.exec('COMMIT');
            return result;
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }

    const users = {
        create({ id, email, name, passwordHash, createdAt }) {
            sql('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
                .run(id, email, name, passwordHash, createdAt);
            return users.get(id);
        },
        get: id => userFromRow(sql('SELECT * FROM users WHERE id = ?').get(id)),
        // Avec l'empreinte du mot de passe : réservé à la connexion.
        findCredentials: email => {
            const row = sql('SELECT * FROM users WHERE email = ?').get(email);
            return row && { user: userFromRow(row), passwordHash: row.password_hash };
        },
        names: ids => {
            if (ids.length === 0) return new Map();
            const rows = sql(`SELECT id, name FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
            return new Map(rows.map(row => [row.id, row.name]));
        }
    };

    const sessions = {
        create({ tokenHash, userId, createdAt, expiresAt }) {
            sql('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
                .run(tokenHash, userId, createdAt, expiresAt);
        },
        findUser(tokenHash, now) {
            const row = sql(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
                             WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(tokenHash, now);
            return userFromRow(row);
        },
        delete: tokenHash => sql('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash),
        deleteExpired: now => sql('DELETE FROM sessions WHERE expires_at <= ?').run(now)
    };

    const trips = {
        insert(trip) {
            sql(`INSERT INTO trips (id, driver_id, origin, destination, origin_coords, destination_coords,
                                    departure_at, distance_km, seats, vehicle_type, created_at, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(trip.id, trip.driverId, trip.origin, trip.destination, json(trip.originCoords),
                    json(trip.destinationCoords), trip.departureAt, trip.distanceKm, trip.seats,
                    trip.vehicleType, trip.createdAt, trip.completedAt ?? null);
            return trip;
        },
        get: id => tripFromRow(sql('SELECT * FROM trips WHERE id = ?').get(id)),
        upcoming: now => sql('SELECT * FROM trips WHERE departure_at > ? ORDER BY departure_at').all(now).map(tripFromRow),
        byDriver: driverId => sql('SELECT * FROM trips WHERE driver_id = ? ORDER BY departure_at').all(driverId).map(tripFromRow),
        markCompleted: (id, completedAt) => sql('UPDATE trips SET completed_at = ? WHERE id = ?').run(completedAt, id)
    };

    const bookings = {
        insert(booking) {
            sql(`INSERT INTO bookings (id, reference, trip_id, passenger_id, seats, pickup, dropoff,
                                       passenger_distance_km, detour_km, price_chf, status, created_at, cancelled_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(booking.id, booking.reference, booking.tripId, booking.passengerId, booking.seats,
                    json(booking.pickup), json(booking.dropoff), booking.passengerDistanceKm ?? null,
                    booking.detourKm ?? null, booking.priceChf, booking.status, booking.createdAt,
                    booking.cancelledAt ?? null);
            return booking;
        },
        get: id => bookingFromRow(sql('SELECT * FROM bookings WHERE id = ?').get(id)),
        byTrip: tripId => sql('SELECT * FROM bookings WHERE trip_id = ? ORDER BY created_at').all(tripId).map(bookingFromRow),
        byTrips(tripIds) {
            if (tripIds.length === 0) return [];
            return sql(`SELECT * FROM bookings WHERE trip_id IN (${tripIds.map(() => '?').join(',')}) ORDER BY created_at`)
                .all(...tripIds).map(bookingFromRow);
        },
        byPassenger: passengerId => sql('SELECT * FROM bookings WHERE passenger_id = ? ORDER BY created_at').all(passengerId).map(bookingFromRow),
        // Places confirmées par trajet, pour calculer les places restantes sans exposer les réservations.
        seatsBookedByTrip(tripIds) {
            if (tripIds.length === 0) return new Map();
            const rows = sql(`SELECT trip_id, SUM(seats) AS seats FROM bookings
                              WHERE status = 'confirmed' AND trip_id IN (${tripIds.map(() => '?').join(',')})
                              GROUP BY trip_id`).all(...tripIds);
            return new Map(rows.map(row => [row.trip_id, row.seats]));
        },
        cancel: (id, cancelledAt) => sql("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(cancelledAt, id),
        // Réponse du passager enregistrée une seule fois (la condition protège contre une double réponse).
        setProof: (id, proof, at) => sql('UPDATE bookings SET passenger_proof = ?, passenger_proof_at = ? WHERE id = ? AND passenger_proof IS NULL')
            .run(proof, at, id)
    };

    const credits = {
        upsert(entry) {
            sql(`INSERT INTO credits (id, trip_id, driver_id, passenger_seats, co2_avoided_g, credits, status,
                                      estimated_at, pending_at, validated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET status = excluded.status, pending_at = excluded.pending_at,
                     validated_at = excluded.validated_at,
                     -- Montants recalculés seulement tant que l'entrée est « estimée » (jamais après soumission).
                     passenger_seats = CASE WHEN credits.status = 'estimated' THEN excluded.passenger_seats ELSE credits.passenger_seats END,
                     co2_avoided_g = CASE WHEN credits.status = 'estimated' THEN excluded.co2_avoided_g ELSE credits.co2_avoided_g END,
                     credits = CASE WHEN credits.status = 'estimated' THEN excluded.credits ELSE credits.credits END`)
                .run(entry.id, entry.tripId, entry.driverId, entry.passengerSeats, entry.co2AvoidedG, entry.credits,
                    entry.status, entry.estimatedAt, entry.pendingAt ?? null, entry.validatedAt ?? null);
            return entry;
        },
        byDriver: driverId => sql('SELECT * FROM credits WHERE driver_id = ? ORDER BY estimated_at DESC').all(driverId).map(creditFromRow),
        byTrip: tripId => creditFromRow(sql('SELECT * FROM credits WHERE trip_id = ?').get(tripId))
    };

    return { users, sessions, trips, bookings, credits, transaction, close: () => db.close() };
}
