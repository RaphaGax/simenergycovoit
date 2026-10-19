// Connexion et inscription. Après succès, la page est rechargée sur l'adresse de retour
// pour repartir avec l'utilisateur connecté dans tout le contexte de l'application.
import { el } from './dom.js';
import { formField as field, accountForm as authForm } from './components/accountForm.js';

function safeReturn(path) {
    // Uniquement un chemin interne de l'application (« /… »), jamais une adresse externe.
    return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

export function render(root, { api, user, config }, { query }) {
    const returnTo = safeReturn(query.retour);
    const done = () => {
        // replaceState ne déclenche pas hashchange : pas d'affichage éphémère avant le rechargement.
        history.replaceState(null, '', `#${returnTo}`);
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
            onSubmit: async data => { await api.auth.login(data); done(); },
            footer: config?.passwordResetEnabled
                ? [el('p', { class: 'auth-footer' }, el('a', { href: '#/mot-de-passe/oublie', text: 'Mot de passe oublié ?' }))]
                : []
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
