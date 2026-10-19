// Nouveau mot de passe depuis le lien reçu par e-mail (#/mot-de-passe/nouveau?jeton=…).
// Le jeton est dans la partie « # » de l'adresse : il n'est jamais envoyé au serveur dans l'URL,
// ni transmis à un autre site ; il est retiré de l'historique dès l'affichage.
import { el } from '../dom.js';
import { formField, accountForm, checkSamePassword } from '../components/accountForm.js';

export function render(root, { api }, { query }) {
    const token = query.jeton ?? '';
    history.replaceState(null, '', '#/mot-de-passe/nouveau');

    if (!token) {
        root.append(el('section', { class: 'card' },
            el('h2', { text: 'Lien incomplet' }),
            el('p', { text: 'Ouvrez le lien reçu par e-mail en entier, ou faites une nouvelle demande.' }),
            el('a', { href: '#/mot-de-passe/oublie', text: 'Nouvelle demande' })));
        return;
    }

    root.append(accountForm({
        prefix: 'reset',
        title: 'Choisir un nouveau mot de passe',
        submitLabel: 'Enregistrer et me connecter',
        intro: [el('p', { class: 'hint', text: 'Vous serez déconnecté·e de tous vos autres appareils.' })],
        fields: [
            formField('reset-password', 'Nouveau mot de passe (10 caractères minimum)', { type: 'password', autocomplete: 'new-password', minlength: '10', required: '' }),
            formField('reset-passwordConfirm', 'Confirmer le mot de passe', { type: 'password', autocomplete: 'new-password', required: '' })
        ],
        onSubmit: async data => {
            checkSamePassword(data, 'password', 'passwordConfirm');
            await api.auth.confirmPasswordReset(token, data.password);
            history.replaceState(null, '', '#/');
            window.location.reload();
        },
        footer: [el('p', { class: 'auth-footer' }, el('a', { href: '#/mot-de-passe/oublie', text: 'Lien expiré ? Faire une nouvelle demande' }))]
    }));
}
