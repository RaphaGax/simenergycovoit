// Point d'entrée du serveur EcoVroom.
//   PORT            port d'écoute (8000 par défaut)
//   DATABASE_PATH   fichier SQLite (data/ecovroom.db par défaut)
//   ORS_API_KEY     clé openrouteservice (facultative : sans clé, pas de géocodage ni d'itinéraires)
//   COOKIE_SECURE   « 1 » pour des cookies réservés à HTTPS (obligatoire en production)
//   TRUST_PROXY_HOPS nombre de proxys de confiance devant le serveur (1 sur Render) pour lire
//                   l'adresse du visiteur dans X-Forwarded-For ; 0 par défaut (en-tête ignoré)
//   DEBUG_CLIENT_IP « 1 » pour journaliser temporairement les adresses lors des connexions
//   PUBLIC_URL      adresse publique du site pour les liens envoyés par e-mail (sur Render : automatique)
//   RESEND_API_KEY, MAIL_FROM  envoi des e-mails (mot de passe oublié) ; MAIL_TRANSPORT=console en développement
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createApp } from './app.js';
import { createOrsClient } from '../src/services/orsClient.js';
import { createMailer, publicUrl } from './mailer.js';

// Les dates « du jour » (recherche par date) suivent l'heure suisse, quel que soit l'hébergeur.
process.env.TZ ??= 'Europe/Zurich';

function trustProxyHops() {
    const value = Number(process.env.TRUST_PROXY_HOPS ?? 0);
    if (!Number.isInteger(value) || value < 0 || value > 5) {
        throw new Error(`TRUST_PROXY_HOPS invalide : ${process.env.TRUST_PROXY_HOPS} (entier de 0 à 5 attendu)`);
    }
    return value;
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8000);
const databasePath = process.env.DATABASE_PATH ?? resolve(rootDir, 'data/ecovroom.db');

if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
const db = openDatabase(databasePath);
const ors = process.env.ORS_API_KEY ? createOrsClient({ apiKey: process.env.ORS_API_KEY }) : null;
const mailer = createMailer(process.env);
const siteUrl = publicUrl(process.env);
if (mailer && !siteUrl) console.warn('E-mails configurés mais PUBLIC_URL absente ou invalide : « mot de passe oublié » désactivé.');

const server = createServer(createApp({
    db,
    ors,
    staticDir: rootDir,
    secureCookies: process.env.COOKIE_SECURE === '1',
    trustProxyHops: trustProxyHops(),
    debugClientIp: process.env.DEBUG_CLIENT_IP === '1',
    mailer,
    publicUrl: siteUrl
}));

server.listen(port, () => {
    console.log(`EcoVroom : http://localhost:${port}/ (itinéraires ${ors ? 'activés' : 'désactivés : ORS_API_KEY absente'}, `
        + `mot de passe oublié ${mailer && siteUrl ? `activé (${mailer.name})` : 'désactivé'})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
}
