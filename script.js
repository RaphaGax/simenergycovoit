// Données des véhicules (consommation, émissions, places)
const vehicleData = {
    electric: { energy: 0.17, co2: 0, nox: 0, so2: 0, seats: 4 }, // kWh/km, g/km
    hybridPlug: { energy: 0.10 + (0.02 * 10), co2: 50, nox: 0.02, so2: 0.01, seats: 4 }, // 0.1 kWh + 0.02L
    diesel: { energy: 0.54, co2: 120, nox: 0.08, so2: 0.02, seats: 5 }, // 0.054L
    petrol: { energy: 0.60, co2: 140, nox: 0.06, so2: 0.01, seats: 2 }, // 0.06L
    gas: { energy: 0.50, co2: 100, nox: 0.03, so2: 0.01, seats: 5 }, // 0.045kg
    hydrogen: { energy: 0.33, co2: 0, nox: 0, so2: 0, seats: 4 } // 0.01kg
};

// Chart.js instances
let vehicleChart, consumptionChart, emissionsChart, userConsumptionChart;

function calculate() {
    try {
        // Récupérer les inputs
        const totalCars = parseInt(document.getElementById('totalCars').value) || 100;
        const aiRequests = parseInt(document.getElementById('aiRequests').value) || 10;

        const percentages = {
            electric: parseFloat(document.getElementById('pctElectric').value) || 0,
            hybridPlug: parseFloat(document.getElementById('pctHybridPlug').value) || 0,
            diesel: parseFloat(document.getElementById('pctDiesel').value) || 0,
            petrol: parseFloat(document.getElementById('pctPetrol').value) || 0,
            gas: parseFloat(document.getElementById('pctGas').value) || 0,
            hydrogen: parseFloat(document.getElementById('pctHydrogen').value) || 0
        };

        // Vérifier la somme des pourcentages
        const totalPct = Object.values(percentages).reduce((sum, pct) => sum + pct, 0);
        if (Math.abs(totalPct - 100) > 0.1) {
            document.getElementById('pctError').style.display = 'block';
            return;
        }
        document.getElementById('pctError').style.display = 'none';

        // Calculer le nombre de voitures par type
        const cars = {
            electric: Math.round((percentages.electric / 100) * totalCars),
            hybridPlug: Math.round((percentages.hybridPlug / 100) * totalCars),
            diesel: Math.round((percentages.diesel / 100) * totalCars),
            petrol: Math.round((percentages.petrol / 100) * totalCars),
            gas: Math.round((percentages.gas / 100) * totalCars),
            hydrogen: Math.round((percentages.hydrogen / 100) * totalCars)
        };
        // Ajuster pour garantir le total exact
        const currentTotal = Object.values(cars).reduce((sum, n) => sum + n, 0);
        if (currentTotal < totalCars) cars.petrol += totalCars - currentTotal;

        // Calculer les places et utilisateurs
        let totalSeats = 0;
        for (const type in cars) {
            totalSeats += cars[type] * vehicleData[type].seats;
        }
        const minUsers = totalSeats * 0.25; // 25% d'occupation
        const maxUsers = totalSeats; // 100% d'occupation

        // Calculer la consommation et les émissions par km
        let totalEnergy = 0, totalCO2 = 0, totalNOx = 0, totalSO2 = 0;
        const results = [];

        for (const type in cars) {
            const numCars = cars[type];
            if (numCars === 0) continue;

            const energy = numCars * vehicleData[type].energy; // kWh/km
            const co2 = numCars * vehicleData[type].co2; // g/km
            const nox = numCars * vehicleData[type].nox; // g/km
            const so2 = numCars * vehicleData[type].so2; // g/km

            totalEnergy += energy;
            totalCO2 += co2;
            totalNOx += nox;
            totalSO2 += so2;

            results.push({
                type,
                numCars,
                seats: vehicleData[type].seats,
                energy: vehicleData[type].energy,
                co2: vehicleData[type].co2,
                nox: vehicleData[type].nox,
                so2: vehicleData[type].so2
            });
        }

        // Consommation et émissions spécifiques pour différentes charges
        const charges = [0.25, 0.5, 0.75, 1]; // 25%, 50%, 75%, 100%
        const userConsumption = charges.map(charge => {
            const users = totalSeats * charge;
            return {
                charge: charge * 100,
                users: users,
                energy: users > 0 ? totalEnergy / users : 0,
                co2: users > 0 ? totalCO2 / users : 0
            };
        });

        // Consommation IA
        const aiEnergyPerRequest = 0.02; // kWh/requête
        const aiCO2PerKWh = 10; // g CO2/kWh
        const aiEnergy = aiRequests * aiEnergyPerRequest; // kWh/jour/utilisateur
        const aiCO2 = aiEnergy * aiCO2PerKWh; // g/jour/utilisateur

        // Mettre à jour le tableau des résultats
        const tbody = document.getElementById('resultsBody');
        tbody.innerHTML = '';
        results.forEach(r => {
            const row = `<tr>
                <td>${r.type}</td>
                <td>${r.numCars}</td>
                <td>${r.seats}</td>
                <td>${r.energy.toFixed(3)}</td>
                <td>${r.co2.toFixed(2)}</td>
                <td>${r.nox.toFixed(3)}</td>
                <td>${r.so2.toFixed(3)}</td>
            </tr>`;
            tbody.innerHTML += row;
        });

        // Mettre à jour le récapitulatif
        document.getElementById('totalSeats').textContent = Math.round(totalSeats);
        document.getElementById('totalUsers').textContent = `${Math.round(minUsers)} - ${Math.round(maxUsers)}`;
        document.getElementById('totalEnergy').textContent = totalEnergy.toFixed(3);
        document.getElementById('totalCO2').textContent = totalCO2.toFixed(2);
        document.getElementById('totalNOx').textContent = totalNOx.toFixed(3);
        document.getElementById('totalSO2').textContent = totalSO2.toFixed(3);
        document.getElementById('aiEnergy').textContent = aiEnergy.toFixed(3);
        document.getElementById('aiCO2').textContent = aiCO2.toFixed(2);

        // Mettre à jour le tableau de consommation par utilisateur
        const userTbody = document.getElementById('userConsumptionBody');
        userTbody.innerHTML = '';
        userConsumption.forEach(uc => {
            const row = `<tr>
                <td>${uc.charge}%</td>
                <td>${Math.round(uc.users)}</td>
                <td>${uc.energy.toFixed(6)}</td>
                <td>${uc.co2.toFixed(3)}</td>
            </tr>`;
            userTbody.innerHTML += row;
        });

        // Graphiques
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Répartition des véhicules' }
                }
            }
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Consommation par type de véhicule' }
                }
            }
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Émissions par type de véhicule' }
                }
            }
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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'Consommation et émissions par utilisateur selon la charge' }
                }
            }
        });
    } catch (error) {
        console.error('Erreur dans calculate():', error);
        alert('Une erreur s’est produite lors du calcul. Vérifiez les entrées et réessayez.');
    }
}

function reset() {
    try {
        document.getElementById('totalCars').value = 100;
        document.getElementById('pctElectric').value = 20.9;
        document.getElementById('pctHybridPlug').value = 9.2;
        document.getElementById('pctDiesel').value = 14.1;
        document.getElementById('pctPetrol').value = 55.8;
        document.getElementById('pctGas').value = 0;
        document.getElementById('pctHydrogen').value = 0;
        document.getElementById('aiRequests').value = 10;
        document.getElementById('resultsBody').innerHTML = '';
        document.getElementById('userConsumptionBody').innerHTML = '';
        document.getElementById('pctError').style.display = 'none';
        if (vehicleChart) vehicleChart.destroy();
        if (consumptionChart) consumptionChart.destroy();
        if (emissionsChart) emissionsChart.destroy();
        if (userConsumptionChart) userConsumptionChart.destroy();
    } catch (error) {
        console.error('Erreur dans reset():', error);
        alert('Une erreur s’est produite lors de la réinitialisation.');
    }
}

// Initialiser
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page chargée, initialisation...');
    reset();
});