import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('push client requires deliberate permission, confirmed server subscription and retries withdrawal', async () => {
    const source = await readFile(new URL('../js/program-push.js', import.meta.url), 'utf8');
    const values = new Map();
    const requests = [];
    let permissionRequests = 0, subscribeCalls = 0, deletionOffline = false, subscription = null;
    const notification = { permission: 'default', requestPermission: () => { permissionRequests++; notification.permission = 'granted'; return Promise.resolve('granted'); } };
    const device = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', toJSON() { return { endpoint: this.endpoint, keys: {} }; }, unsubscribe: async () => { subscription = null; return true; } };
    const registration = { active: true, pushManager: { getSubscription: async () => subscription, subscribe: async () => { subscribeCalls++; subscription = device; return device; } } };
    const context = vm.createContext({
        console, URL, AbortSignal, Uint8Array, atob, setTimeout: () => 1,
        navigator: { userAgent: 'Android', serviceWorker: { getRegistration: async () => registration } },
        window: { isSecureContext: true, PushManager: {}, Notification: notification, dispatchEvent() {}, matchMedia: () => ({ matches: false }) },
        Notification: notification, CustomEvent: class {},
        localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
        fetch: async (url, options) => {
            const action = url.split('/').at(-1);
            requests.push({ action, body: options.body ? JSON.parse(options.body) : null });
            if (action === 'unsubscribe' && deletionOffline) throw new Error('offline');
            return { ok: true, json: async () => action === 'config' ? { available: true, publicKey: 'BA' } : { active: action === 'subscribe' || Boolean(subscription) } };
        }
    });
    vm.runInContext(source.replaceAll('export ', ''), context);
    await context.initProgramPush();
    assert.equal(permissionRequests, 0);
    assert.equal(subscribeCalls, 0);
    const enabling = context.enableProgramPush();
    assert.equal(permissionRequests, 1);
    await enabling;
    assert.equal(context.isProgramPushActive(), true);
    assert.equal(subscribeCalls, 1);
    assert.equal(requests.find(request => request.action === 'subscribe').body.scope, 'all-program-events');
    deletionOffline = true;
    await context.disableProgramPush();
    assert.equal(context.isProgramPushActive(), false);
    assert.match(values.get('program_push_pending_delete_v1'), /fcm/);
    deletionOffline = false;
    await context.initProgramPush();
    assert.equal(values.get('program_push_pending_delete_v1'), '[]');
    assert.equal(context.isProgramPushActive(), false);
    context.navigator.userAgent = 'iPhone';
    const unsupported = await context.initProgramPush();
    assert.equal(unsupported.code, 'install-required');
});

test('service worker handles valid unexpired reminders and safe notification clicks without an open page', async () => {
    const source = await readFile(new URL('../js/program-push-worker.js', import.meta.url), 'utf8');
    const listeners = {}, shown = [], opened = [];
    const context = vm.createContext({ URL, Date, self: {
        addEventListener: (event, callback) => { listeners[event] = callback; },
        registration: { showNotification: async (...args) => shown.push(args) }, location: { origin: 'https://example.test' },
        clients: { matchAll: async () => [], openWindow: async url => opened.push(url) }
    } });
    vm.runInContext(source, context);
    const deliver = async payload => { let done; listeners.push({ data: { json: () => payload }, waitUntil: promise => { done = promise; } }); await done; };
    await deliver({ type: 'program-reminder', title: 'Show', body: 'In 15 Minuten', tag: 'program-test', expiresAt: Date.now() + 900000, url: 'https://evil.test' });
    await deliver({ type: 'program-reminder', title: 'Alt', body: '', expiresAt: Date.now() - 1 });
    await deliver({ type: 'other', title: 'Bad', body: '', expiresAt: Date.now() + 10000 });
    assert.equal(shown.length, 1);
    assert.equal(shown[0][1].renotify, false);
    let done;
    listeners.notificationclick({ notification: { tag: 'program-test', close() {} }, waitUntil: promise => { done = promise; } });
    await done;
    assert.deepEqual(opened, ['https://example.test/#events']);
});
