// Validation et normalisation des paramètres de simulation.
// Utilisée côté client (retour immédiat) et côté serveur (source de vérité).

import { ASSUMPTIONS, DEFAULT_INPUT, VEHICLE_TYPES } from './vehicles.js';

export const LIMITS = Object.freeze({
    totalCars: { min: 1, max: 100000, integer: true, label: 'Nombre total de voitures' },
    aiRequests: { min: 0, max: 10000, integer: false, label: 'Requêtes IA par utilisateur/jour' },
    dailyKm: { min: 0, max: 2000, integer: false, label: 'Distance quotidienne (km)' },
    daysPerYear: { min: 1, max: 366, integer: true, label: 'Jours de circulation par an' },
    occupancy: { min: 0.01, max: 1, integer: false, label: 'Taux de remplissage' }
});

function toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value.replace(',', '.'));
    return NaN;
}

function checkField(name, raw, errors) {
    const rule = LIMITS[name];
    const value = raw === undefined ? DEFAULT_INPUT[name] : toNumber(raw);
    if (!Number.isFinite(value)) {
        errors.push({ field: name, message: `${rule.label} doit être un nombre.` });
        return undefined;
    }
    if (rule.integer && !Number.isInteger(value)) {
        errors.push({ field: name, message: `${rule.label} doit être un nombre entier.` });
        return undefined;
    }
    if (value < rule.min || value > rule.max) {
        errors.push({ field: name, message: `${rule.label} doit être compris entre ${rule.min} et ${rule.max}.` });
        return undefined;
    }
    return value;
}

export function sumMix(mix) {
    return VEHICLE_TYPES.reduce((sum, type) => sum + (Number(mix?.[type]) || 0), 0);
}

/**
 * Valide une entrée brute (formulaire ou corps JSON).
 * @returns {{ valid: boolean, errors: {field: string, message: string}[], value: object|null }}
 */
export function validateInput(raw) {
    const errors = [];
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { valid: false, errors: [{ field: '', message: 'Les paramètres doivent être un objet.' }], value: null };
    }

    const value = {};
    for (const name of Object.keys(LIMITS)) {
        value[name] = checkField(name, raw[name], errors);
    }

    const rawMix = raw.mix === undefined ? DEFAULT_INPUT.mix : raw.mix;
    if (rawMix === null || typeof rawMix !== 'object' || Array.isArray(rawMix)) {
        errors.push({ field: 'mix', message: 'La répartition du parc doit être un objet.' });
    } else {
        const unknown = Object.keys(rawMix).filter(type => !VEHICLE_TYPES.includes(type));
        if (unknown.length > 0) {
            errors.push({ field: 'mix', message: `Type(s) de véhicule inconnu(s) : ${unknown.join(', ')}.` });
        }
        const mix = {};
        for (const type of VEHICLE_TYPES) {
            const pct = rawMix[type] === undefined ? 0 : toNumber(rawMix[type]);
            if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                errors.push({ field: `mix.${type}`, message: `Le pourcentage « ${type} » doit être compris entre 0 et 100.` });
            }
            mix[type] = pct;
        }
        const total = sumMix(mix);
        if (Number.isFinite(total) && Math.abs(total - 100) > ASSUMPTIONS.pctTolerance) {
            errors.push({ field: 'mix', message: `La somme des pourcentages doit être égale à 100 % (actuellement ${Math.round(total * 10) / 10} %).` });
        }
        value.mix = mix;
    }

    return errors.length > 0
        ? { valid: false, errors, value: null }
        : { valid: true, errors, value };
}
