import test from 'node:test';
import assert from 'node:assert/strict';
import { getStationTags } from '../js/station-tags.js';

test('station tags normalize spelling and translated categories without substring matches', () => {
    assert.deepEqual(getStationTags({ tags: [' WC ', 'wc', 'Essen', 'food', 'Getränke'] }), ['wc', 'food', 'drink']);
    assert.deepEqual(getStationTags({ tags: ['wc-frei', 'foodtruck'] }), ['wc-frei', 'foodtruck']);
    assert.deepEqual(getStationTags({ tags: 'food,wc' }), []);
});
