import test from 'node:test';
import assert from 'node:assert/strict';
import { createProximityDwell } from '../js/proximity-dwell.js';

const sample = (fixAt, id = 1, accuracy = 10) => ({ id, accuracy, fixAt });

test('automatic suggestion waits ten seconds with repeated fresh fixes for the same station', () => {
    const update = createProximityDwell();
    for (const now of [1000, 4000, 8000, 10999]) assert.equal(update(sample(now), now).ready, false);
    assert.equal(update(sample(11000), 11000).ready, true);
});

test('manual suggestion may appear on its timer while the latest advancing fix is still fresh', () => {
    const update = createProximityDwell();
    for (const now of [1000, 4000, 7000, 10000]) update(sample(now), now);
    assert.equal(update(sample(10000), 11000).ready, true);
});

test('a single cached fix, inaccurate location, missing accuracy and future fixes never trigger a suggestion', () => {
    for (const invalid of [sample(1000), sample(11000, 1, 21), sample(11000, 1, null), sample(12000)]) {
        const update = createProximityDwell();
        update(sample(1000), 1000);
        assert.equal(update(invalid, 11000).ready, false);
    }
});

test('station changes, leaving the radius, backgrounding and GPS gaps restart the dwell', () => {
    for (const reset of [sample(9000, 2), sample(9000, null), { ...sample(9000), visible: false }, sample(9000, 1, 70)]) {
        const update = createProximityDwell();
        update(sample(1000), 1000);
        update(sample(5000), 5000);
        update(reset, 9000);
        assert.equal(update(sample(11000), 11000).ready, false);
    }
    const update = createProximityDwell();
    update(sample(1000), 1000);
    assert.equal(update(sample(11000), 11000).ready, false);
});

test('automatic dwell is strictly longer than two minutes and requires an advancing fix', () => {
    const update = createProximityDwell({ durationMs: 120000, strictlyLonger: true });
    for (let now = 1000; now <= 121000; now += 1000) {
        assert.equal(update(sample(now), now).ready, false);
    }
    assert.equal(update(sample(121000), 122000).ready, false);
    assert.equal(update(sample(122000), 122000).ready, true);
    assert.equal(update(sample(122000), 122001).ready, false);
});

test('wall-clock gaps, backwards time and stale replays restart continuous coverage', () => {
    for (const discontinuity of [
        { fixAt: 105000, now: 110001 },
        { fixAt: 110001, now: 110001 },
        { fixAt: 99000, now: 99000 }
    ]) {
        const update = createProximityDwell({ durationMs: 120000, strictlyLonger: true });
        for (let now = 1000; now <= 105000; now += 1000) update(sample(now), now);
        assert.equal(update(sample(discontinuity.fixAt), discontinuity.now).ready, false);
        for (let now = 111000; now <= 125000; now += 1000) {
            assert.equal(update(sample(now), now).ready, false);
        }
    }
});
