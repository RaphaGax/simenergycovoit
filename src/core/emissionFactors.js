// Facteurs par motorisation, partagés par l'application (CO₂, VroomPoints) et le simulateur de parc.
//
// Source officielle des émissions et de l'énergie : Office fédéral de l'énergie (OFEN/BFE),
// « Energieverbrauch und Energieeffizienz der neuen Personenwagen und leichten Nutzfahrzeuge 2025 »
// (23 juin 2026), tableau 1 « Mittlere Kennzahlen pro Treibstoffart, für alle PW-Neufahrzeuge » :
// moyennes des voitures de tourisme neuves immatriculées en Suisse en 2025, valeurs normalisées WLTP.
// Gaz naturel (CNG) : aucune immatriculation en 2025, valeurs du rapport 2024 (26 juin 2025, tableau 3).
// - co2 : g CO₂/km à l'échappement (« Tank-to-Wheel » : 0 pour l'électricité et l'hydrogène, comme l'OFEN).
// - energy : kWh/km, à partir des litres équivalent essence (BÄ) de l'OFEN, avec son facteur
//   0,11 L BÄ par kWh (ordonnance VEE-PLS, RS 730.022.2) : 1 L BÄ = 1 / 0,11 kWh.
// - nox, so2 (g/km) et seats : valeurs d'origine du simulateur (ancien script.js), non couvertes par l'OFEN.
//   TODO: source pour nox et so2.
const KWH_PER_LITRE_PETROL_EQUIVALENT = 1 / 0.11;
const fromPetrolEquivalent = litresPer100Km => litresPer100Km * KWH_PER_LITRE_PETROL_EQUIVALENT / 100;

export const VEHICLE_PROFILES = Object.freeze({
    // Elektrisch : 17,12 kWh/100 km
    electric: Object.freeze({ energy: 17.12 / 100, co2: 0, nox: 0, so2: 0, seats: 4 }),
    // Benzin-PHEV : 1,25 L d'essence + 20,28 kWh/100 km (cumulés) ; 29,0 g CO₂/km
    hybridPlug: Object.freeze({ energy: 20.28 / 100 + fromPetrolEquivalent(1.25), co2: 29.0, nox: 0.02, so2: 0.01, seats: 4 }),
    // Diesel (inkl. Hybrid) : 6,41 L/100 km = 7,31 L BÄ (1 L diesel = 1,14 L BÄ) ; 168,0 g CO₂/km
    diesel: Object.freeze({ energy: fromPetrolEquivalent(6.41 * 1.14), co2: 168.0, nox: 0.08, so2: 0.02, seats: 5 }),
    // Benzin (inkl. Hybrid) : 6,30 L/100 km ; 146,1 g CO₂/km
    petrol: Object.freeze({ energy: fromPetrolEquivalent(6.30), co2: 146.1, nox: 0.06, so2: 0.01, seats: 2 }),
    // CNG (rapport 2024) : 5,48 m³/100 km = 5,65 L BÄ (1 m³ = 1,03 L BÄ) ; 114,5 g CO₂/km
    gas: Object.freeze({ energy: fromPetrolEquivalent(5.48 * 1.03), co2: 114.5, nox: 0.03, so2: 0.01, seats: 5 }),
    // Wasserstoff : 0,84 kg/100 km = 3,23 L BÄ ; 0 g CO₂/km
    hydrogen: Object.freeze({ energy: fromPetrolEquivalent(3.23), co2: 0, nox: 0, so2: 0, seats: 4 })
});

export const VEHICLE_TYPES = Object.freeze(Object.keys(VEHICLE_PROFILES));

// Valeurs d'origine de `vehicleData` (ancien script.js, commit 39cf9a6), figées : les tests de référence
// du simulateur de parc les utilisent pour prouver que sa logique de calcul reste identique.
export const LEGACY_VEHICLE_PROFILES = Object.freeze({
    electric: Object.freeze({ energy: 0.17, co2: 0, nox: 0, so2: 0, seats: 4 }),
    hybridPlug: Object.freeze({ energy: 0.10 + (0.02 * 10), co2: 50, nox: 0.02, so2: 0.01, seats: 4 }),
    diesel: Object.freeze({ energy: 0.54, co2: 120, nox: 0.08, so2: 0.02, seats: 5 }),
    petrol: Object.freeze({ energy: 0.60, co2: 140, nox: 0.06, so2: 0.01, seats: 2 }),
    gas: Object.freeze({ energy: 0.50, co2: 100, nox: 0.03, so2: 0.01, seats: 5 }),
    hydrogen: Object.freeze({ energy: 0.33, co2: 0, nox: 0, so2: 0, seats: 4 })
});
