// Envoi d'e-mails (lien de réinitialisation du mot de passe). Choisi par variables d'environnement :
//   MAIL_TRANSPORT=console          affiche les e-mails dans les journaux (développement uniquement)
//   RESEND_API_KEY + MAIL_FROM      envoi réel par l'API HTTP de Resend (https://resend.com/docs)
// Sans configuration, aucun envoi : la fonction « mot de passe oublié » est désactivée.
export const RESEND_API_URL = 'https://api.resend.com/emails';

export function createMailer(env = process.env, { fetch = globalThis.fetch, log = console.log } = {}) {
    if (env.MAIL_TRANSPORT === 'console') {
        return {
            name: 'console',
            async send({ to, subject, text }) {
                log(`[e-mail] À : ${to}\n[e-mail] Objet : ${subject}\n${text}`);
            }
        };
    }
    if (env.RESEND_API_KEY && env.MAIL_FROM) {
        return {
            name: 'resend',
            async send({ to, subject, text }) {
                const response = await fetch(RESEND_API_URL, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
                    signal: AbortSignal.timeout(10000)
                });
                if (!response.ok) throw new Error(`Envoi d'e-mail refusé (${response.status}).`);
            }
        };
    }
    return null;
}

// Adresse publique du site pour les liens envoyés par e-mail. Jamais déduite de la requête
// (l'en-tête Host peut être falsifié pour envoyer un lien piégé). Render fournit RENDER_EXTERNAL_URL.
export function publicUrl(env = process.env) {
    const value = env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '';
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.hostname === 'localhost' ? url.origin : null;
    } catch {
        return null;
    }
}
