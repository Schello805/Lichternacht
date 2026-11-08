import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { nearestActivityStation } from '../js/station-activity.js';

test('activity uses only the nearest station within 20 meters with fresh accurate GPS', () => {
    const now = Date.now();
    const stations = [{ id: 1, lat: 49, lng: 10 }, { id: 2, lat: 49.00005, lng: 10 }];
    assert.equal(nearestActivityStation(stations, { lat: 49, lng: 10 }, 5, now, now).id, 1);
    assert.equal(nearestActivityStation(stations, { lat: 49.001, lng: 10 }, 5, now, now), null);
    assert.equal(nearestActivityStation(stations, stations[0], 31, now, now), null);
    assert.equal(nearestActivityStation(stations, stations[0], 5, now - 15001, now), null);
    assert.equal(nearestActivityStation(stations, stations[0], 5, now + 1, now), null);
    assert.equal(nearestActivityStation(stations, null, 5, now, now), null);
});

test('analysis keeps detected visits separate from checkins and includes stations without checkins', async () => {
    const source = await readFile(new URL('../js/admin.js', import.meta.url), 'utf8');
    const context = vm.createContext({ state: { stations: [{ id: 1, name: 'Erste' }, { id: 2, name: 'Zweite' }] } });
    vm.runInContext(source.slice(source.indexOf('function buildUsageSummary('), source.indexOf('function renderUsageSummary(')), context);
    const summary = context.buildUsageSummary([{ stationId: '1', anonymousId: 'checkin-only' }], [
        { stationId: '1', visits: 80, checkedIn: 32, checkinPercent: 40 },
        { stationId: '2', visits: 4, checkedIn: 0, checkinPercent: 0 }
    ]);
    assert.equal(summary.stationRows[0].checkinPercent, 40);
    assert.equal(summary.stationRows[0].count, 1);
    assert.equal(summary.stationRows[1].visits, 4);
    assert.equal(summary.stationRows[1].count, 0);
    assert.equal(summary.stationsWithoutCheckins[0].stationId, '2');
    assert.equal(summary.stationsWithCheckins, 1);
});
