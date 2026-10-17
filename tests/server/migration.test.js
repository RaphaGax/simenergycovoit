// Une base créée avant la confirmation passager (sans colonnes passenger_proof) est mise à niveau
// à l'ouverture, sans perte de données.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../server/db.js';

test('ancienne base : colonnes ajoutées, réservations existantes conservées', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecovroom-migration-'));
    const file = join(dir, 'ancienne.db');
    try {
        const old = new DatabaseSync(file);
        old.exec(`
            CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
                                password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE trips (id TEXT PRIMARY KEY, driver_id TEXT NOT NULL, origin TEXT NOT NULL, destination TEXT NOT NULL,
                                origin_coords TEXT, destination_coords TEXT, departure_at TEXT NOT NULL, distance_km REAL NOT NULL,
                                seats INTEGER NOT NULL, vehicle_type TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT);
            CREATE TABLE bookings (id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, trip_id TEXT NOT NULL,
                                   passenger_id TEXT NOT NULL, seats INTEGER NOT NULL, pickup TEXT, dropoff TEXT,
                                   passenger_distance_km REAL, detour_km REAL, price_chf INTEGER NOT NULL CHECK (price_chf = 0),
                                   status TEXT NOT NULL, created_at TEXT NOT NULL, cancelled_at TEXT);
            INSERT INTO users VALUES ('u1', 'a@example.ch', 'A', 'x', '2026-10-01T00:00:00Z');
            INSERT INTO trips VALUES ('t1', 'u1', 'Lausanne', 'Genève', NULL, NULL, '2026-10-11T08:00:00.000Z', 62.5, 3, 'diesel', '2026-10-01T00:00:00Z', NULL);
            INSERT INTO bookings VALUES ('b1', 'EV-AAAAAA', 't1', 'u1', 1, NULL, NULL, NULL, NULL, 0, 'confirmed', '2026-10-02T00:00:00Z', NULL);
        `);
        old.close();

        const db = openDatabase(file);
        assert.deepEqual(db.bookings.get('b1'), {
            id: 'b1', reference: 'EV-AAAAAA', tripId: 't1', passengerId: 'u1', seats: 1, priceChf: 0,
            status: 'confirmed', createdAt: '2026-10-02T00:00:00Z'
        });
        db.bookings.setProof('b1', 'confirmed', '2026-10-11T10:00:00.000Z');
        db.bookings.setProof('b1', 'disputed', '2026-10-11T11:00:00.000Z'); // ignorée : déjà répondu
        assert.equal(db.bookings.get('b1').passengerProof, 'confirmed');
        db.close();

        // Deuxième ouverture : la migration ne refait rien et ne casse rien.
        const again = openDatabase(file);
        assert.equal(again.bookings.get('b1').passengerProofAt, '2026-10-11T10:00:00.000Z');
        again.close();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
