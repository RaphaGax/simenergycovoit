// Formatage des nombres et export CSV.

// Format français explicite (virgule décimale, espace fine insécable pour les milliers),
// indépendant des données de localisation du navigateur.
export const THOUSANDS_SEPARATOR = '\u202F';

export function formatNumber(value, digits = 0) {
    if (!Number.isFinite(value)) return '–';
    const fixed = value.toFixed(digits);
    // Évite l'affichage de « -0 »
    const negative = Number(fixed) < 0;
    const [integer, fraction] = fixed.replace('-', '').split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
    return `${negative ? '-' : ''}${grouped}${fraction ? `,${fraction}` : ''}`;
}

function csvCell(value) {
    const text = typeof value === 'number' ? String(value).replace('.', ',') : String(value ?? '');
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLines(rows) {
    return rows.map(row => row.map(csvCell).join(';'));
}

/** Exporte un résultat de simulation en CSV (séparateur « ; » et virgule décimale pour Excel francophone). */
export function resultToCsv(result) {
    const lines = [
        ...csvLines([
            ['Type', 'Nombre', 'Places', 'Consommation (kWh/km)', 'CO2 direct (g/km)', 'CO2 indirect (g/km)', 'NOx (g/km)', 'SO2 (g/km)'],
            ...result.rows.map(r => [r.label, r.count, r.seats, r.energy, r.co2Direct, r.co2Indirect, r.nox, r.so2])
        ]),
        '',
        ...csvLines([
            ['Charge (%)', 'Utilisateurs', 'Consommation (kWh/km/utilisateur)', 'CO2 (g/km/utilisateur)'],
            ...result.loadProfile.map(p => [p.load, p.users, p.energyPerUser, p.co2PerUser])
        ]),
        '',
        ...csvLines([
            ['Indicateur annuel', 'Valeur'],
            ['Énergie (kWh)', result.annual.energy],
            ['CO2 (kg)', result.annual.co2Kg],
            ['Énergie autosolisme (kWh)', result.annual.solo.energy],
            ['CO2 autosolisme (kg)', result.annual.solo.co2Kg],
            ['Économie de CO2 (kg)', result.annual.savings.co2Kg],
            ['Énergie IA (kWh)', result.ai.energyPerYear],
            ['CO2 IA (kg)', result.ai.co2PerYearKg]
        ])
    ];
    return lines.join('\r\n') + '\r\n';
}
