// Outils HTTP sans framework : erreurs, JSON, cookies, routage et fichiers statiques.
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export class HttpError extends Error {
    constructor(status, message, { fields } = {}) {
        super(message);
        this.status = status;
        this.fields = fields;
    }
}

const MAX_BODY_BYTES = 100 * 1024;

export async function readJson(req) {
    const type = req.headers['content-type'] ?? '';
    if (!type.startsWith('application/json')) throw new HttpError(415, 'Contenu JSON attendu.');
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Requête trop volumineuse.');
        chunks.push(chunk);
    }
    if (size === 0) return {};
    try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error('objet attendu');
        return body;
    } catch {
        throw new HttpError(400, 'JSON invalide.');
    }
}

export function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
}

export function parseCookies(header = '') {
    const cookies = {};
    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
    return cookies;
}

// Adresse IP du visiteur. Derrière un hébergeur (Render…), la connexion vient du proxy :
// chaque proxy de confiance ajoute à la FIN de X-Forwarded-For l'adresse qui l'a contacté.
// On remonte donc de `trustedHops` positions depuis la fin de [X-Forwarded-For…, adresse du socket].
// Les valeurs placées plus à gauche viennent du visiteur lui-même et ne sont jamais crues.
// trustedHops = 0 (par défaut) : X-Forwarded-For est ignoré.
export function clientIp(req, trustedHops = 0) {
    const socketIp = req.socket?.remoteAddress ?? 'inconnu';
    if (!(Number.isInteger(trustedHops) && trustedHops > 0)) return socketIp;
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    const chain = [...forwarded, socketIp];
    return chain[Math.max(0, chain.length - 1 - trustedHops)];
}

export function serializeCookie(name, value, { maxAge, secure }) {
    return [
        `${name}=${encodeURIComponent(value)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAge}`,
        ...(secure ? ['Secure'] : [])
    ].join('; ');
}

// Routes « METHOD /chemin/:param » ; renvoie { handler, params } ou null.
export function createRouter(routes) {
    const compiled = routes.map(([method, pattern, handler]) => ({ method, parts: pattern.split('/'), handler }));
    return function match(method, path) {
        const pathParts = path.split('/');
        for (const route of compiled) {
            if (route.method !== method || route.parts.length !== pathParts.length) continue;
            const params = {};
            const ok = route.parts.every((part, i) => {
                if (part.startsWith(':')) {
                    if (!pathParts[i]) return false;
                    params[part.slice(1)] = decodeURIComponent(pathParts[i]);
                    return true;
                }
                return part === pathParts[i];
            });
            if (ok) return { handler: route.handler, params };
        }
        return null;
    };
}

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

// Sert uniquement les fichiers publics de l'application : jamais server/, la base, .git ou les tests.
export function createStaticHandler(rootDir) {
    const root = resolve(rootDir);
    const PUBLIC_FILES = new Set(['/index.html', '/fleet.html', '/styles.css']);

    return async function serveStatic(path, res, headers) {
        let decoded;
        try {
            decoded = decodeURIComponent(path === '/' ? '/index.html' : path);
        } catch {
            return false;
        }
        if (decoded.includes('\0') || decoded.split('/').includes('..')) return false;
        if (!PUBLIC_FILES.has(decoded) && !decoded.startsWith('/src/')) return false;
        if (!CONTENT_TYPES[extname(decoded)]) return false;

        const file = resolve(root, `.${decoded}`);
        if (!file.startsWith(root + sep)) return false;
        try {
            const content = await readFile(file);
            res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)], 'Cache-Control': 'no-cache', ...headers });
            res.end(content);
            return true;
        } catch {
            return false;
        }
    };
}
