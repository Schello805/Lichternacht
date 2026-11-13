import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { nearestActivityStation } from '../js/station-activity.js';
import { state } from '../js/state.js';
import { installLocalRecords } from '../js/local-records.js';

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

test('local checkins and undo transmit the current station token only while consent remains granted', async () => {
    const previous = { storage: globalThis.localStorage, fetch: globalThis.fetch, fb: state.fb, auth: state.auth, downloads: state.downloads };
    const values = new Map([
        ['station_activity_consent_v1', 'granted'],
        ['station_activity_tokens_v1', JSON.stringify({ '2026-11-21:43': { token: 'a'.repeat(64), expiresAt: Date.now() + 3600000 } })]
    ]);
    const payloads = [];
    try {
        globalThis.localStorage = { getItem: key => values.get(key) ?? null };
        globalThis.fetch = async (_url, options) => {
            payloads.push(JSON.parse(options.body));
            return { ok: true, json: async () => ({ ok: true }) };
        };
        state.downloads = { icsDate: '21.11.2026 17:00-21:00' };
        state.auth = { currentUser: { getIdToken: async () => 'local-session' } };
        state.fb = {};
        installLocalRecords('test');
        const reference = { path: 'artifacts/test/public/data/checkins/visitor_43' };
        await state.fb.setDoc(reference, { stationId: '43' });
        await state.fb.undoCheckin('43');
        assert.equal(payloads[0].data.activityToken, 'a'.repeat(64));
        assert.equal(payloads[1].data.activityToken, 'a'.repeat(64));
        values.set('station_activity_consent_v1', 'denied');
        await state.fb.setDoc(reference, { stationId: '43' });
        await state.fb.undoCheckin('43');
        assert.equal(payloads[2].data.activityToken, undefined);
        assert.equal(payloads[3].data.activityToken, null);
    } finally {
        globalThis.localStorage = previous.storage;
        globalThis.fetch = previous.fetch;
        state.fb = previous.fb;
        state.auth = previous.auth;
        state.downloads = previous.downloads;
    }
});
