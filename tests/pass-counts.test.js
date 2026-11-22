import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { getVisitedStationRecords, getPassVisitedStationRecords, markStationVisited } from '../js/utils.js';

test('pass counts exclude cancellations and unknown stations without deleting historical visits', () => {
    const previous = { storage: globalThis.localStorage, stations: state.stations };
    const values = new Map([['visited_stations', JSON.stringify(['1', '43', '999'])]]);
    globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    state.stations = [{ id: 1 }, { id: 43, number: '1A', cancelled: true }, { id: 3 }];
    try {
        assert.deepEqual(getPassVisitedStationRecords().map(record => record.id), ['1']);
        assert.equal(getVisitedStationRecords().length, 3);
        markStationVisited(3);
        assert.equal(getPassVisitedStationRecords().length, 2);
        assert.equal(getVisitedStationRecords().length, 4);
        assert.ok(JSON.parse(values.get('visited_stations')).includes('43'));
        state.stations[1].cancelled = false;
        assert.equal(getPassVisitedStationRecords().length, 3);
    } finally {
        globalThis.localStorage = previous.storage;
        state.stations = previous.stations;
    }
});
