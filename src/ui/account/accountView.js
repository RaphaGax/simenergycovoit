// « Mon compte » : informations, changement de mot de passe, suppression du compte (nLPD / RGPD).
import { el } from '../dom.js';
import { icon } from '../components/icons.js';
import { pageHero } from '../components/pageHero.js';
import { initial } from '../format.js';
import { BOOKING_STATUS } from '../../core/booking.js';
import { formField, accountForm, checkSamePassword } from '../components/accountForm.js';

function deletionSection(api) {
    let armed = false;
    const section = accountForm({
        prefix: 'delete',
        title: 'Supprimer mon compte',
        submitLabel: 'Supprimer mon compte',
        buttonClass: 'button-secondary',
        intro: [
            el('p', { text: 'La suppression est définitive :' }),
            el('ul', { class: 'plain-list' },
                el('li', { text: 'votre e-mail, votre prénom et votre mot de passe sont effacés ;' }),
                el('li', { text: 'vos réservations à venir sont annulées et vos trajets à venir sans passager supprimés ;' }),
                el('li', { text: 'vos trajets passés restent visibles, sous « Compte supprimé », pour les autres participants (preuves de trajet, VroomPoints) ; vos points de prise en charge sont effacés.' })),
            el('p', { class: 'hint', text: 'Impossible tant que des passagers ont réservé l’un de vos trajets à venir.' })
        ],
        fields: [formField('delete-password', 'Mot de passe actuel', { type: 'password', autocomplete: 'current-password', required: '' })],
        onSubmit: async (data, form) => {
            // Premier envoi : demande de confirmation explicite.
            if (!armed) {
                armed = true;
                form.querySelector('button[type=submit]').textContent = 'Confirmer la suppression définitive';
                return;
            }
            await api.account.delete(data.password);
            history.replaceState(null, '', '#/');
            window.location.reload();
        }
    });
    section.classList.add('danger-zone');
    return section;
}

function statCard(iconName, tone, value, label, href) {
    const content = [
        el('span', { class: `stat-icon stat-icon-${tone}` }, icon(iconName, { size: 20 })),
        el('span', { class: 'stat-value', text: value }),
        el('span', { class: 'stat-label', text: label })];
    return el('li', { class: 'stat-card' }, ...(href ? [el('a', { class: 'stat-link', href }, ...content)] : content));
}

// Statistiques réelles du compte (aucun chiffre inventé) ; « — » si elles ne se chargent pas.
async function statsSection(api) {
    let values = ['—', '—', '—'];
    let levelName = '';
    try {
        const [trips, bookings, points] = await Promise.all([api.trips.mine(), api.bookings.mine(), api.points()]);
        values = [
            String(trips.length),
            String(bookings.filter(({ booking }) => booking.status === BOOKING_STATUS.CONFIRMED).length),
            String(points.earned)
        ];
        levelName = points.level.name;
    } catch (error) {
        console.error('Statistiques indisponibles :', error);
    }
    return el('ul', { class: 'stat-cards', 'aria-label': 'Mon activité' },
        statCard('car', 'green', values[0], 'Trajets publiés'),
        statCard('search', 'blue', values[1], 'Réservations'),
        statCard('star', 'yellow', values[2], levelName ? `VroomPoints · ${levelName}` : 'VroomPoints', '#/vroompoints'));
}

export async function render(root, { api, user }) {
    const passwordDone = el('p', { class: 'form-status', role: 'status' });

    root.append(
        pageHero('Mon compte', null,
            el('div', { class: 'profile-hero' },
                el('span', { class: 'avatar', 'aria-hidden': 'true', text: initial(user.name) }),
                el('div', {},
                    el('p', { class: 'profile-name', text: user.name }),
                    el('p', { text: user.email })))),
        await statsSection(api),
        accountForm({
            prefix: 'password',
            title: 'Changer de mot de passe',
            submitLabel: 'Changer le mot de passe',
            intro: [el('p', { class: 'hint', text: 'Vos autres appareils seront déconnectés.' })],
            fields: [
                formField('password-currentPassword', 'Mot de passe actuel', { type: 'password', autocomplete: 'current-password', required: '' }),
                formField('password-newPassword', 'Nouveau mot de passe (10 caractères minimum)', { type: 'password', autocomplete: 'new-password', minlength: '10', required: '' }),
                formField('password-newPasswordConfirm', 'Confirmer le nouveau mot de passe', { type: 'password', autocomplete: 'new-password', required: '' })
            ],
            onSubmit: async (data, form) => {
                checkSamePassword(data, 'newPassword', 'newPasswordConfirm');
                try {
                    await api.account.changePassword(data.currentPassword, data.newPassword);
                } catch (error) {
                    // Le serveur nomme « password » le mot de passe actuel refusé.
                    if (error.fields?.password) error.fields = { currentPassword: error.fields.password };
                    throw error;
                }
                form.reset();
                passwordDone.textContent = 'Mot de passe changé.';
            },
            footer: [passwordDone]
        }),
        deletionSection(api));
}
