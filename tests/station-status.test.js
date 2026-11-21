import test from 'node:test';
import assert from 'node:assert/strict';
import { isStationCancelled, countAvailableStations } from '../js/station-status.js';

test('only explicit cancellations reduce the pass station total', () => {
    const stations = [{ id: 1 }, { id: 2, cancelled: true }, { id: 3, cancelled: false }];
    assert.equal(countAvailableStations(stations), 2);
    assert.equal(isStationCancelled(undefined), false);
    assert.equal(countAvailableStations(null), 0);
    stations[1].cancelled = false;
    assert.equal(countAvailableStations(stations), 3);
});
