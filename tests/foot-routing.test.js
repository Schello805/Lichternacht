import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeWalkingOrder, planWalkingTour, fetchFootRoute } from '../js/foot-routing.js';

test('walking costs rather than air distances determine order, including approach', () => {
    const matrix = [[0, 100, 1, 3], [100, 0, 1, 3], [1, 1, 0, 3], [0, 100, 100, 0]];
    assert.deepEqual(optimizeWalkingOrder(matrix, 3, 'open', true), [0, 2, 1]);
    assert.equal(new Set(optimizeWalkingOrder(matrix, 3, 'round', true)).size, 3);
    assert.throws(() => optimizeWalkingOrder([[0, null], [10, 0]], 2), /erreichbar/);
    assert.throws(() => optimizeWalkingOrder([[0, -1], [10, 0]], 2), /erreichbar/);
});

test('optimizer supports asymmetric footpaths and never duplicates stations', () => {
    const matrix = [[0, 1, 50, 50], [50, 0, 1, 50], [50, 50, 0, 1], [1, 50, 50, 0]];
    const order = optimizeWalkingOrder(matrix, 4, 'round');
    const cost = order.reduce((total, index, position) => total + matrix[index][order[(position + 1) % 4]], 0);
    assert.equal(cost, 4);
    assert.equal(new Set(order).size, 4);
});

test('GPS origin determines first stop, then each next stop is nearest by walking time', () => {
    const matrix = [[0, 5, 20, 30], [5, 0, 2, 30], [20, 2, 0, 30], [1, 8, 10, 0]];
    assert.deepEqual(optimizeWalkingOrder(matrix, 3, 'round', true), [0, 1, 2]);
    assert.deepEqual(optimizeWalkingOrder(matrix, 3, 'open', true), [0, 1, 2]);
});

test('closed GPS tour returns to frozen GPS point, open tour omits that return', async () => {
    const originalFetch = globalThis.fetch;
    const paths = [];
    const origin = [15, 49];
    globalThis.fetch = async url => {
        paths.push(url);
        return { ok: true, json: async () => url.includes('/table/')
            ? { code: 'Ok', durations: [[0, 5, 3], [5, 0, 7], [3, 7, 0]] }
            : { code: 'Ok', routes: [{ distance: 50, duration: 40, geometry: { type: 'LineString', coordinates: [[15, 49], [15.001, 49]] } }] } };
    };
    try {
        const stations = [{ id: 1, lng: 15.001, lat: 49 }, { id: 2, lng: 15.002, lat: 49 }];
        await planWalkingTour(stations, 'round', origin);
        const closed = paths.at(-1).split('/driving/')[1].split('?')[0].split(';');
        assert.deepEqual(closed, ['15,49', '15.001,49', '15.002,49', '15,49']);
        await planWalkingTour(stations, 'open', origin);
        assert.deepEqual(paths.at(-1).split('/driving/')[1].split('?')[0].split(';'), closed.slice(0, -1));
    } finally { globalThis.fetch = originalFetch; }
});

test('tour requests a walking matrix then the matching open or closed street geometry', async () => {
    const originalFetch = globalThis.fetch;
    const urls = [];
    globalThis.fetch = async url => {
        urls.push(url);
        return { ok: true, json: async () => url.includes('/table/')
            ? { code: 'Ok', durations: [[0, 10, 2], [10, 0, 2], [2, 2, 0]] }
            : { code: 'Ok', routes: [{ distance: 123, duration: 100, geometry: { type: 'LineString', coordinates: [[10, 49], [10.001, 49]] } }] } };
    };
    try {
        const stations = [{ id: 1, lng: 10, lat: 49 }, { id: 2, lng: 10.001, lat: 49 }, { id: 3, lng: 10.002, lat: 49 }];
        const open = await planWalkingTour(stations, 'open', null);
        assert.deepEqual(open.stations.map(station => station.id), [1, 3, 2]);
        assert.equal(open.route.distance, 123);
        assert.ok(urls.every(url => url.includes('/routed-foot/')));
        assert.equal(urls[1].split('/driving/')[1].split('?')[0].split(';').length, 3);
        await planWalkingTour(stations, 'round', null);
        assert.equal(urls.at(-1).split('/driving/')[1].split('?')[0].split(';').length, 4);
        assert.equal(urls.filter(url => url.includes('/table/')).length, 1);
    } finally { globalThis.fetch = originalFetch; }
});

test('transient requests retry once, cancellation and permanent failures do not', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error('network'); };
    try {
        await assert.rejects(fetchFootRoute([[11, 49], [11.1, 49]]), /network/);
        assert.equal(calls, 2);
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(fetchFootRoute([[11, 49], [11.1, 49]], controller.signal), { name: 'AbortError' });
        assert.equal(calls, 2);
        globalThis.fetch = async () => { calls += 1; return { ok: false, status: 429 }; };
        await assert.rejects(fetchFootRoute([[12, 49], [12.1, 49]]));
        assert.equal(calls, 3);
    } finally { globalThis.fetch = originalFetch; }
});

test('malformed geometry and distant road snapping are rejected', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1, duration: 1, geometry: { type: 'LineString', coordinates: [[0, 0], [null, 49]] } }] }) });
        await assert.rejects(fetchFootRoute([[13, 49], [13.1, 49]]), /Ungültige/);
        globalThis.fetch = async () => ({ ok: true, json: async () => ({ code: 'Ok', waypoints: [{ distance: 150 }], routes: [{ distance: 1, duration: 1, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] }) });
        await assert.rejects(fetchFootRoute([[14, 49], [14.1, 49]]), /zu weit/);
    } finally { globalThis.fetch = originalFetch; }
});
