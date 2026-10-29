import test from 'node:test';
import assert from 'node:assert/strict';
import { getStationNumber, compareStationNumbers, normalizeStationNumber } from '../js/station-number.js';
import { validateStations } from '../js/validate.js';

test('letter suffixes normalize and sort naturally without changing identity', () => {
    assert.equal(normalizeStationNumber(' 1a '), '1A');
    assert.equal(normalizeStationNumber('43'), 43);
    assert.equal(getStationNumber({ id: 43, number: '1a' }), '1A');
    for (const value of ['0A', 'A1', '1AA', '1 A', true, 1.5, '9007199254740992A']) {
        assert.equal(normalizeStationNumber(value), null);
    }
    assert.deepEqual([2, '1B', 1, '10A', '1A', 10].map(number => ({ number })).sort(compareStationNumbers).map(station => station.number), [1, '1A', '1B', 2, 10, '10A']);
    const station = { id: 43, number: '1A', name: 'Genussgalerie', lat: 49.15, lng: 10.55, tags: [] };
    assert.equal(validateStations([station, { ...station, id: 1, number: 1 }]).filter(issue => issue.severity === 'error').length, 0);
    assert.ok(validateStations([station, { ...station, id: 2, number: '1a' }]).some(issue => issue.field === 'number' && issue.severity === 'error'));
});

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
