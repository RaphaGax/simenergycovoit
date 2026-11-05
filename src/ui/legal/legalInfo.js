// Informations légales de l'exploitant, reprises dans les pages Confidentialité, Conditions et Contact.
// Les valeurs entre crochets sont À COMPLÉTER par l'exploitant (aucune n'est inventée) : tant qu'il
// en reste, les pages affichent un avertissement « projet de texte ».
export const LEGAL = Object.freeze({
    operator: '[À compléter : nom de l’exploitant ou de la société]',
    address: '[À compléter : adresse postale complète, Suisse]',
    contactEmail: '[À compléter : adresse e-mail de contact, ex. contact@ecovroom.org]',
    privacyEmail: '[À compléter : adresse e-mail pour la protection des données]',
    forum: '[À compléter : for juridique, ex. Lausanne]',
    minimumAge: 16,
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
