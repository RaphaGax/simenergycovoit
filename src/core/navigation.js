// Liens de navigation Waze (Waze Deep Links : https://developers.google.com/waze/deeplinks).
// EcoVroom ne fait qu'ouvrir Waze vers un lieu : aucune donnée ne revient de Waze.
//   - coordonnées : https://waze.com/ul?ll=<latitude>%2C<longitude>&navigate=yes
//   - adresse     : https://waze.com/ul?q=<texte encodé> (Waze affiche les résultats de recherche)
// Attention à l'ordre : EcoVroom stocke [longitude, latitude] (format GeoJSON / ORS),
// Waze attend latitude puis longitude.
import { isValidCoords } from './geo.js';

export const WAZE_BASE_URL = 'https://waze.com/ul';
export const WAZE_UTM_SOURCE = 'ecovroom';
const MIN_LABEL_LENGTH = 3;
const MAX_LABEL_LENGTH = 200;

// Coordonnées utilisables : valides et différentes de (0, 0), valeur typique d'une donnée absente.
function reliableCoords(coords) {
    return isValidCoords(coords) && !(coords[0] === 0 && coords[1] === 0);
}

const query = params => Object.entries(params)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('&');

// place : { label, coords } (coords facultatives, [lon, lat]).
// Renvoie { ok: true, url, label, precise } ou { ok: false, reason } — jamais de destination inventée.
export function buildWazeLink(place) {
    const label = String(place?.label ?? '').trim().replace(/\s+/g, ' ');

    if (reliableCoords(place?.coords)) {
        const [lon, lat] = place.coords;
        const url = `${WAZE_BASE_URL}?${query({
            ll: `${lat.toFixed(6)},${lon.toFixed(6)}`,
            navigate: 'yes',
            utm_source: WAZE_UTM_SOURCE
        })}`;
        return { ok: true, url, label, precise: true };
    }

    if (label.length >= MIN_LABEL_LENGTH && label.length <= MAX_LABEL_LENGTH) {
        const url = `${WAZE_BASE_URL}?${query({ q: label, utm_source: WAZE_UTM_SOURCE })}`;
        return { ok: true, url, label, precise: false };
    }

    return {
        ok: false,
        reason: label ? 'Destination invalide : impossible de la transmettre à Waze.' : 'Destination manquante pour ce trajet.'
    };
}

// Destination du conducteur : l'arrivée de son trajet.
export function driverDestination(trip) {
    return { label: trip?.destination, coords: trip?.destinationCoords ?? null };
}

// Destination du passager : son point de rendez-vous (prise en charge choisie lors de la recherche
// par itinéraire, sinon le départ du trajet).
export function passengerMeetingPoint(booking, trip) {
    if (booking?.pickup) return { label: booking.pickup.label, coords: booking.pickup.coords ?? null };
    return { label: trip?.origin, coords: trip?.originCoords ?? null };
}
