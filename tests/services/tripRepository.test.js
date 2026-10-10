import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTripRepository } from '../../src/services/tripRepository.js';

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        getItem: key => (key in data ? data[key] : null),
        setItem: (key, value) => { data[key] = String(value); }
    };
}

test('save puis list renvoie les trajets enregistrés', () => {
    const repo = createTripRepository(memoryStorage());
    assert.deepEqual(repo.list(), []);
    repo.save({ id: 'a', origin: 'Lausanne' });
    repo.save({ id: 'b', origin: 'Sion' });
    assert.deepEqual(repo.list().map(t => t.id), ['a', 'b']);
});

test('save remplace un trajet de même identifiant', () => {
    const repo = createTripRepository(memoryStorage());
    repo.save({ id: 'a', seats: 2 });
    repo.save({ id: 'a', seats: 3 });
    assert.deepEqual(repo.list(), [{ id: 'a', seats: 3 }]);
});

test('un stockage corrompu ou bloqué donne une liste vide', () => {
    assert.deepEqual(createTripRepository(memoryStorage({ 'ecovroom.trips': '{oups' })).list(), []);
    const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
    const repo = createTripRepository(blocked);
    assert.deepEqual(repo.list(), []);
    assert.throws(() => repo.save({ id: 'a' }), /SecurityError/);
});
