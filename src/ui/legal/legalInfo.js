// Informations légales de l'exploitant, reprises dans les pages Confidentialité, Conditions et Contact.
// Les valeurs entre crochets sont À COMPLÉTER par l'exploitant (aucune n'est inventée) : tant qu'il
// en reste, les pages affichent un avertissement « projet de texte ».
export const LEGAL = Object.freeze({
    operator: 'Association EcoVroom',
    legalForm: 'association à but non lucratif',
    ide: 'CHE-318.456.016',
    address: 'Chemin de Mouille-Galand 2C, 1214 Vernier, Suisse',
    contactEmail: 'info@ecovroom.org',
    privacyEmail: 'info@ecovroom.org',
    forum: 'Genève',
    minimumPassengerAge: 16, // seul, sans être accompagné
    minimumDriverAge: 18,
    updatedOn: '5 novembre 2026',
    // Sous-traitants réellement utilisés par l'application (voir server/ et render.yaml).
    processors: Object.freeze([
        { name: 'Render Services, Inc.', role: 'hébergement du site, du serveur et de la base de données',
            location: 'États-Unis (région choisie dans Render, à vérifier)' },
        { name: 'Resend (Plus Five Five, Inc.)', role: 'envoi des e-mails (mot de passe oublié, trajet annulé)',
            location: 'États-Unis ou Union européenne selon la région choisie dans Resend (à vérifier)' },
        { name: 'HeiGIT gGmbH (openrouteservice)', role: 'suggestions d’adresses, distances et itinéraires',
            location: 'Allemagne' }
    ])
});

export const hasPlaceholders = () =>
    Object.values(LEGAL).some(value => typeof value === 'string' && value.startsWith('[À compléter'))
    || LEGAL.processors.some(p => p.location.includes('à vérifier'));
