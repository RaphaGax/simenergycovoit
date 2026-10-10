// Point d'entrée navigateur.

import { createApiClient } from './api.js';
import { initApp } from './app.js';

function download(content, filename) {
    // BOM UTF-8 pour qu'Excel affiche correctement les accents.
    const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

initApp(document, {
    api: createApiClient(),
    ChartCtor: window.Chart,
    download,
    confirm: message => window.confirm(message)
});
