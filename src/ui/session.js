// Identités locales en attendant l'authentification.
// TODO: remplacer par l'utilisateur connecté.
export const LOCAL_DRIVER_ID = 'conducteur-local';
export const LOCAL_PASSENGER_ID = 'passager-local';

// Identifiant technique et référence lisible (« EV-3F9A2C ») d'une nouvelle réservation.
export function newBookingIds() {
    const id = crypto.randomUUID();
    return { id, reference: `EV-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}` };
}
