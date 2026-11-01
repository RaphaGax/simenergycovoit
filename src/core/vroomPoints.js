// VroomPoints : la récompense des aventuriers EcoVroom, conducteurs et passagers.
// 1 VroomPoint = 1 kg de CO₂ évité (calcul EcoVroom, voir co2.js) ; ce ne sont pas des crédits carbone
// certifiés. Le CO₂ évité exact reste enregistré trajet par trajet (carbonCredits.js), pour pouvoir
// relier plus tard les VroomPoints à de vrais crédits carbone.
//
// Règles du jeu :
// - un trajet de moins de MIN_DISTANCE_KM ne rapporte rien ;
// - les points maximum d'un trajet = CO₂ évité (en kg) si toutes les places proposées sont occupées ;
// - courbe de Pareto : une voiture à moitié pleine rapporte déjà 80 % du maximum, pleine 100 % ;
// - partage : moitié pour le conducteur, moitié pour les passagers au prorata de leurs places ;
// - seules les places confirmées par leur passager comptent (double confirmation, tripProof.js) ;
// - nombres entiers ; un participant d'un trajet qui rapporte des points en reçoit au moins 1.
// Fonctions pures : la date courante est fournie par l'appelant.
import { BOOKING_STATUS, hasDeparted } from './booking.js';
import { co2AvoidedForTrip } from './co2.js';
import { PASSENGER_PROOF, summarizeProof } from './tripProof.js';

export const KG_CO2_PER_POINT = 1;
export const MIN_DISTANCE_KM = 3;
export const HALF_FULL_SHARE = 0.8;
export const DRIVER_SHARE = 0.5;
// 1 − (1 − ½)^k = 0,8  ⇒  k = ln(0,2) / ln(0,5) ≈ 2,32
export const PARETO_EXPONENT = Math.log(1 - HALF_FULL_SHARE) / Math.log(0.5);

export const POINTS_STATUS = Object.freeze({
    EARNED: 'earned', // acquis : trajet confirmé par le conducteur et réponses des passagers closes
    PENDING: 'pending' // provisoire : en attente d'une confirmation
});

export const LEVELS = Object.freeze([
    { name: 'Explorateur', min: 0 },
    { name: 'Éclaireur', min: 25 },
    { name: 'Pionnier', min: 150 },
    { name: 'Légende', min: 500 }
]);

// Part des points selon le remplissage (places occupées / places proposées), entre 0 et 1.
export function occupancyShare(filledSeats, offeredSeats) {
    if (!(offeredSeats > 0) || !(filledSeats > 0)) return 0;
    const rate = Math.min(1, filledSeats / offeredSeats);
    return 1 - (1 - rate) ** PARETO_EXPONENT;
}

// Points maximum (non arrondis) d'un trajet : CO₂ évité en kg avec toutes les places occupées.
export function maxTripPoints(trip) {
    if (!(trip.distanceKm >= MIN_DISTANCE_KM)) return 0;
    const avoidedG = co2AvoidedForTrip({ distanceKm: trip.distanceKm, vehicleType: trip.vehicleType, passengers: trip.seats });
    return avoidedG / 1000 / KG_CO2_PER_POINT;
}

const toPoints = value => (value > 0 ? Math.max(1, Math.round(value)) : 0);

// Points d'un trajet pour un ensemble de réservations comptées (places occupées).
// Renvoie { maxPoints, filledSeats, share, driverPoints, passengerPoints: Map(bookingId → points) }.
export function splitTripPoints(trip, countedBookings) {
    const max = maxTripPoints(trip);
    const filledSeats = countedBookings.reduce((sum, b) => sum + b.seats, 0);
    const share = occupancyShare(filledSeats, trip.seats);
    const pool = max * share;
    const passengerPool = pool * (1 - DRIVER_SHARE);
    return {
        maxPoints: Math.round(max),
        filledSeats,
        share,
        driverPoints: toPoints(pool * DRIVER_SHARE),
        passengerPoints: new Map(countedBookings.map(b => [b.id, toPoints(passengerPool * b.seats / filledSeats)]))
    };
}

// Estimation pour chaque remplissage possible (1 à trip.seats places) : { passengers, driverPoints, passengerPoints }
// (passengerPoints : pour un passager avec une place).
export function pointsBySeatsFilled(trip) {
    return Array.from({ length: trip.seats }, (_, index) => {
        const passengers = index + 1;
        const bookings = Array.from({ length: passengers }, (__, i) => ({ id: i, seats: 1 }));
        const split = splitTripPoints(trip, bookings);
        return { passengers, driverPoints: split.driverPoints, passengerPoints: split.passengerPoints.get(0) };
    });
}

const activeBookings = (trip, bookings) =>
    bookings.filter(b => b.tripId === trip.id && b.status === BOOKING_STATUS.CONFIRMED);
const isProven = b => b.passengerProof === PASSENGER_PROOF.CONFIRMED;

// Points du trajet avec les seules places confirmées par leur passager.
export function tripPoints(trip, bookings) {
    return splitTripPoints(trip, activeBookings(trip, bookings).filter(isProven));
}

// Entrée du conducteur pour un trajet parti avec des passagers, ou null.
export function driverEntry(trip, bookings, now) {
    if (!hasDeparted(trip, now) || activeBookings(trip, bookings).length === 0) return null;
    const settled = Boolean(trip.completedAt) && summarizeProof(trip, bookings, now).closed;
    const points = tripPoints(trip, bookings).driverPoints;
    if (settled && points === 0) return null;
    return {
        tripId: trip.id,
        role: 'driver',
        points,
        status: settled ? POINTS_STATUS.EARNED : POINTS_STATUS.PENDING,
        awaiting: trip.completedAt ? 'passengers' : 'driver'
    };
}

// Entrée d'un passager pour sa réservation, ou null (trajet pas encore parti, réservation annulée,
// trajet contesté, ou délai de réponse passé sans réponse). Sans réponse, les points indiqués sont
// ceux que le passager gagnerait en confirmant.
export function passengerEntry(booking, trip, bookings, now) {
    if (booking.status !== BOOKING_STATUS.CONFIRMED || !hasDeparted(trip, now)) return null;
    if (booking.passengerProof === PASSENGER_PROOF.DISPUTED) return null;
    const proof = summarizeProof(trip, bookings, now);
    const answered = isProven(booking);
    if (!answered && proof.closed) return null;

    const counted = activeBookings(trip, bookings).filter(b => isProven(b) || b.id === booking.id);
    const points = splitTripPoints(trip, counted).passengerPoints.get(booking.id) ?? 0;
    const settled = answered && Boolean(trip.completedAt) && proof.closed;
    if (settled && points === 0) return null;
    return {
        tripId: trip.id,
        bookingId: booking.id,
        role: 'passenger',
        points,
        status: settled ? POINTS_STATUS.EARNED : POINTS_STATUS.PENDING,
        awaiting: !answered ? 'you' : trip.completedAt ? 'passengers' : 'driver'
    };
}

// Niveau d'aventurier atteint et progression vers le suivant.
export function levelFor(points) {
    let index = 0;
    while (index + 1 < LEVELS.length && points >= LEVELS[index + 1].min) index += 1;
    const level = LEVELS[index];
    const next = LEVELS[index + 1] ?? null;
    return {
        name: level.name,
        rank: index + 1,
        next,
        progress: next ? (points - level.min) / (next.min - level.min) : 1
    };
}

// Totaux d'une liste d'entrées : { earned, pending }.
export function totalPoints(entries) {
    const totals = { earned: 0, pending: 0 };
    for (const entry of entries) totals[entry.status] += entry.points;
    return totals;
}
