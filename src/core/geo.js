// Coordonnées au format ORS / GeoJSON : [longitude, latitude].
const EARTH_RADIUS_KM = 6371;

export function isValidCoords(coords) {
    return Array.isArray(coords)
        && coords.length === 2
        && Number.isFinite(coords[0]) && Math.abs(coords[0]) <= 180
        && Number.isFinite(coords[1]) && Math.abs(coords[1]) <= 90;
}

// Distance à vol d'oiseau (formule de haversine), utilisée pour présélectionner les trajets.
export function haversineKm([lon1, lat1], [lon2, lat2]) {
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}
