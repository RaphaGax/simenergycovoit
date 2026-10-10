// Champ de lieu avec suggestions openrouteservice (<datalist>). Un lieu choisi dans les
// suggestions porte des coordonnées ; un texte libre reste utilisable, sans coordonnées.
// Sans client ORS, c'est un simple champ texte.
import { el } from '../dom.js';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

export function createPlaceInput({ id, placeholder, ors, initial = null, onChange = () => {} }) {
    const input = el('input', { id, name: id, type: 'text', autocomplete: 'off', placeholder });
    const list = el('datalist', { id: `${id}-suggestions` });
    const hint = el('p', { class: 'hint place-hint', 'aria-live': 'polite' });
    let suggestions = [];
    let selected = initial;
    let timer;
    let controller;

    if (initial) input.value = initial.label;
    if (ors) input.setAttribute('list', list.id);

    function select(place) {
        const changed = place?.label !== selected?.label;
        selected = place;
        hint.textContent = place ? 'Lieu localisé ✓' : '';
        if (changed) onChange(place);
    }

    async function fetchSuggestions(text) {
        controller?.abort();
        controller = new AbortController();
        try {
            suggestions = await ors.autocomplete(text, { signal: controller.signal });
            list.replaceChildren(...suggestions.map(place => el('option', { value: place.label })));
            // La saisie a pu correspondre exactement à une suggestion entre-temps.
            const match = suggestions.find(place => place.label === input.value);
            if (match) select(match);
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.warn('Suggestions de lieux indisponibles :', error);
            hint.textContent = 'Suggestions indisponibles : saisie libre.';
        }
    }

    input.addEventListener('input', () => {
        if (!ors) return;
        // Choisir une suggestion du <datalist> remplit le champ avec son libellé exact.
        const match = suggestions.find(place => place.label === input.value);
        if (match) {
            select(match);
            return;
        }
        select(null);
        clearTimeout(timer);
        const text = input.value.trim();
        if (text.length >= MIN_CHARS) timer = setTimeout(() => fetchSuggestions(text), DEBOUNCE_MS);
    });

    return {
        input,
        extra: ors ? [list, hint] : [],
        // Lieu choisi, uniquement si le champ affiche toujours son libellé.
        getPlace: () => (selected && selected.label === input.value ? selected : null),
        reset() {
            input.value = '';
            suggestions = [];
            list.replaceChildren();
            select(null);
        }
    };
}

// Coordonnées dans l'adresse : « 6.4983,46.5113 » ↔ [6.4983, 46.5113].
export const coordsToParam = coords => coords.join(',');

export function paramToCoords(value) {
    const coords = String(value ?? '').split(',').map(Number);
    return coords.length === 2 && coords.every(Number.isFinite) ? coords : null;
}
