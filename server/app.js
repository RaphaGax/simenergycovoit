// Serveur HTTP d'EcoVroom light : API JSON + fichiers statiques. Aucune dépendance externe.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSUMPTIONS, DEFAULT_INPUT, VEHICLES } from '../public/js/core/vehicles.js';
import { simulate, ValidationError } from '../public/js/core/simulator.js';
import { ScenarioStore, StoreError } from './storage.js';

export const VERSION = '1.0.0';
export const MAX_BODY_BYTES = 100 * 1024;
export const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

class HttpError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

async function readJsonBody(req) {
    const type = req.headers['content-type'] || '';
    if (!type.includes('application/json')) {
        throw new HttpError(415, 'Le corps de la requête doit être au format application/json.');
    }
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Corps de requête trop volumineux.');
        chunks.push(chunk);
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
    } catch {
        throw new HttpError(400, 'JSON invalide.');
    }
}

function runSimulation(input) {
    try {
        return simulate(input);
    } catch (error) {
        if (error instanceof ValidationError) {
            throw new HttpError(400, 'Paramètres invalides.', error.errors);
        }
        throw error;
    }
}

function summarize(result) {
    return {
        totalCars: result.totals.cars,
        totalSeats: result.totals.seats,
        energyPerKm: result.totals.energy,
        co2PerKm: result.totals.co2,
        annualEnergy: result.annual.energy,
        annualCo2Kg: result.annual.co2Kg,
        co2SavingsKg: result.annual.savings.co2Kg
    };
}

function createApiRoutes(store) {
    return [
        ['GET', /^\/api\/health$/, () => [200, { status: 'ok', version: VERSION }]],
        ['GET', /^\/api\/vehicles$/, () => [200, { vehicles: VEHICLES, defaults: DEFAULT_INPUT, assumptions: ASSUMPTIONS }]],
        ['POST', /^\/api\/simulate$/, async req => [200, runSimulation(await readJsonBody(req))]],
        ['GET', /^\/api\/scenarios$/, () => [200, { scenarios: store.list() }]],
        ['POST', /^\/api\/scenarios$/, async req => {
            const body = await readJsonBody(req);
            if (body === null || typeof body !== 'object') {
                throw new HttpError(400, 'Le corps doit contenir { name, input }.');
            }
            const result = runSimulation(body.input);
            const scenario = await store.create({ name: body.name, input: result.input, summary: summarize(result) });
            return [201, scenario];
        }],
        ['GET', /^\/api\/scenarios\/([\w-]+)$/, (req, [id]) => {
            const scenario = store.get(id);
            if (!scenario) throw new HttpError(404, 'Scénario introuvable.');
            return [200, scenario];
        }],
        ['DELETE', /^\/api\/scenarios\/([\w-]+)$/, async (req, [id]) => {
            if (!(await store.delete(id))) throw new HttpError(404, 'Scénario introuvable.');
            return [204, null];
        }]
    ];
}

async function serveStatic(req, res, publicDir, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        throw new HttpError(405, 'Méthode non autorisée.');
    }
    let relative;
    try {
        relative = decodeURIComponent(pathname);
    } catch {
        throw new HttpError(400, 'Chemin invalide.');
    }
    if (relative.endsWith('/')) relative += 'index.html';
    const root = resolve(publicDir);
    const filePath = resolve(join(root, normalize(relative)));
    if (filePath !== root && !filePath.startsWith(root + sep)) {
        throw new HttpError(403, 'Accès interdit.');
    }
    let info;
    try {
        info = await stat(filePath);
    } catch {
        throw new HttpError(404, 'Ressource introuvable.');
    }
    if (!info.isFile()) throw new HttpError(404, 'Ressource introuvable.');

    const body = await readFile(filePath);
    res.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
}

/** Construit le gestionnaire de requêtes (utilisable sans écouter de port). */
export function createHandler({ store = new ScenarioStore(), publicDir = DEFAULT_PUBLIC_DIR, logger = console } = {}) {
    const routes = createApiRoutes(store);

    return async function handler(req, res) {
        const { pathname } = new URL(req.url, 'http://localhost');
        try {
            if (pathname === '/api' || pathname.startsWith('/api/')) {
                const matches = routes.filter(([, pattern]) => pattern.test(pathname));
                if (matches.length === 0) throw new HttpError(404, 'Route inconnue.');
                const route = matches.find(([method]) => method === req.method);
                if (!route) {
                    res.setHeader('Allow', matches.map(([method]) => method).join(', '));
                    throw new HttpError(405, 'Méthode non autorisée.');
                }
                const params = pathname.match(route[1]).slice(1);
                const [status, payload] = await route[2](req, params);
                if (status === 204) {
                    res.writeHead(204);
                    res.end();
                } else {
                    sendJson(res, status, payload);
                }
                return;
            }
            await serveStatic(req, res, publicDir, pathname);
        } catch (error) {
            if (error instanceof HttpError || error instanceof StoreError) {
                const payload = { error: error.message };
                if (error.details) payload.details = error.details;
                sendJson(res, error.status, payload);
                return;
            }
            logger.error('Erreur interne :', error);
            sendJson(res, 500, { error: 'Erreur interne du serveur.' });
        }
    };
}

export function createApp(options) {
    return createServer(createHandler(options));
}
