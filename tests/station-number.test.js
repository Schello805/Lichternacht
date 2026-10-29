import test from 'node:test';
import assert from 'node:assert/strict';
import { getStationNumber, compareStationNumbers } from '../js/station-number.js';
import { validateStations } from '../js/validate.js';

test('display number is independent from stable identity and falls back for legacy stations', () => {
    const station = { id: 20, number: 26 };
    assert.equal(getStationNumber(station), 26);
    assert.equal(station.id, 20);
    assert.equal(getStationNumber({ id: 20 }), 20);
    for (const number of [null, true, '', 0, -1, 'bad', Infinity]) assert.equal(getStationNumber({ id: 20, number }), 20);
    assert.equal(getStationNumber({ id: 20, number: '26' }), 26);
    assert.deepEqual([{ id: 20, number: 26 }, { id: 15, number: 20 }].sort(compareStationNumbers).map(item => item.id), [15, 20]);
});

test('validation rejects duplicate and invalid public numbers without confusing stable IDs', () => {
    const first = { id: 20, number: 26, name: 'Imkerverein', lat: 49.15, lng: 10.55, tags: [] };
    const second = { ...first, id: 26, number: 34 };
    assert.equal(validateStations([first, second]).filter(issue => issue.severity === 'error').length, 0);
    assert.ok(validateStations([first, { ...second, number: 26 }]).some(issue => issue.field === 'number' && issue.severity === 'error'));
    assert.ok(validateStations([{ ...first, number: true }]).some(issue => issue.field === 'number' && issue.severity === 'error'));
});
