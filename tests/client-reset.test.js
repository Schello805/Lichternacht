import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLikesResetToken, LIKES_RESET_TOKEN_KEY } from '../js/client-reset.js';

function createStorage(entries = {}) {
    const values = new Map(Object.entries(entries));
    return {
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] ?? null; },
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); }
    };
}

test('likes reset removes only local vote locks', () => {
    const storage = createStorage({ liked_4: 'true', favorites: '[4]', visited_stations: '[4]' });

    assert.equal(applyLikesResetToken(storage, 123), true);
    assert.equal(storage.getItem('liked_4'), null);
    assert.equal(storage.getItem('favorites'), '[4]');
    assert.equal(storage.getItem('visited_stations'), '[4]');
    assert.equal(storage.getItem(LIKES_RESET_TOKEN_KEY), '123');
});

test('same likes reset token is applied only once', () => {
    const storage = createStorage({ [LIKES_RESET_TOKEN_KEY]: '123', liked_4: 'true' });

    assert.equal(applyLikesResetToken(storage, 123), false);
    assert.equal(storage.getItem('liked_4'), 'true');
});
