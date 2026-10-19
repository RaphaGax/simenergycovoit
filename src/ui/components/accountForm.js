// Formulaires du compte (connexion, inscription, mots de passe, suppression) : erreurs du serveur
// affichées sous chaque champ (champ « nom » d'id « prefixe-nom »), bouton bloqué pendant l'envoi.
import { el } from '../dom.js';

export function formField(id, label, attributes) {
    return el('div', { class: 'input-group' },
        el('label', { for: id, text: label }),
        el('input', { id, name: id.slice(id.indexOf('-') + 1), ...attributes }),
        el('p', { class: 'field-error', id: `${id}-error`, 'aria-live': 'polite' }));
}

// onSubmit(données, formulaire) ; une erreur levée (ApiError) s'affiche dans le formulaire.
export function accountForm({ prefix, title, submitLabel, fields, onSubmit, intro = [], footer = [], buttonClass }) {
    const status = el('p', { class: 'error-message', role: 'alert' });
    const button = el('button', { type: 'submit', text: submitLabel, ...(buttonClass ? { class: buttonClass } : {}) });
    const form = el('form', { class: 'trip-form', novalidate: '' }, ...fields, status, el('div', { class: 'button-group' }, button));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        button.disabled = true;
        status.textContent = '';
        form.querySelectorAll('.field-error').forEach(p => { p.textContent = ''; });
        form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
        try {
            await onSubmit(Object.fromEntries(new FormData(form)), form);
        } catch (error) {
            for (const [name, message] of Object.entries(error.fields ?? {})) {
                const input = form.elements[name];
                if (!input) continue;
                input.setAttribute('aria-invalid', '');
                form.querySelector(`#${prefix}-${name}-error`).textContent = message;
            }
            status.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    });
    return el('section', { class: 'card auth-card' }, el('h2', { text: title }), ...intro, form, ...footer);
}

// Mot de passe et confirmation identiques : vérifié avant l'envoi au serveur.
export function checkSamePassword(data, name, confirmName) {
    if (data[name] !== data[confirmName]) {
        const error = new Error('Les deux mots de passe sont différents.');
        error.fields = { [confirmName]: 'Les deux mots de passe sont différents.' };
        throw error;
    }
}
