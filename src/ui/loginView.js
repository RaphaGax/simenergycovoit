// Connexion et inscription. Après succès, la page est rechargée sur l'adresse de retour
// pour repartir avec l'utilisateur connecté dans tout le contexte de l'application.
import { el } from './dom.js';

function safeReturn(path) {
    // Uniquement un chemin interne de l'application (« /… »), jamais une adresse externe.
    return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

function field(id, label, attributes) {
    return el('div', { class: 'input-group' },
        el('label', { for: id, text: label }),
        el('input', { id, name: id.split('-')[1], ...attributes }),
        el('p', { class: 'field-error', id: `${id}-error`, 'aria-live': 'polite' }));
}

function authForm({ prefix, title, submitLabel, fields, onSubmit }) {
    const status = el('p', { class: 'error-message', role: 'alert' });
    const button = el('button', { type: 'submit', text: submitLabel });
    const form = el('form', { class: 'trip-form', novalidate: '' }, ...fields, status, el('div', { class: 'button-group' }, button));

    form.addEventListener('submit', async event => {
        event.preventDefault();
        button.disabled = true;
        status.textContent = '';
        form.querySelectorAll('.field-error').forEach(p => { p.textContent = ''; });
        form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
        try {
            await onSubmit(Object.fromEntries(new FormData(form)));
        } catch (error) {
            for (const [name, message] of Object.entries(error.fields ?? {})) {
                const input = form.elements[name];
                if (!input) continue;
                input.setAttribute('aria-invalid', '');
                form.querySelector(`#${prefix}-${name}-error`).textContent = message;
            }
            status.textContent = error.message;
            button.disabled = false;
        }
    });
    return el('section', { class: 'card auth-card' }, el('h2', { text: title }), form);
}

export function render(root, { api, user }, { query }) {
    const returnTo = safeReturn(query.retour);
    const done = () => {
        window.location.hash = `#${returnTo}`;
        window.location.reload();
    };

    if (user) {
        root.append(el('section', { class: 'card' },
            el('p', { text: `Vous êtes connecté·e en tant que ${user.name}.` }),
            el('a', { href: `#${returnTo}`, text: 'Continuer →' })));
        return;
    }

    root.append(el('div', { class: 'auth-layout' },
        authForm({
            prefix: 'login',
            title: 'Connexion',
            submitLabel: 'Se connecter',
            fields: [
                field('login-email', 'E-mail', { type: 'email', autocomplete: 'email', required: '' }),
                field('login-password', 'Mot de passe', { type: 'password', autocomplete: 'current-password', required: '' })
            ],
            onSubmit: async data => { await api.auth.login(data); done(); }
        }),
        authForm({
            prefix: 'register',
            title: 'Créer un compte',
            submitLabel: 'Créer mon compte',
            fields: [
                field('register-name', 'Prénom ou pseudonyme', { type: 'text', autocomplete: 'given-name', required: '' }),
                field('register-email', 'E-mail', { type: 'email', autocomplete: 'email', required: '' }),
                field('register-password', 'Mot de passe (10 caractères minimum)', { type: 'password', autocomplete: 'new-password', minlength: '10', required: '' })
            ],
            onSubmit: async data => { await api.auth.register(data); done(); }
        })));
}
