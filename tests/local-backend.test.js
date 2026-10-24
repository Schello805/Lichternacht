import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { initializeLocalBackend } from '../js/local-backend.js';

test('local adapter reads core data and routes atomic batches without Firestore writes', async () => {
    const snapshot = { ok: true, appId: 'test', stations: [{ id: 1, name: 'Station' }], events: [], config: {} };
    const writes = [];
    state.auth = { currentUser: { getIdToken: async () => 'test-token' } };
    state.fb = {
        doc: (reference, id) => ({ path: reference.path + '/' + id, id }),
        increment: amount => ({ amount }),
        setDoc: () => { throw new Error('Unexpected Firestore write'); }
    };
    globalThis.fetch = async (url, options = {}) => {
        if (options.method === 'POST') writes.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => snapshot };
    };
    assert.equal(await initializeLocalBackend(), true);
    const stations = { path: 'artifacts/test/public/data/stations' };
    const documents = await state.fb.getDocs(stations);
    assert.equal(documents.docs[0].data().name, 'Station');
    const batch = state.fb.writeBatch({});
    batch.set({ path: stations.path + '/2' }, { id: 2 });
    batch.delete({ path: stations.path + '/1' });
    await batch.commit();
    assert.equal(writes[0].operations.length, 2);
    await state.fb.updateDoc({ path: stations.path + '/1' }, { likes: state.fb.increment(1) });
    assert.equal(writes[1].action, 'like');
    const mixed = state.fb.writeBatch({});
    mixed.set({ path: stations.path + '/3' }, { id: 3 });
    mixed.set({ path: 'global/stats' }, {});
    await assert.rejects(mixed.commit(), /Gemischte/);
    assert.equal(writes.length, 2);
});
