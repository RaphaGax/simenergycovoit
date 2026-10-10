// Point d'entrée du serveur EcoVroom.
//   PORT            port d'écoute (8000 par défaut)
//   DATABASE_PATH   fichier SQLite (data/ecovroom.db par défaut)
//   ORS_API_KEY     clé openrouteservice (facultative : sans clé, pas de géocodage ni d'itinéraires)
//   COOKIE_SECURE   « 1 » pour des cookies réservés à HTTPS (obligatoire en production)
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { createOrsClient } from '../src/services/orsClient.js';

// Les dates « du jour » (recherche par date) suivent l'heure suisse, quel que soit l'hébergeur.
process.env.TZ ??= 'Europe/Zurich';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8000);
const databasePath = process.env.DATABASE_PATH ?? resolve(rootDir, 'data/ecovroom.db');

if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
const db = openDatabase(databasePath);
const ors = process.env.ORS_API_KEY ? createOrsClient({ apiKey: process.env.ORS_API_KEY }) : null;

const server = createServer(createApp({
    db,
    ors,
    staticDir: rootDir,
    secureCookies: process.env.COOKIE_SECURE === '1'
}));

server.listen(port, () => {
    console.log(`EcoVroom : http://localhost:${port}/ (itinéraires ${ors ? 'activés' : 'désactivés : ORS_API_KEY absente'})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
