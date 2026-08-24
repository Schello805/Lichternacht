import test from 'node:test';
import assert from 'node:assert/strict';

import { state } from '../js/state.js';

function currentEventWindow() {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} 00:00-23:59`;
}

test('check-in refreshes a stale GPS fix before measuring distance', async () => {
    const values = new Map([['gps_checkin_hint_seen_v1', 'true']]);
    globalThis.localStorage = {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    globalThis.document = { getElementById: () => null };

    let locateCalls = 0;
    globalThis.window = {
        locateUser: () => { locateCalls += 1; }
    };
    const { checkIn } = await import('../js/gamification.js');

    state.downloads = { ...state.downloads, icsDate: currentEventWindow() };
    state.stations = [{ id: 1, name: 'Teststation', lat: 49.157, lng: 10.548 }];
    state.userLocation = { lat: 49.157, lng: 10.548 };
    state.gpsAccuracy = 10;
    state.gpsLastFixAt = Date.now() - 61000;

    await checkIn(1);

    assert.equal(locateCalls, 1);
    assert.equal(values.get('visited_stations'), undefined);
});
