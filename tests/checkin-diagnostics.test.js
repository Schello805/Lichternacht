import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../js/state.js';
import { recordCheckinDiagnostic, flushCheckinDiagnostics, setCheckinDiagnosticsConsent } from '../js/checkin-diagnostics.js';

test('diagnostics require separate consent, coalesce stages, retry safely and delete after offline or in-flight withdrawal', async () => {
    const keys = ['localStorage', 'navigator', 'fetch', 'setTimeout', 'clearTimeout'];
    const descriptors = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const previousState = { localBackend: state.localBackend, auth: state.auth, downloads: state.downloads };
    const values = new Map([['station_activity_consent_v1', 'granted']]);
    const payloads = [];
    let online = true;
    const install = (key, value) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    try {
        install('localStorage', { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
        install('navigator', { get onLine() { return online; } });
        install('setTimeout', () => 1);
        install('clearTimeout', () => {});
        install('fetch', async (_url, options) => { payloads.push(JSON.parse(options.body)); return { ok: true }; });
        state.localBackend = true;
        state.auth = { currentUser: { getIdToken: async () => 'secret-auth-token' } };
        state.downloads = { icsDate: '21.11.2099 17:00-21:00' };
        assert.equal(recordCheckinDiagnostic('attempt', 1), null);
        assert.equal(values.has('checkin_diagnostics_queue_v1'), false);
        setCheckinDiagnosticsConsent(true);
        const token = recordCheckinDiagnostic('attempt', 1);
        assert.match(token, /^[a-f0-9]{64}$/);
        assert.equal(recordCheckinDiagnostic('synced', 2), null);
        assert.equal(recordCheckinDiagnostic('gps_ready', 2, token), null);
        recordCheckinDiagnostic('gps_missing', 1, token);
        recordCheckinDiagnostic('gps_ready', 1, token);
        online = false;
        await flushCheckinDiagnostics();
        assert.equal(payloads.length, 0);
        online = true;
        await flushCheckinDiagnostics();
        assert.equal(payloads.length, 1);
        assert.deepEqual(Object.keys(payloads[0]).sort(), ['action', 'eventKey', 'stage', 'stages', 'stationId', 'token']);
        assert.deepEqual(payloads[0].stages, ['attempt', 'gps_missing', 'gps_ready']);
        assert.doesNotMatch(JSON.stringify(payloads), /secret-auth-token|lat|lng|ownerUid|accuracy/);
        await flushCheckinDiagnostics();
        assert.equal(payloads.length, 1);

        let resolve;
        install('fetch', (_url, options) => { payloads.push(JSON.parse(options.body)); return new Promise(done => { resolve = done; }); });
        recordCheckinDiagnostic('local_saved', 1, token);
        const inFlight = flushCheckinDiagnostics();
        await Promise.resolve();
        recordCheckinDiagnostic('synced', 1, token);
        resolve({ ok: true });
        await inFlight;
        assert.equal(JSON.parse(values.get('checkin_diagnostics_queue_v1'))[token].pending, true);

        const withdrawalFlight = flushCheckinDiagnostics();
        await Promise.resolve();
        online = false;
        setCheckinDiagnosticsConsent(false);
        resolve({ ok: true });
        await withdrawalFlight;
        assert.equal(recordCheckinDiagnostic('attempt', 1), null);
        await flushCheckinDiagnostics();
        assert.equal(payloads.at(-1).forget, undefined);
        online = true;
        install('fetch', async (_url, options) => { payloads.push(JSON.parse(options.body)); return { ok: true }; });
        await flushCheckinDiagnostics();
        assert.deepEqual(payloads.at(-1), { action: 'checkinDiagnostic', token, forget: true });
        assert.deepEqual(JSON.parse(values.get('checkin_diagnostics_queue_v1')), {});

        setCheckinDiagnosticsConsent(true);
        const retry = recordCheckinDiagnostic('attempt', 1);
        install('fetch', async () => ({ ok: false, json: async () => ({}) }));
        await flushCheckinDiagnostics();
        assert.equal(JSON.parse(values.get('checkin_diagnostics_queue_v1'))[retry].pending, true);
        install('fetch', async () => ({ ok: false, json: async () => ({ permanent: true }) }));
        await flushCheckinDiagnostics();
        assert.equal(JSON.parse(values.get('checkin_diagnostics_queue_v1'))[retry].pending, false);
    } finally {
        Object.assign(state, previousState);
        for (const key of keys) {
            if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key]);
            else delete globalThis[key];
        }
    }
});
