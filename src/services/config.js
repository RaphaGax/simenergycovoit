// Configuration de l'application. La clé openrouteservice se place dans src/config.local.js
// (non versionné, voir src/config.local.example.js). Sans clé, l'application fonctionne sans
// géocodage ni itinéraires : distance saisie à la main et recherche par nom de lieu.
const DEFAULTS = Object.freeze({ orsApiKey: '' });

export async function loadConfig() {
    try {
        const local = await import('../config.local.js');
        return { ...DEFAULTS, ...local.default };
    } catch {
        return DEFAULTS;
    }
}
