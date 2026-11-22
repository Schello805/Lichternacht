import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';

test('automatic check-in consent, continuous coverage and modal integration', async context => {
    const originalNow = Date.now;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalStorage = globalThis.localStorage;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const values = new Map();
    const elements = new Map();
    const listeners = new Map();
    let now = originalNow();
    let nextId = 100;
    let locateCalls = 0;
    let timers = 0;
    Date.now = () => now;
    globalThis.localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    globalThis.document = {
        visibilityState: 'visible',
        getElementById: id => elements.get(id) ?? null,
        addEventListener: (event, listener) => listeners.set(event, listener),
        createElement: () => ({})
    };
    globalThis.window = {
        addEventListener: (event, listener) => listeners.set(event, listener),
        locateUser: () => { locateCalls++; },
        setTimeout: () => { timers++; }
    };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    context.after(() => {
        Date.now = originalNow;
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
        globalThis.localStorage = originalStorage;
        if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
        else delete globalThis.navigator;
    });
    const { checkProximity, checkIn, setAutoCheckinEnabled, initAutoCheckin } = await import('../js/gamification.js');
    function setup() {
        values.clear();
        elements.clear();
        now = originalNow();
        document.visibilityState = 'visible';
        const today = new Date();
        state.downloads = { icsDate: `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()} 00:00-23:59` };
        state.stations = [
            { id: nextId++, name: 'Near', lat: 49.157, lng: 10.548 },
            ...[1, 2, 3].map(offset => ({ id: nextId++, name: 'Far', lat: 49.157 + offset, lng: 10.548 }))
        ];
        state.userLocation = { lat: 49.157, lng: 10.548 };
        state.gpsAccuracy = 10;
        state.gpsLastFixAt = now;
        state.useLocalStorage = true;
        state.localBackend = false;
        state.smartActionStationId = null;
        state.markers = [];
        state.config = {};
        return state.stations[0].id;
    }
    function tick(milliseconds = 1000, fresh = true) {
        now += milliseconds;
        if (fresh) state.gpsLastFixAt = now;
        checkProximity(state.userLocation.lat, state.userLocation.lng);
    }
    function cover(seconds) {
        for (let count = 0; count < seconds; count++) tick();
    }
    const visited = () => JSON.parse(values.get('visited_stations') || '[]');

    await context.test('default off, even with a saved or prechecked checkbox', () => {
        setup();
        values.set('auto_checkin_enabled', 'true');
        const checkbox = { checked: true, addEventListener() {} };
        elements.set('auto-checkin-enabled', checkbox);
        initAutoCheckin();
        assert.equal(checkbox.checked, false);
        cover(130);
        assert.deepEqual(visited(), []);
    });

    await context.test('strict threshold, fresh fixes and no GPS-hint modal or timer', () => {
        const id = setup();
        setAutoCheckinEnabled(true);
        checkProximity(state.userLocation.lat, state.userLocation.lng);
        cover(120);
        assert.deepEqual(visited(), []);
        tick(1000, false);
        assert.deepEqual(visited(), []);
        tick();
        assert.deepEqual(visited(), [String(id)]);
        assert.equal(values.has('gps_checkin_hint_seen_v1'), false);
        assert.equal(locateCalls, 0);
        assert.equal(timers, 0);
    });

    await context.test('hidden transitions, pagehide and GPS gaps reset elapsed time', () => {
        for (const reset of ['visibilitychange', 'pagehide', 'gap', 'exit']) {
            setup();
            setAutoCheckinEnabled(true);
            checkProximity(state.userLocation.lat, state.userLocation.lng);
            cover(119);
            if (reset === 'visibilitychange') {
                document.visibilityState = 'hidden';
                listeners.get(reset)();
                tick();
                document.visibilityState = 'visible';
            } else if (reset === 'pagehide') listeners.get(reset)();
            else if (reset === 'gap') tick(6000);
            else {
                state.userLocation.lat += 0.001;
                tick();
                state.userLocation.lat -= 0.001;
            }
            cover(5);
            assert.deepEqual(visited(), [], reset);
        }
    });

    await context.test('stale, inaccurate, future, ambiguous and cancelled fixes never check in', () => {
        for (const invalid of ['stale', 'inaccurate', 'missing', 'future', 'ambiguous', 'cancelled', 'mismatch', 'visitedNearest']) {
            const id = setup();
            setAutoCheckinEnabled(true);
            if (invalid === 'inaccurate') state.gpsAccuracy = 21;
            if (invalid === 'missing') state.gpsAccuracy = null;
            if (invalid === 'ambiguous') state.stations[1] = { ...state.stations[0], id: nextId++ };
            if (invalid === 'cancelled') state.stations[0].cancelled = true;
            if (invalid === 'visitedNearest') {
                values.set('visited_stations', JSON.stringify([String(id)]));
                state.stations[1] = { ...state.stations[1], lat: 49.15701, lng: 10.548 };
            }
            for (let count = 0; count < 130; count++) {
                now += 1000;
                if (invalid !== 'stale') state.gpsLastFixAt = now + (invalid === 'future' ? 1 : 0);
                checkProximity(state.userLocation.lat + (invalid === 'mismatch' ? 0.00001 : 0), state.userLocation.lng);
            }
            assert.deepEqual(visited(), invalid === 'visitedNearest' ? [String(id)] : [], invalid);
        }
    });

    await context.test('a nearer cancelled station is excluded, manual check-in remains available', async () => {
        setup();
        setAutoCheckinEnabled(false);
        values.set('gps_checkin_hint_seen_v1', 'true');
        await checkIn(state.stations[0].id);
        assert.equal(visited().length, 1);
        const id = setup();
        state.stations[1] = { id: nextId++, lat: 49.157, lng: 10.548, cancelled: true };
        state.stations[0].lat += 0.00001;
        setAutoCheckinEnabled(true);
        checkProximity(state.userLocation.lat, state.userLocation.lng);
        cover(121);
        assert.deepEqual(visited(), [String(id)]);
    });

    await context.test('an unsuccessful attempt is not repeated on later fixes or opt-in toggles', async () => {
        setup();
        setAutoCheckinEnabled(true);
        let attempts = 0;
        const setItem = localStorage.setItem;
        localStorage.setItem = (key, value) => {
            if (key === 'visited_station_log') { attempts++; throw new Error('Storage unavailable'); }
            setItem(key, value);
        };
        const originalWarn = console.warn;
        console.warn = () => {};
        try {
            checkProximity(state.userLocation.lat, state.userLocation.lng);
            cover(130);
            await Promise.resolve();
            setAutoCheckinEnabled(false);
            setAutoCheckinEnabled(true);
            cover(130);
            await Promise.resolve();
            assert.equal(attempts, 1);
        } finally {
            console.warn = originalWarn;
            localStorage.setItem = setItem;
        }
    });

    await context.test('binder adds the opt-in in each new modal and does not duplicate listeners', () => {
        setup();
        setAutoCheckinEnabled(false);
        initAutoCheckin();
        let added = 0;
        let changes = 0;
        let onChange;
        const checkbox = { checked: true, addEventListener(event, listener) { changes++; onChange = listener; } };
        const content = { appendChild(control) {
            added++;
            assert.match(control.innerHTML, /GPS kann abweichen/);
            elements.set('auto-checkin-enabled', checkbox);
        } };
        elements.set('pass-modal', { querySelector: () => content });
        initAutoCheckin();
        initAutoCheckin();
        assert.equal(added, 1);
        assert.equal(changes, 1);
        assert.equal(checkbox.checked, false);
        checkbox.checked = true;
        onChange();
        elements.delete('auto-checkin-enabled');
        initAutoCheckin();
        assert.equal(added, 2);
        assert.equal(checkbox.checked, true);
    });
});
