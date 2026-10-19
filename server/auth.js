// Comptes et sessions. Mots de passe hachés avec scrypt (sel aléatoire) ; la session est un jeton
// aléatoire transmis dans un cookie HttpOnly, dont seule l'empreinte SHA-256 est stockée en base.
import { randomBytes, scrypt, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
export const SESSION_COOKIE = 'ecovroom_session';
export const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 10;
export const RESET_TOKEN_MINUTES = 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function hashPassword(password) {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, KEY_LENGTH);
    return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
    const [scheme, salt, expected] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !expected) return false;
    const key = await scryptAsync(password, Buffer.from(salt, 'base64'), KEY_LENGTH);
    const expectedKey = Buffer.from(expected, 'base64');
    return expectedKey.length === key.length && timingSafeEqual(key, expectedKey);
}

export const hashToken = token => createHash('sha256').update(token).digest('hex');

// Empreinte calculée pour un e-mail inconnu : la connexion prend le même temps qu'il existe ou non.
const DUMMY_HASH = await hashPassword(randomUUID());

// Message d'erreur pour un nouveau mot de passe, ou null s'il est acceptable.
export function passwordProblem(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
    }
    if (password.length > 200) return 'Mot de passe trop long.';
    return null;
}

export const normalizeEmail = email => String(email ?? '').trim().toLowerCase();

// Renvoie { valid, errors, value } avec l'e-mail normalisé.
export function validateRegistration({ email, password, name }) {
    const errors = {};
    const normalizedEmail = normalizeEmail(email);
    const trimmedName = String(name ?? '').trim();
    if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) errors.email = 'Adresse e-mail invalide.';
    const problem = passwordProblem(password);
    if (problem) errors.password = problem;
    if (!trimmedName || trimmedName.length > 80) errors.name = 'Indiquez votre prénom ou un pseudonyme (80 caractères au plus).';
    return {
        valid: Object.keys(errors).length === 0,
        errors,
        value: { email: normalizedEmail, password, name: trimmedName }
    };
}

export function createAuth(db, { now = () => new Date() } = {}) {
    async function register(input) {
        const { valid, errors, value } = validateRegistration(input);
        if (!valid) return { errors };
        if (db.users.findCredentials(value.email)) return { errors: { email: 'Un compte existe déjà avec cette adresse.' } };
        const passwordHash = await hashPassword(value.password);
        try {
            const user = db.users.create({
                id: randomUUID(), email: value.email, name: value.name, passwordHash, createdAt: now().toISOString()
            });
            return { user };
        } catch (error) {
            // Inscription simultanée avec la même adresse (contrainte UNIQUE).
            if (String(error.message).includes('UNIQUE')) return { errors: { email: 'Un compte existe déjà avec cette adresse.' } };
            throw error;
        }
    }

    // Renvoie l'utilisateur, ou null si l'e-mail ou le mot de passe est faux (sans dire lequel).
    async function authenticate(email, password) {
        const found = db.users.findCredentials(normalizeEmail(email));
        const ok = await verifyPassword(String(password ?? ''), found?.passwordHash ?? DUMMY_HASH);
        return found && ok ? found.user : null;
    }

    function startSession(userId) {
        const token = randomBytes(32).toString('base64url');
        const created = now();
        const expires = new Date(created.getTime() + SESSION_DAYS * 86400000);
        db.sessions.deleteExpired(created.toISOString());
        db.sessions.create({ tokenHash: hashToken(token), userId, createdAt: created.toISOString(), expiresAt: expires.toISOString() });
        return { token, expires };
    }

    const userForToken = token => (token ? db.sessions.findUser(hashToken(token), now().toISOString()) : null);
    const endSession = token => { if (token) db.sessions.delete(hashToken(token)); };

    // Vérifie le mot de passe d'un utilisateur déjà connecté (actions sensibles).
    async function checkPassword(userId, password) {
        return verifyPassword(String(password ?? ''), db.users.passwordHash(userId) ?? DUMMY_HASH);
    }

    // Nouveau mot de passe : toutes les sessions sont fermées (un éventuel intrus est déconnecté).
    async function setPassword(userId, password) {
        const passwordHash = await hashPassword(password);
        db.users.setPasswordHash(userId, passwordHash);
        db.sessions.deleteForUser(userId);
        db.passwordResets.deleteForUser(userId);
    }

    // Lien de réinitialisation : jeton aléatoire à usage unique, seule son empreinte est stockée.
    function createResetToken(userId) {
        const token = randomBytes(32).toString('base64url');
        const created = now();
        db.passwordResets.deleteForUser(userId);
        db.passwordResets.create({
            tokenHash: hashToken(token),
            userId,
            createdAt: created.toISOString(),
            expiresAt: new Date(created.getTime() + RESET_TOKEN_MINUTES * 60000).toISOString()
        });
        return token;
    }

    // Utilisateur du jeton s'il est valide (non expiré, non utilisé), sinon null.
    const userForResetToken = token =>
        (typeof token === 'string' && token ? db.passwordResets.findUser(hashToken(token), now().toISOString()) : null);

    return {
        register, authenticate, startSession, userForToken, endSession,
        checkPassword, setPassword, createResetToken, userForResetToken
    };
}

// Limite le nombre de tentatives par clé (adresse IP, e-mail…) sur une fenêtre glissante.
export function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
    const hits = new Map();
    return {
        // true si la tentative est autorisée (et la comptabilise).
        take(key) {
            const time = now();
            const recent = (hits.get(key) ?? []).filter(t => time - t < windowMs);
            if (recent.length >= limit) {
                hits.set(key, recent);
                return false;
            }
            recent.push(time);
            hits.set(key, recent);
            return true;
        },
        reset: key => hits.delete(key)
    };
}
