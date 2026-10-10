import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalCollection } from '../../src/services/localCollection.js';
import { createTripRepository } from '../../src/services/tripRepository.js';
import { createBookingRepository } from '../../src/services/bookingRepository.js';

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: key => (key in data ? data[key] : null),
        setItem: (key, value) => { data[key] = String(value); }
    };
}

test('save puis list renvoie les objets enregistrés', () => {
    const collection = createLocalCollection('test', memoryStorage());
    assert.deepEqual(collection.list(), []);
    collection.save({ id: 'a', origin: 'Lausanne' });
    collection.save({ id: 'b', origin: 'Sion' });
    assert.deepEqual(collection.list().map(t => t.id), ['a', 'b']);
});

test('get renvoie un objet par identifiant, ou null', () => {
    const collection = createLocalCollection('test', memoryStorage());
    collection.save({ id: 'a', seats: 2 });
    assert.deepEqual(collection.get('a'), { id: 'a', seats: 2 });
    assert.equal(collection.get('z'), null);
});

test('save remplace un objet de même identifiant', () => {
    const collection = createLocalCollection('test', memoryStorage());
    collection.save({ id: 'a', seats: 2 });
    collection.save({ id: 'a', seats: 3 });
    assert.deepEqual(collection.list(), [{ id: 'a', seats: 3 }]);
});

test('un stockage corrompu ou bloqué donne une liste vide', () => {
    assert.deepEqual(createLocalCollection('test', memoryStorage({ test: '{oups' })).list(), []);
    const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
    const collection = createLocalCollection('test', blocked);
    assert.deepEqual(collection.list(), []);
    assert.equal(collection.get('a'), null);
    assert.throws(() => collection.save({ id: 'a' }), /SecurityError/);
});

test('trajets et réservations sont stockés sous des clés distinctes', () => {
    const storage = memoryStorage();
    createTripRepository(storage).save({ id: 't1' });
    createBookingRepository(storage).save({ id: 'b1' });
    assert.deepEqual(Object.keys(storage.data).sort(), ['ecovroom.bookings', 'ecovroom.trips']);
});
