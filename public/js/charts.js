// Graphiques Chart.js. Le constructeur est injecté : sans Chart.js (CDN indisponible,
// tests), les graphiques sont simplement ignorés.

import { VEHICLES } from './core/vehicles.js';

export function createChartManager(ChartCtor, doc) {
    const instances = new Map();

    function draw(id, config) {
        instances.get(id)?.destroy();
        instances.set(id, new ChartCtor(doc.getElementById(id), config));
    }

    const baseOptions = title => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { title: { display: true, text: title } }
    });

    return {
        render(result) {
            if (!ChartCtor) return;
            const rows = result.rows;
            draw('vehicleChart', {
                type: 'doughnut',
                data: {
                    labels: rows.map(r => r.label),
                    datasets: [{ data: rows.map(r => r.count), backgroundColor: rows.map(r => VEHICLES[r.type].color) }]
                },
                options: baseOptions('Répartition des véhicules')
            });
            draw('emissionsChart', {
                type: 'bar',
                data: {
                    labels: rows.map(r => r.label),
                    datasets: [
                        { label: 'CO₂ direct (g/km)', data: rows.map(r => r.co2Direct), backgroundColor: '#1a3c5e' },
                        { label: 'CO₂ réseau (g/km)', data: rows.map(r => r.co2Indirect), backgroundColor: '#36A2EB' }
                    ]
                },
                options: { ...baseOptions('CO₂ par véhicule et par km'), scales: { x: { stacked: true }, y: { stacked: true } } }
            });
            draw('userConsumptionChart', {
                type: 'line',
                data: {
                    labels: result.loadProfile.map(p => `${p.load} %`),
                    datasets: [
                        { label: 'Énergie (kWh/km/utilisateur)', data: result.loadProfile.map(p => p.energyPerUser), borderColor: '#1a3c5e', yAxisID: 'y' },
                        { label: 'CO₂ (g/km/utilisateur)', data: result.loadProfile.map(p => p.co2PerUser), borderColor: '#36A2EB', yAxisID: 'y1' }
                    ]
                },
                options: {
                    ...baseOptions('Consommation et émissions par utilisateur selon la charge'),
                    scales: { y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false } } }
                }
            });
        },
        destroyAll() {
            for (const chart of instances.values()) chart.destroy();
            instances.clear();
        },
        get size() {
            return instances.size;
        }
    };
}
