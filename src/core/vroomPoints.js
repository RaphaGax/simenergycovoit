// VroomPoints : les points des aventuriers EcoVroom, conducteurs et passagers.
// Ce sont des points, pas des crédits carbone. Le CO₂ évité exact reste enregistré trajet par
// trajet (carbonCredits.js) : c'est lui, et lui seul, qui pourra un jour être certifié.
//
// Règles :
// - production : il faut un conducteur et au moins un passager confirmé ; les points produits par un
//   trajet = le CO₂ réellement évité par ses passagers confirmés, en kg (co2AvoidedForBooking, détour
//   déduit). La production est donc proportionnelle au remplissage : jamais de bonus ;
// - rien sous MIN_DISTANCE_KM ;
// - partage : la part du conducteur dépend des sièges occupés dans la voiture (passagers EcoVroom,
//   famille, marchandise) : 50 % avec un seul siège occupé, 80 % voiture pleine, par paliers réguliers
//   entre les deux ; le reste va aux passagers au prorata de leurs places ;
// - chaque part est arrondie à l'entier le plus proche (pas de minimum).
// Fonctions pures : la date courante est fournie par l'appelant.
import { BOOKING_STATUS, hasDeparted } from './booking.js';
import { co2AvoidedForTrip, co2AvoidedForBooking } from './co2.js';
import { PASSENGER_PROOF, summarizeProof } from './tripProof.js';

export const KG_CO2_PER_POINT = 1;
export const MIN_DISTANCE_KM = 3;
export const DRIVER_SHARE_MIN = 0.5; // un seul siège occupé
export const DRIVER_SHARE_MAX = 0.8; // voiture pleine

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

// Sièges passagers de la voiture et sièges occupés hors EcoVroom (famille, marchandise).
// Trajets publiés avant ces champs : la voiture compte les seules places proposées.
export function carOccupancy(trip) {
    return { carSeats: trip.carSeats ?? trip.seats, otherOccupiedSeats: trip.otherOccupiedSeats ?? 0 };
}

// Part du conducteur selon le nombre de sièges occupés (passagers EcoVroom compris).
export function driverShare(occupiedSeats, carSeats) {
    if (carSeats <= 1) return DRIVER_SHARE_MAX;
    const occupied = Math.min(Math.max(occupiedSeats, 1), carSeats);
    return DRIVER_SHARE_MIN + (DRIVER_SHARE_MAX - DRIVER_SHARE_MIN) * (occupied - 1) / (carSeats - 1);
}

const eligible = trip => trip.distanceKm >= MIN_DISTANCE_KM;
const toPoints = kg => Math.round(kg / KG_CO2_PER_POINT);

// Partage de pointsKg (CO₂ évité, en kg) entre le conducteur et les réservations comptées.
// Renvoie { co2AvoidedKg, filledSeats, driverShare, driverPoints, passengerPoints: Map(bookingId → points) }.
export function splitPoints(trip, countedBookings, co2AvoidedKg) {
    const filledSeats = countedBookings.reduce((sum, b) => sum + b.seats, 0);
    const pool = eligible(trip) && filledSeats > 0 ? co2AvoidedKg : 0;
    const { carSeats, otherOccupiedSeats } = carOccupancy(trip);
    const share = filledSeats > 0 ? driverShare(otherOccupiedSeats + filledSeats, carSeats) : 0;
    return {
        co2AvoidedKg: pool,
        filledSeats,
        driverShare: share,
        driverPoints: toPoints(pool * share),
        passengerPoints: new Map(countedBookings.map(b => [b.id, toPoints(pool * (1 - share) * b.seats / filledSeats)]))
    };
}

const bookingsCo2Kg = (trip, bookings) => bookings.reduce((sum, b) => sum + co2AvoidedForBooking(trip, b), 0) / 1000;

// Estimation avant le départ, pour chaque nombre de passagers (1 place chacun, trajet complet) :
// { passengers, co2AvoidedKg, driverShare, driverPoints, passengerPoints }.
export function pointsBySeatsFilled(trip) {
    return Array.from({ length: trip.seats }, (_, index) => {
        const passengers = index + 1;
        const bookings = Array.from({ length: passengers }, (__, i) => ({ id: i, seats: 1 }));
        const kg = co2AvoidedForTrip({ distanceKm: trip.distanceKm, vehicleType: trip.vehicleType, passengers }) / 1000;
        const split = splitPoints(trip, bookings, kg);
        return {
            passengers,
            co2AvoidedKg: split.co2AvoidedKg,
            driverShare: split.driverShare,
            driverPoints: split.driverPoints,
            passengerPoints: split.passengerPoints.get(0)
        };
    });
}

const activeBookings = (trip, bookings) =>
    bookings.filter(b => b.tripId === trip.id && b.status === BOOKING_STATUS.CONFIRMED);
const isProven = b => b.passengerProof === PASSENGER_PROOF.CONFIRMED;

const splitCounted = (trip, counted) => splitPoints(trip, counted, bookingsCo2Kg(trip, counted));

// Points du trajet avec les seules places confirmées par leur passager.
export function tripPoints(trip, bookings) {
    return splitCounted(trip, activeBookings(trip, bookings).filter(isProven));
}

// Entrée du conducteur pour un trajet parti avec des passagers, ou null. Les points en attente
// ne comptent que les passagers ayant déjà confirmé.
export function driverEntry(trip, bookings, now) {
    if (!hasDeparted(trip, now) || activeBookings(trip, bookings).length === 0) return null;
    const settled = Boolean(trip.completedAt) && summarizeProof(trip, bookings, now).closed;
    const proven = activeBookings(trip, bookings).filter(isProven);
    if (settled && proven.length === 0) return null; // tous ont contesté ou n'ont pas répondu
    return {
        tripId: trip.id,
        role: 'driver',
        points: splitCounted(trip, proven).driverPoints,
        co2AvoidedKg: bookingsCo2Kg(trip, proven),
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
    const points = splitCounted(trip, counted).passengerPoints.get(booking.id) ?? 0;
    const settled = answered && Boolean(trip.completedAt) && proof.closed;
    return {
        tripId: trip.id,
        bookingId: booking.id,
        role: 'passenger',
        points,
        co2AvoidedKg: bookingsCo2Kg(trip, [booking]),
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

// Totaux d'une liste d'entrées : { earned, pending, co2AvoidedKg } (CO₂ des seules entrées acquises).
export function totalPoints(entries) {
    const totals = { earned: 0, pending: 0, co2AvoidedKg: 0 };
    for (const entry of entries) {
        totals[entry.status] += entry.points;
        if (entry.status === POINTS_STATUS.EARNED) totals.co2AvoidedKg += entry.co2AvoidedKg ?? 0;
    }
    return totals;
}
