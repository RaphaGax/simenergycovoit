// Bandeau en dégradé vert → bleu de la maquette, en tête des écrans principaux.
import { el } from '../dom.js';

export function pageHero(title, subtitle, ...extra) {
    return el('section', { class: 'page-hero' },
        el('h2', { text: title }),
        ...(subtitle ? [el('p', { text: subtitle })] : []),
        ...extra);
}
