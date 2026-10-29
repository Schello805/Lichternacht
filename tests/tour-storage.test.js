import test from 'node:test';
import assert from 'node:assert/strict';
import { readSavedTour, saveTour, TOUR_STORAGE_KEY } from '../js/tour-storage.js';

const stations = [{ id: 1, lat: 49, lng: 10 }, { id: 43, number: '1A', lat: 49.001, lng: 10.001 }];
function fixture() {
    const values = new Map();
    const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
    const state = { overviewRouteNavigationActive: true, overviewRouteMode: 'round', overviewRouteStations: stations,
        overviewRouteOrigin: { lat: 48.999, lng: 10 }, overviewRouteGeometry: { type: 'LineString', coordinates: [[10, 48.999], [10, 49], [10.001, 49.001], [10, 48.999]] },
        overviewRouteNavigationProgress: 1, overviewRouteReached: 0, overviewRouteSkipped: 1, overviewRouteSummary: '500 m · Gehzeit ca. 7 Min.' };
    return { storage, state };
}

test('local tour roundtrip preserves stable IDs, original start, order and skipped progress', () => {
    const { storage, state } = fixture();
    assert.equal(saveTour(storage, state), true);
    const saved = readSavedTour(storage, stations);
    assert.deepEqual(saved.stationIds, ['1', '43']);
    assert.deepEqual(saved.origin, state.overviewRouteOrigin);
    assert.equal(saved.progress, 1);
    assert.equal(saved.skipped, 1);
    assert.deepEqual(saved.geometry, state.overviewRouteGeometry);
    assert.equal(readSavedTour(storage, [stations[0]]), null);
    state.overviewRouteCompleted = true;
    saveTour(storage, state);
    assert.equal(storage.getItem(TOUR_STORAGE_KEY), null);
});

test('return leg is resumable but completed open tours and malformed saves are not', () => {
    const { storage, state } = fixture();
    state.overviewRouteNavigationProgress = 2;
    state.overviewRouteReached = 1;
    saveTour(storage, state);
    assert.equal(readSavedTour(storage, stations).progress, 2);
    state.overviewRouteMode = 'open';
    saveTour(storage, state);
    assert.equal(readSavedTour(storage, stations), null);
    storage.setItem(TOUR_STORAGE_KEY, '{bad');
    assert.equal(readSavedTour(storage, stations), null);
    assert.equal(saveTour({ getItem() { return null; }, setItem() { throw new Error('quota'); } }, state), false);
});
