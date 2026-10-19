// « Mot de passe oublié » : demande d'un lien par e-mail. Le message affiché est le même que
// l'adresse corresponde à un compte ou non.
import { el } from '../dom.js';
import { formField, accountForm } from '../components/accountForm.js';

export function render(root, { api, config }) {
    if (!config?.passwordResetEnabled) {
        root.append(el('section', { class: 'card' },
            el('h2', { text: 'Mot de passe oublié' }),
            el('p', { text: 'La réinitialisation par e-mail n’est pas encore disponible sur ce site.' }),
            el('a', { href: '#/connexion', text: '← Retour à la connexion' })));
        return;
    }

    const done = el('p', { class: 'banner banner-confirmed', role: 'status' });
    const form = accountForm({
        prefix: 'forgot',
        title: 'Mot de passe oublié',
        submitLabel: 'Recevoir un lien',
        intro: [el('p', { class: 'hint', text: 'Indiquez l’adresse e-mail de votre compte : vous recevrez un lien valable 30 minutes pour choisir un nouveau mot de passe.' })],
        fields: [formField('forgot-email', 'E-mail', { type: 'email', autocomplete: 'email', required: '' })],
        onSubmit: async data => {
            done.textContent = await api.auth.requestPasswordReset(data.email);
            form.querySelector('form').replaceWith(done);
        },
        footer: [el('p', { class: 'auth-footer' }, el('a', { href: '#/connexion', text: '← Retour à la connexion' }))]
    });
    root.append(form);
}
