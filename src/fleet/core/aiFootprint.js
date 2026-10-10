// Empreinte de l'application IA par utilisateur, extraite de calculate() (script.js, l. 100-103).
export const AI_ENERGY_PER_REQUEST = 0.02; // kWh/requête
export const AI_CO2_PER_KWH = 10; // g CO2/kWh

export function computeAiFootprint(aiRequests) {
    const aiEnergy = aiRequests * AI_ENERGY_PER_REQUEST; // kWh/jour/utilisateur
    const aiCO2 = aiEnergy * AI_CO2_PER_KWH; // g/jour/utilisateur
    return { aiEnergy, aiCO2 };
}
