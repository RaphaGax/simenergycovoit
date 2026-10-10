// Graphiques du simulateur de parc (script.js, l. 145-231). Chart.js est chargé en global par fleet.html.
let vehicleChart, consumptionChart, emissionsChart, userConsumptionChart;

function chartOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: { display: true, text: title }
        }
    };
}

export function destroyFleetCharts() {
    if (vehicleChart) vehicleChart.destroy();
    if (consumptionChart) consumptionChart.destroy();
    if (emissionsChart) emissionsChart.destroy();
    if (userConsumptionChart) userConsumptionChart.destroy();
}

export function renderFleetCharts({ cars, results, userConsumption }) {
    if (vehicleChart) vehicleChart.destroy();
    vehicleChart = new Chart(document.getElementById('vehicleChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(cars),
            datasets: [{
                data: Object.values(cars),
                backgroundColor: ['#36A2EB', '#FFCE56', '#FF6384', '#4BC0C0', '#9966FF', '#FF9F40']
            }]
        },
        options: chartOptions('Répartition des véhicules')
    });

    if (consumptionChart) consumptionChart.destroy();
    consumptionChart = new Chart(document.getElementById('consumptionChart'), {
        type: 'bar',
        data: {
            labels: results.map(r => r.type),
            datasets: [{
                label: 'Consommation (kWh/km)',
                data: results.map(r => r.energy),
                backgroundColor: '#1a3c5e'
            }]
        },
        options: chartOptions('Consommation par type de véhicule')
    });

    if (emissionsChart) emissionsChart.destroy();
    emissionsChart = new Chart(document.getElementById('emissionsChart'), {
        type: 'bar',
        data: {
            labels: results.map(r => r.type),
            datasets: [
                { label: 'CO2 (g/km)', data: results.map(r => r.co2), backgroundColor: '#36A2EB' },
                { label: 'NOx (g/km)', data: results.map(r => r.nox), backgroundColor: '#FF6384' },
                { label: 'SO2 (g/km)', data: results.map(r => r.so2), backgroundColor: '#FFCE56' }
            ]
        },
        options: chartOptions('Émissions par type de véhicule')
    });

    if (userConsumptionChart) userConsumptionChart.destroy();
    userConsumptionChart = new Chart(document.getElementById('userConsumptionChart'), {
        type: 'line',
        data: {
            labels: userConsumption.map(uc => `${uc.charge}%`),
            datasets: [
                {
                    label: 'Consommation (kWh/km/utilisateur)',
                    data: userConsumption.map(uc => uc.energy),
                    borderColor: '#1a3c5e',
                    fill: false
                },
                {
                    label: 'CO2 (g/km/utilisateur)',
                    data: userConsumption.map(uc => uc.co2),
                    borderColor: '#36A2EB',
                    fill: false
                }
            ]
        },
        options: chartOptions('Consommation et émissions par utilisateur selon la charge')
    });
}
