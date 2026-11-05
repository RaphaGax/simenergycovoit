// Pages légales : politique de confidentialité (nLPD et RGPD), conditions d'utilisation, contact.
// Projet de texte décrivant le fonctionnement réel de l'application, à faire valider par un juriste.
// Accessibles sans connexion (exigé par l'App Store et Google Play).
import { el } from '../dom.js';
import { pageHero } from '../components/pageHero.js';
import { LEGAL, hasPlaceholders } from './legalInfo.js';

// Une section : titre puis paragraphes (chaînes) ou listes (tableaux de chaînes).
function section(title, ...blocks) {
    return el('section', { class: 'card legal-section' },
        el('h2', { text: title }),
        ...blocks.map(block => (Array.isArray(block)
            ? el('ul', { class: 'plain-list' }, ...block.map(item => el('li', { text: item })))
            : el('p', { text: block }))));
}

function draftNotice() {
    return hasPlaceholders()
        ? [el('p', { class: 'notice', role: 'note', text: 'Projet de texte : certaines informations restent à compléter et le texte doit être relu par un juriste avant la publication officielle.' })]
        : [];
}

const updated = () => el('p', { class: 'hint legal-updated', text: `Dernière mise à jour : ${LEGAL.updatedOn}.` });

export const privacyView = {
    render(root) {
        root.append(
            pageHero('Confidentialité', 'Comment EcoVroom traite vos données personnelles.'),
            ...draftNotice(),
            section('Qui est responsable ?',
                `Le responsable du traitement est ${LEGAL.operator}, ${LEGAL.address}.`,
                `Pour toute question sur vos données : ${LEGAL.privacyEmail}.`,
                'Cette politique s’applique au site et à l’application EcoVroom. Elle respecte la loi fédérale suisse sur la protection des données (nLPD) et, pour les utilisateurs situés dans l’Union européenne, le règlement général sur la protection des données (RGPD).'),
            section('Les données que nous traitons',
                [
                    'Votre compte : prénom ou pseudonyme, adresse e-mail, mot de passe (enregistré uniquement sous forme chiffrée irréversible, jamais en clair), date de création.',
                    'Vos trajets de conducteur : lieux de départ et d’arrivée (et leurs coordonnées si vous les choisissez dans les suggestions), date et heure, distance, motorisation, sièges de la voiture et places proposées.',
                    'Vos réservations de passager : trajet réservé, nombre de places, points de prise en charge et de dépose si vous les indiquez, distance parcourue et détour du conducteur, référence de réservation.',
                    'Le déroulement des trajets : confirmation du conducteur, réponse des passagers (« j’ai voyagé » ou « le trajet n’a pas eu lieu »), annulations.',
                    'Les VroomPoints et le CO₂ évité, calculés à partir des données ci-dessus.',
                    'Les données techniques de connexion : un cookie de session (voir plus bas) ; l’adresse IP, utilisée brièvement pour limiter les tentatives de connexion abusives et enregistrée dans les journaux techniques de l’hébergeur.'
                ],
                'Nous ne collectons ni votre position GPS en continu, ni vos contacts, ni de données de paiement : les trajets sont gratuits pour les passagers.'),
            section('Pourquoi nous les utilisons',
                [
                    'Fournir le service : créer votre compte, publier et rechercher des trajets, réserver, calculer les itinéraires et les VroomPoints (exécution du contrat).',
                    'Vous informer des événements de vos trajets : annulation d’un trajet par le conducteur, lien de réinitialisation du mot de passe (exécution du contrat).',
                    'Assurer la sécurité du service : protection contre les abus et les accès non autorisés (intérêt légitime).',
                    'Tenir un registre du CO₂ évité trajet par trajet, en vue d’une éventuelle certification future (intérêt légitime). Les VroomPoints ne sont pas des crédits carbone.'
                ],
                'Nous ne vendons pas vos données, nous ne faisons pas de publicité ciblée et nous n’utilisons aucun outil de mesure d’audience ni de pistage.'),
            section('Qui peut voir vos données ?',
                [
                    'Les autres utilisateurs voient uniquement votre prénom ou pseudonyme, jamais votre e-mail.',
                    'Une réservation n’est visible que par son passager et par le conducteur du trajet (lieux de prise en charge et de dépose compris).',
                    'Les trajets publiés à venir sont visibles par tous les visiteurs, avec le prénom du conducteur.'
                ]),
            section('Sous-traitants et transferts à l’étranger',
                'Nous faisons appel aux prestataires suivants, qui traitent les données uniquement pour notre compte :',
                LEGAL.processors.map(p => `${p.name} : ${p.role} — ${p.location}.`),
                'Lorsque des données sont traitées dans un pays dont la protection n’est pas reconnue équivalente par la Suisse, nous nous appuyons sur les garanties prévues par la loi, notamment les clauses contractuelles types ou une certification reconnue du prestataire.',
                'Le bouton « Naviguer avec Waze » ouvre simplement l’application Waze avec la destination : EcoVroom ne transmet aucune autre donnée à Waze, et Waze applique sa propre politique de confidentialité.'),
            section('Cookies et stockage',
                'EcoVroom utilise un seul cookie, strictement nécessaire : le cookie de session qui vous garde connecté (protégé, inaccessible aux scripts, valable 30 jours au plus). Aucun cookie publicitaire ni de mesure d’audience.',
                'L’application installée garde sur votre appareil une copie de ses fichiers (pages, images) pour s’ouvrir plus vite : vos données personnelles n’y sont jamais conservées.'),
            section('Combien de temps nous les conservons',
                [
                    'Compte et trajets : tant que votre compte existe.',
                    'Liens de réinitialisation du mot de passe : 30 minutes, à usage unique.',
                    'Après la suppression de votre compte : votre e-mail, votre prénom et votre mot de passe sont effacés et vos points de prise en charge supprimés ; l’historique des trajets passés partagés avec d’autres utilisateurs reste, anonymisé (« Compte supprimé »), pour leurs VroomPoints et le registre du CO₂.'
                ]),
            section('Vos droits',
                [
                    'Accéder à vos données et en obtenir une copie.',
                    'Les faire rectifier.',
                    'Supprimer votre compte à tout moment, directement dans l’application (« Mon compte », puis « Supprimer mon compte »).',
                    'Vous opposer à un traitement ou en demander la limitation, dans les cas prévus par la loi.',
                    'Recevoir vos données dans un format courant (portabilité).'
                ],
                `Pour exercer ces droits, écrivez à ${LEGAL.privacyEmail}. Nous répondons en principe dans les 30 jours.`,
                'Vous pouvez aussi vous adresser au Préposé fédéral à la protection des données et à la transparence (PFPDT, www.edoeb.admin.ch) ou, dans l’Union européenne, à l’autorité de protection des données de votre pays.'),
            section('Sécurité',
                'Connexion chiffrée (HTTPS), mots de passe chiffrés de façon irréversible (scrypt), jeton de session dont seule l’empreinte est enregistrée, protection contre les requêtes forgées et limitation des tentatives de connexion.'),
            section('Âge minimum',
                `EcoVroom est destiné aux personnes âgées d’au moins ${LEGAL.minimumAge} ans. Pour proposer un trajet, il faut en outre être titulaire d’un permis de conduire valable.`),
            section('Modifications',
                'Nous pouvons adapter cette politique, notamment lors de nouvelles fonctionnalités. La date de mise à jour figure ci-dessous ; en cas de changement important, nous vous en informerons dans l’application ou par e-mail.'),
            updated());
    }
};

export const termsView = {
    render(root) {
        root.append(
            pageHero('Conditions d’utilisation', 'Les règles du jeu d’EcoVroom, pour voyager ensemble en confiance.'),
            ...draftNotice(),
            section('Objet',
                `EcoVroom, exploité par ${LEGAL.operator}, met en relation des conducteurs qui partagent un trajet qu’ils effectuent de toute façon et des passagers qui souhaitent les accompagner. En créant un compte, vous acceptez les présentes conditions et la politique de confidentialité.`),
            section('Un covoiturage gratuit, entre particuliers',
                [
                    'Les trajets sont gratuits pour les passagers (0 CHF). Le conducteur ne demande aucune contrepartie financière.',
                    'EcoVroom n’est pas une entreprise de transport : le trajet est un accord privé entre le conducteur et ses passagers. EcoVroom n’est pas partie à ce trajet.',
                    'Le conducteur ne peut pas utiliser EcoVroom à des fins professionnelles ou commerciales de transport de personnes.'
                ]),
            section('Votre compte',
                [
                    `Il faut avoir au moins ${LEGAL.minimumAge} ans.`,
                    'Les informations fournies doivent être exactes ; un seul compte par personne.',
                    'Vous êtes responsable de la confidentialité de votre mot de passe.',
                    'Vous pouvez supprimer votre compte à tout moment dans « Mon compte ».'
                ]),
            section('Engagements du conducteur',
                [
                    'Être titulaire d’un permis de conduire valable et conduire un véhicule en état de marche, immatriculé et assuré (responsabilité civile).',
                    'Respecter le code de la route et ne pas transporter plus de personnes que de places autorisées.',
                    'Publier des informations exactes (horaire, lieux, places, sièges déjà occupés) et prévenir ses passagers en annulant le trajet dans l’application en cas d’empêchement.',
                    'Confirmer dans l’application uniquement les trajets réellement effectués.'
                ]),
            section('Engagements du passager',
                [
                    'Être ponctuel au point de rendez-vous et respecter le conducteur et son véhicule.',
                    'Annuler sa réservation dans l’application s’il ne peut plus venir.',
                    'Répondre honnêtement à la question « le trajet a-t-il eu lieu ? ».'
                ]),
            section('VroomPoints',
                [
                    'Les VroomPoints récompensent le CO₂ évité ensemble, selon le calcul EcoVroom décrit dans l’application (« Mes VroomPoints », Règles du jeu).',
                    'Ce sont des points de jeu : ils n’ont aucune valeur monétaire, ne sont ni échangeables ni remboursables, et ne sont pas des crédits carbone.',
                    'Ils ne sont acquis qu’après la double confirmation du trajet (conducteur et passagers). Toute fraude (faux trajet, fausse confirmation, déclaration inexacte) peut entraîner l’annulation des points et la suppression du compte.',
                    'EcoVroom peut faire évoluer les règles du jeu ; les points déjà acquis restent acquis, sauf fraude.'
                ]),
            section('Comportements interdits',
                [
                    'Utiliser EcoVroom pour une activité commerciale, demander de l’argent aux passagers ou publier de faux trajets.',
                    'Harceler, discriminer ou mettre en danger d’autres utilisateurs.',
                    'Tenter de contourner la sécurité du service ou d’en extraire les données.'
                ],
                'En cas de manquement, EcoVroom peut suspendre ou supprimer un compte.'),
            section('Responsabilité',
                'EcoVroom fournit un service de mise en relation, en version bêta, sans garantie de disponibilité continue ni d’exactitude des itinéraires et des estimations. Dans les limites autorisées par la loi, EcoVroom n’est pas responsable du déroulement des trajets, des retards, des annulations ni des dommages survenus pendant un trajet, qui relèvent du conducteur, des passagers et de leurs assurances.'),
            section('Modifications et droit applicable',
                'EcoVroom peut modifier ces conditions ; la version en vigueur est toujours disponible dans l’application, avec sa date de mise à jour. En cas de changement important, les utilisateurs en sont informés.',
                `Les présentes conditions sont soumises au droit suisse. Le for juridique est ${LEGAL.forum}, sous réserve des fors impératifs prévus par la loi, notamment en faveur des consommateurs.`),
            updated());
    }
};

export const contactView = {
    render(root) {
        root.append(
            pageHero('Contact', 'Une question, un problème, une idée ? Écrivez-nous.'),
            ...draftNotice(),
            section('Nous écrire',
                `Support et questions : ${LEGAL.contactEmail}`,
                `Protection des données : ${LEGAL.privacyEmail}`,
                `Adresse : ${LEGAL.operator}, ${LEGAL.address}`),
            section('Avant de nous écrire',
                [
                    'Mot de passe oublié : utilisez le lien « Mot de passe oublié ? » sur la page de connexion.',
                    'Supprimer votre compte : « Mon compte », puis « Supprimer mon compte ».',
                    'Annuler une réservation ou un trajet : depuis la réservation (passager) ou « Mes trajets publiés » (conducteur).'
                ]));
    }
};

