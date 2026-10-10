// Petit utilitaire de création d'éléments : le texte passe par textContent, jamais par innerHTML.
export function el(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
        if (name === 'text') node.textContent = value;
        else node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
}
