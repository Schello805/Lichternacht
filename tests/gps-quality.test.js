import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAcceptGpsPosition } from '../js/gps-quality.js';

const fix = (timestamp, accuracy = 5, latitude = 49.158) => ({ timestamp, coords: { latitude, longitude: 10.552, accuracy } });
const previous = { userLocation: { lat: 49.158, lng: 10.552 }, gpsLastFixAt: 10000, gpsAccuracy: 5 };

test('older, duplicate and inaccurate fixes cannot overwrite a fresh accurate location', () => {
    assert.equal(shouldAcceptGpsPosition(fix(9000), previous, 11000), false);
    assert.equal(shouldAcceptGpsPosition(fix(10000), previous, 11000), false);
    assert.equal(shouldAcceptGpsPosition(fix(11000, 150), previous, 11000), false);
    assert.equal(shouldAcceptGpsPosition(fix(10000, 3), previous, 11000), true);
});

test('real movement and accurate recovery remain possible without inventing coordinates', () => {
    assert.equal(shouldAcceptGpsPosition(fix(11000, 5, 49.1581), previous, 11000), true);
    assert.equal(shouldAcceptGpsPosition(fix(26000, 80, 49.16), previous, 26000), true);
    assert.equal(shouldAcceptGpsPosition(fix(27000, 5, 49.16), { ...previous, gpsLastFixAt: 26000, gpsAccuracy: 80 }, 27000), true);
});

test('stale, future, malformed and out-of-range first fixes are rejected too', () => {
    for (const position of [fix(0), fix(21000), fix(20000, -1), fix(20000, 5, 91), fix(20000, 5, null), { coords: fix(20000).coords }]) {
        assert.equal(shouldAcceptGpsPosition(position, {}, 20000), false);
    }
    assert.equal(shouldAcceptGpsPosition(fix(20000), {}, 20000), true);
});
