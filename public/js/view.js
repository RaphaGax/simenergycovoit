// Lecture du formulaire et rendu des résultats. Toutes les fonctions reçoivent le
// `document` en paramètre afin d'être testables (jsdom). Aucun innerHTML : uniquement textContent.

import { VEHICLES, VEHICLE_TYPES } from './core/vehicles.js';
import { formatNumber } from './format.js';

export const mixFieldId = type => `pct${type[0].toUpperCase()}${type.slice(1)}`;

const SIMPLE_FIELDS = ['totalCars', 'aiRequests', 'dailyKm', 'daysPerYear'];

/** Crée les champs de répartition du parc à partir du référentiel des véhicules. */
export function buildMixInputs(doc) {
    const container = doc.getElementById('mixInputs');
    container.replaceChildren();
    for (const type of VEHICLE_TYPES) {
        const id = mixFieldId(type);
        const group = doc.createElement('div');
        group.className = 'input-group';
        const label = doc.createElement('label');
        label.htmlFor = id;
        label.textContent = `${VEHICLES[type].label} (${VEHICLES[type].seats} places)`;
        const input = doc.createElement('input');
        Object.assign(input, { type: 'number', id, name: id, min: '0', max: '100', step: '0.1' });
        input.dataset.vehicle = type;
        group.append(label, input);
        container.append(group);
    }
}

/** Lit le formulaire et renvoie une entrée brute (les champs vides restent des chaînes vides). */
export function readForm(doc) {
    const value = id => doc.getElementById(id).value;
    const input = {};
    for (const name of SIMPLE_FIELDS) input[name] = value(name);
    const occupancy = value('occupancy');
    input.occupancy = occupancy === '' ? '' : Number(occupancy) / 100;
    input.mix = Object.fromEntries(VEHICLE_TYPES.map(type => [type, value(mixFieldId(type)) || 0]));
    return input;
}

export function fillForm(doc, input) {
    for (const name of SIMPLE_FIELDS) doc.getElementById(name).value = input[name];
    doc.getElementById('occupancy').value = Math.round(input.occupancy * 1000) / 10;
    for (const type of VEHICLE_TYPES) {
        doc.getElementById(mixFieldId(type)).value = input.mix[type] ?? 0;
    }
}

export function renderMixTotal(doc, total) {
    const el = doc.getElementById('mixTotal');
    el.textContent = formatNumber(total, 1);
    el.classList.toggle('invalid', Math.abs(total - 100) > 0.1);
}

function fieldIdFor(errorField) {
    if (errorField.startsWith('mix.')) return mixFieldId(errorField.slice(4));
    return errorField;
}

export function renderErrors(doc, errors) {
    const box = doc.getElementById('errors');
    for (const el of doc.querySelectorAll('[aria-invalid="true"]')) el.removeAttribute('aria-invalid');
    box.replaceChildren();
    box.hidden = errors.length === 0;
    if (errors.length === 0) return;

    const list = doc.createElement('ul');
    for (const error of errors) {
        const item = doc.createElement('li');
        item.textContent = error.message;
        list.append(item);
        const field = error.field && doc.getElementById(fieldIdFor(error.field));
        if (field) field.setAttribute('aria-invalid', 'true');
    }
    box.append(list);
}

function setText(doc, id, text) {
    doc.getElementById(id).textContent = text;
}

function fillTable(doc, tbodyId, rows) {
    const tbody = doc.getElementById(tbodyId);
    tbody.replaceChildren(...rows.map(cells => {
        const tr = doc.createElement('tr');
        for (const cell of cells) {
            const td = doc.createElement('td');
            td.textContent = cell;
            tr.append(td);
        }
        return tr;
    }));
}

export function renderResults(doc, result, source) {
    const { totals, annual, ai } = result;

    setText(doc, 'source', source === 'server' ? 'par le serveur' : 'localement (mode hors ligne)');
    setText(doc, 'totalSeats', formatNumber(totals.seats));
    setText(doc, 'totalUsers', `${formatNumber(result.users.min)} – ${formatNumber(result.users.max)}`);
    setText(doc, 'totalEnergy', formatNumber(totals.energy, 2));
    setText(doc, 'totalCO2', formatNumber(totals.co2, 1));
    setText(doc, 'totalNOx', formatNumber(totals.nox, 2));
    setText(doc, 'totalSO2', formatNumber(totals.so2, 2));

    fillTable(doc, 'resultsBody', result.rows.map(r => [
        r.label, formatNumber(r.count), formatNumber(r.seats), formatNumber(r.energy, 3),
        formatNumber(r.co2Direct, 1), formatNumber(r.co2Indirect, 2), formatNumber(r.nox, 3), formatNumber(r.so2, 3)
    ]));

    fillTable(doc, 'userConsumptionBody', result.loadProfile.map(p => [
        `${formatNumber(p.load)} %`, formatNumber(p.users), formatNumber(p.energyPerUser, 4), formatNumber(p.co2PerUser, 2)
    ]));

    setText(doc, 'fleetKm', formatNumber(annual.fleetKm));
    setText(doc, 'passengers', formatNumber(annual.passengers));
    setText(doc, 'annualEnergy', formatNumber(annual.energy));
    setText(doc, 'annualCO2', formatNumber(annual.co2Kg));
    setText(doc, 'energyPerPkm', formatNumber(annual.energyPerPassengerKm, 3));
    setText(doc, 'co2PerPkm', formatNumber(annual.co2PerPassengerKm, 1));
    setText(doc, 'soloCO2', formatNumber(annual.solo.co2Kg));
    setText(doc, 'savedCO2', formatNumber(annual.savings.co2Kg));
    setText(doc, 'savedPct', formatNumber(annual.savings.co2Pct, 1));
    doc.getElementById('savings').classList.toggle('negative', annual.savings.co2Kg < 0);

    setText(doc, 'aiEnergy', formatNumber(ai.energyPerUserDay, 3));
    setText(doc, 'aiCO2', formatNumber(ai.co2PerUserDay, 2));
    setText(doc, 'aiCO2Year', formatNumber(ai.co2PerYearKg, 1));

    for (const id of ['results', 'annual', 'userConsumption']) doc.getElementById(id).hidden = false;
}

export function hideResults(doc) {
    for (const id of ['results', 'annual', 'userConsumption']) doc.getElementById(id).hidden = true;
    doc.getElementById('resultsBody').replaceChildren();
    doc.getElementById('userConsumptionBody').replaceChildren();
}

export function renderStatus(doc, online) {
    const el = doc.getElementById('status');
    el.dataset.mode = online ? 'online' : 'offline';
    el.textContent = online
        ? 'Serveur connecté : calculs côté serveur et scénarios disponibles.'
        : 'Mode hors ligne : calculs effectués dans le navigateur, scénarios indisponibles.';
    doc.getElementById('scenarioName').disabled = !online;
    doc.getElementById('saveScenarioBtn').disabled = !online;
}

export function renderScenarioMessage(doc, message, isError = false) {
    const el = doc.getElementById('scenarioMessage');
    el.textContent = message;
    el.classList.toggle('error', isError);
}

/**
 * @param {{ onLoad: (id: string) => void, onDelete: (id: string) => void }} handlers
 */
export function renderScenarios(doc, scenarios, handlers) {
    const list = doc.getElementById('scenarioList');
    if (scenarios.length === 0) {
        const empty = doc.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'Aucun scénario enregistré.';
        list.replaceChildren(empty);
        return;
    }
    list.replaceChildren(...scenarios.map(s => {
        const item = doc.createElement('li');
        item.dataset.id = s.id;

        const info = doc.createElement('div');
        const name = doc.createElement('strong');
        name.textContent = s.name;
        const meta = doc.createElement('span');
        meta.className = 'hint';
        const date = new Date(s.createdAt).toLocaleDateString('fr-CH');
        meta.textContent = `${date} · ${formatNumber(s.summary.totalCars)} voitures · ${formatNumber(s.summary.annualCo2Kg)} kg CO₂/an`;
        info.append(name, meta);

        const actions = doc.createElement('div');
        actions.className = 'actions';
        const load = doc.createElement('button');
        load.type = 'button';
        load.className = 'secondary small';
        load.textContent = 'Charger';
        load.addEventListener('click', () => handlers.onLoad(s.id));
        const del = doc.createElement('button');
        del.type = 'button';
        del.className = 'danger small';
        del.textContent = 'Supprimer';
        del.setAttribute('aria-label', `Supprimer le scénario ${s.name}`);
        del.addEventListener('click', () => handlers.onDelete(s.id));
        actions.append(load, del);

        item.append(info, actions);
        return item;
    }));
}
