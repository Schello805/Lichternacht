import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseFirestore, noteFirestoreError } from '../js/firebase-quota.js';

test('quota errors pause retries, other failures do not', () => {
    assert.equal(canUseFirestore(), true);
    assert.equal(noteFirestoreError({ code: 'permission-denied' }), false);
    assert.equal(canUseFirestore(), true);
    assert.equal(noteFirestoreError({ code: 'firestore/resource-exhausted' }), true);
    assert.equal(canUseFirestore(), false);
});
