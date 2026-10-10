// Point d'entrée : `npm start` (variables PORT, HOST et DATA_FILE optionnelles).

import { fileURLToPath } from 'node:url';

import { createApp, VERSION } from './app.js';
import { ScenarioStore } from './storage.js';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const dataFile = process.env.DATA_FILE || fileURLToPath(new URL('../data/scenarios.json', import.meta.url));

const store = await new ScenarioStore({ file: dataFile }).load();
const server = createApp({ store });

server.listen(port, host, () => {
    console.log(`EcoVroom light ${VERSION} disponible sur http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
