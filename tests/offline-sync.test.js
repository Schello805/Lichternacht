import assert from 'node:assert/strict';
import test from 'node:test';

import { state } from '../js/state.js';
import { flushOfflineActions, queueOfflineAction } from '../js/offline-sync.js';

function createStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value))
    };
}

test('offline actions are retained and synchronized when online', async () => {
    globalThis.localStorage = createStorage();
    globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
    globalThis.window = { dispatchEvent() {} };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });

    const writes = [];
    state.useLocalStorage = false;
    state.db = {};
    state.appId = 'test-app';
    state.fb = {
        collection: (...parts) => parts.join('/'),
        addDoc: async (reference, payload) => writes.push({ reference, payload }),
        doc: (...parts) => parts.join('/'),
        updateDoc: async (reference, payload) => writes.push({ reference, payload }),
        increment: amount => ({ amount })
    };

    queueOfflineAction('audit', { eventType: 'favorite_added' });
    queueOfflineAction('like', { stationId: 4 });
    await flushOfflineActions();

    assert.equal(writes.length, 2);
    assert.equal(JSON.parse(localStorage.getItem('offline_action_queue_v1')).length, 0);
});

test('check-in retries use the authenticated owner and do not drop rejected new check-ins', async () => {
    globalThis.localStorage = createStorage();
    state.auth = { currentUser: { uid: 'visitor-1' } };
    const references = [];
    state.fb.setDoc = async reference => {
        references.push(reference);
        throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    };
    state.fb.serverTimestamp = () => 'server-time';
    state.fb.getDoc = async () => ({ exists: () => false });
    queueOfflineAction('checkin', { stationId: '4' });
    await flushOfflineActions();
    assert.match(references[0], /checkins\/visitor-1_4$/);
    assert.equal(JSON.parse(localStorage.getItem('offline_action_queue_v1')).length, 1);
    state.fb.getDoc = async () => ({ exists: () => true });
    await flushOfflineActions();
    assert.equal(JSON.parse(localStorage.getItem('offline_action_queue_v1')).length, 0);
});
