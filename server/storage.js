// Stockage des scénarios : en mémoire, avec persistance optionnelle dans un fichier JSON.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const MAX_SCENARIOS = 500;
export const MAX_NAME_LENGTH = 80;

export class StoreError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'StoreError';
        this.status = status;
    }
}

export class ScenarioStore {
    /** @param {{ file?: string, maxScenarios?: number }} [options] sans `file`, le stockage reste en mémoire */
    constructor({ file, maxScenarios = MAX_SCENARIOS } = {}) {
        this.file = file;
        this.maxScenarios = maxScenarios;
        this.scenarios = new Map();
        this.writeQueue = Promise.resolve();
    }

    async load() {
        if (!this.file) return this;
        try {
            const data = JSON.parse(await readFile(this.file, 'utf8'));
            if (!Array.isArray(data)) throw new Error('format inattendu');
            this.scenarios = new Map(data.map(s => [s.id, s]));
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw new Error(`Impossible de lire ${this.file} : ${error.message}`);
            }
        }
        return this;
    }

    list() {
        return [...this.scenarios.values()]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(({ id, name, createdAt, summary }) => ({ id, name, createdAt, summary }));
    }

    get(id) {
        return this.scenarios.get(id) ?? null;
    }

    async create({ name, input, summary }) {
        const cleanName = typeof name === 'string' ? name.trim() : '';
        if (cleanName.length === 0 || cleanName.length > MAX_NAME_LENGTH) {
            throw new StoreError(`Le nom du scénario doit contenir entre 1 et ${MAX_NAME_LENGTH} caractères.`, 400);
        }
        if (this.scenarios.size >= this.maxScenarios) {
            throw new StoreError(`Nombre maximal de scénarios atteint (${this.maxScenarios}).`, 409);
        }
        const scenario = { id: randomUUID(), name: cleanName, createdAt: new Date().toISOString(), input, summary };
        this.scenarios.set(scenario.id, scenario);
        await this.persist();
        return scenario;
    }

    async delete(id) {
        const existed = this.scenarios.delete(id);
        if (existed) await this.persist();
        return existed;
    }

    // Les écritures sont sérialisées et atomiques (fichier temporaire puis renommage).
    persist() {
        if (!this.file) return Promise.resolve();
        const snapshot = JSON.stringify([...this.scenarios.values()], null, 2);
        this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
            await mkdir(dirname(this.file), { recursive: true });
            const tmp = `${this.file}.${process.pid}.tmp`;
            await writeFile(tmp, snapshot, 'utf8');
            await rename(tmp, this.file);
        });
        return this.writeQueue;
    }
}
