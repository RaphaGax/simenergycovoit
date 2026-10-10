// Point d'entrée du simulateur de parc (remplace les onclick globaux de script.js).
import { calculate, reset } from './ui/fleetView.js';

document.getElementById('calculateBtn').addEventListener('click', calculate);
document.getElementById('resetBtn').addEventListener('click', reset);

// Un module s'exécute avant DOMContentLoaded : l'initialisation reste au même moment que dans script.js.
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page chargée, initialisation...');
    reset();
});
