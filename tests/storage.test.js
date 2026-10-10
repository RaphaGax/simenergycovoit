import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MAX_NAME_LENGTH, ScenarioStore, StoreError } from '../server/storage.js';

const sample = name => ({ name, input: { totalCars: 1 }, summary: { totalCars: 1 } });

describe('ScenarioStore en mémoire', () => {
    it('crée, liste, lit et supprime un scénario', async () => {
        const store = new ScenarioStore();
        const created = await store.create(sample('  Parc 2030  '));
        assert.equal(created.name, 'Parc 2030', 'le nom est nettoyé');
        assert.match(created.id, /^[0-9a-f-]{36}$/);
        assert.ok(!Number.isNaN(Date.parse(created.createdAt)));

        assert.deepEqual(store.list().map(s => s.id), [created.id]);
        assert.equal(store.list()[0].input, undefined, 'la liste ne contient qu’un résumé');
        assert.deepEqual(store.get(created.id).input, { totalCars: 1 });

        assert.equal(await store.delete(created.id), true);
        assert.equal(await store.delete(created.id), false);
        assert.equal(store.get(created.id), null);
    });

    it('trie la liste du plus récent au plus ancien', async () => {
        const store = new ScenarioStore();
        const a = await store.create(sample('A'));
        a.createdAt = '2020-01-01T00:00:00.000Z';
        const b = await store.create(sample('B'));
        assert.deepEqual(store.list().map(s => s.name), [b.name, a.name]);
    });

    for (const bad of ['', '   ', 'x'.repeat(MAX_NAME_LENGTH + 1), undefined, 42]) {
        it(`refuse le nom ${JSON.stringify(bad)?.slice(0, 20)}`, async () => {
            await assert.rejects(new ScenarioStore().create(sample(bad)), err => err instanceof StoreError && err.status === 400);
        });
    }

    it('limite le nombre de scénarios', async () => {
        const store = new ScenarioStore({ maxScenarios: 2 });
        await store.create(sample('1'));
        await store.create(sample('2'));
        await assert.rejects(store.create(sample('3')), err => err.status === 409);
    });
});

describe('ScenarioStore persistant', () => {
    let dir;
    beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'ecovroom-')); });
    afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

    it('démarre vide si le fichier n’existe pas', async () => {
        const store = await new ScenarioStore({ file: join(dir, 'absent.json') }).load();
        assert.deepEqual(store.list(), []);
    });

    it('persiste et recharge les scénarios (dossier créé si besoin)', async () => {
        const file = join(dir, 'sub', 'scenarios.json');
        const store = await new ScenarioStore({ file }).load();
        const created = await store.create(sample('Persisté'));
        await store.create(sample('Autre'));
        await store.delete((await store.create(sample('Éphémère'))).id);

        const onDisk = JSON.parse(await readFile(file, 'utf8'));
        assert.equal(onDisk.length, 2);

        const reloaded = await new ScenarioStore({ file }).load();
        assert.equal(reloaded.get(created.id).name, 'Persisté');
        assert.equal(reloaded.list().length, 2);
    });

    it('sérialise les écritures concurrentes', async () => {
        const file = join(dir, 'scenarios.json');
        const store = new ScenarioStore({ file });
        await Promise.all(Array.from({ length: 20 }, (_, i) => store.create(sample(`S${i}`))));
        assert.equal(JSON.parse(await readFile(file, 'utf8')).length, 20);
    });

    it('signale un fichier corrompu', async () => {
        const file = join(dir, 'scenarios.json');
        await writeFile(file, '{pas du json');
        await assert.rejects(new ScenarioStore({ file }).load(), /Impossible de lire/);
    });
});
