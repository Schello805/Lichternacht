import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('event calendar downloads one event and hides automatically at the one-hour cutoff', async ({ page }) => {
    await page.clock.install({ time: new Date('2099-11-21T14:29:00Z') });
    await page.clock.pauseAt(new Date('2099-11-21T14:29:59Z'));
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.downloads.icsDate = '21.11.2099 16:30-21:00';
        window.state.events = [];
        window.updateCalendarButtons();
        window.switchTab('events');
    });
    const buttons = page.locator('[data-event-calendar]');
    expect(await buttons.count()).toBe(2);
    await expect(buttons.first()).not.toHaveClass(/hidden/);
    const downloadReady = page.waitForEvent('download');
    await page.locator('#view-events [data-event-calendar]').click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toBe('lichternacht.ics');
    const content = await readFile(await download.path(), 'utf8');
    expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(content).toContain('DTSTART:20991121T153000Z');
    expect(content).toContain('DTEND:20991121T200000Z');
    await page.clock.runFor(1000);
    for (const button of await buttons.all()) await expect(button).toHaveClass(/hidden/);
    await page.evaluate(() => { window.state.downloads.icsDate = ''; window.updateCalendarButtons(); });
    await expect(page.locator('#view-events [data-event-calendar]')).toBeHidden();
});

test('local authentication works without loading Firebase and preserves admin session when creating users', async ({ page }) => {
    let current = null;
    const visitor = { uid: 'anon_local-test', email: null, isAnonymous: true, isAdmin: false };
    const admin = { uid: 'existing-admin', email: 'admin@example.test', isAnonymous: false, isAdmin: true };
    const externalAuth = [];
    page.on('request', request => {
        if (/firebasejs|firestore\.googleapis|identitytoolkit\.googleapis/.test(request.url())) externalAuth.push(request.url());
    });
    await page.route('**/api/local-auth/**', route => {
        const action = new URL(route.request().url()).pathname.split('/').pop();
        if (action === 'login') {
            const data = route.request().postDataJSON();
            if (data.password !== 'Test-password-1234') return route.fulfill({ status: 401, json: { error: 'E-Mail oder Passwort ist nicht korrekt' } });
            current = admin;
        }
        if (action === 'anonymous') current ||= visitor;
        if (action === 'logout') current = null;
        if (action === 'create-admin') return route.fulfill({ json: { ok: true, user: { ...admin, uid: 'second-admin' } } });
        return route.fulfill({ json: { ok: true, enabled: true, user: current } });
    });
    await page.route('**/api/local-admin', route => route.fulfill({ json: { ok: true, isAdmin: Boolean(current?.isAdmin) } }));
    await page.route('**/api/local-data**', route => {
        const url = new URL(route.request().url());
        if (route.request().method() === 'POST') return route.fulfill({ json: { ok: true } });
        if (url.searchParams.get('count')) return route.fulfill({ json: { ok: true, count: 1 } });
        if (url.searchParams.has('collection')) return route.fulfill({ json: { ok: true, records: [] } });
        return route.fulfill({ json: { ok: true, appId: 'e2e-test', stations: [{ id: 1, name: 'Lokal', lat: 49.158, lng: 10.552 }], events: [], config: {} } });
    });
    await page.goto('/index.html');
    await expect.poll(() => page.evaluate(() => window.state.auth.currentUser?.uid)).toBe(visitor.uid);
    const invalid = await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        try { await state.fb.signInWithEmailAndPassword(state.auth, 'admin@example.test', 'wrong'); } catch (error) { return error.code; }
    });
    expect(invalid).toBe('auth/invalid-credential');
    await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        await state.fb.signInWithEmailAndPassword(state.auth, 'admin@example.test', 'Test-password-1234');
        await state.fb.createUserWithEmailAndPassword(state.auth, 'second@example.test', 'Test-password-1234');
    });
    await expect.poll(() => page.evaluate(() => window.state.isAdmin)).toBe(true);
    expect(await page.evaluate(() => window.state.auth.currentUser.uid)).toBe(admin.uid);
    await page.evaluate(() => window.state.fb.signOut(window.state.auth));
    await expect.poll(() => page.evaluate(() => window.state.auth.currentUser?.uid)).toBe(visitor.uid);
    expect(externalAuth).toEqual([]);
});

test('admin user names remain literal text and cannot inject HTML or handlers', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        const email = '<img/src=x/onerror=alert(1)>@example.test';
        state.fb = { collection: () => ({}), getDocs: async () => ({ forEach: callback => callback({ id: "quoted'uid", data: () => ({ email }) }) }) };
        const { loadUsers } = await import('/js/admin.js');
        await loadUsers();
    });
    await expect(page.locator('#user-list img')).toHaveCount(0);
    await expect(page.locator('#user-list')).toContainText('<img/src=x/onerror=alert(1)>@example.test');
    await expect(page.locator('#user-list [data-admin-delete-id]')).toHaveAttribute('data-admin-delete-id', "quoted'uid");
    await expect(page.locator('#user-list [data-admin-delete-id]')).not.toHaveAttribute('onclick');
});

test('local database routes telemetry and broadcasts without Firestore requests', async ({ page }) => {
    const firestoreRequests = [];
    const writes = [];
    page.on('request', request => {
        if (request.url().includes('firestore.googleapis.com')) firestoreRequests.push(request.url());
    });
    await page.route('**/api/local-data**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'POST') {
            writes.push(request.postDataJSON());
            return route.fulfill({ json: { ok: true } });
        }
        const collection = url.searchParams.get('collection');
        if (collection === 'presence' && url.searchParams.get('count') === 'true') return route.fulfill({ json: { ok: true, count: 1 } });
        if (!collection) return route.fulfill({ json: { ok: true, appId: 'e2e-test', stations: [{ id: 1, name: 'Lokal' }], events: [], config: {} } });
        const data = collection === 'stats' ? { count_gold: 2 } : collection === 'presence' ? { lastSeen: new Date().toISOString() } : { text: 'Lokal gespeichert' };
        return route.fulfill({ json: { ok: true, records: [{ id: collection, data }] } });
    });
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        const reference = (base, ...parts) => {
            const path = [base.path, ...parts].filter(Boolean).join('/');
            return { path, id: path.split('/').pop() };
        };
        state.fb = { doc: reference, collection: reference };
        state.db = {};
        state.auth = { currentUser: { uid: 'visitor', getIdToken: async () => 'test' } };
        state.appId = 'e2e-test';
        state.useLocalStorage = false;
        const { initializeLocalBackend } = await import('/js/local-backend.js');
        await initializeLocalBackend();
        const { doc, collection, query, where } = state.fb;
        const base = ['artifacts', 'e2e-test', 'public', 'data'];
        const stats = await state.fb.getDoc(doc(state.db, 'global', 'stats'));
        const count = await state.fb.getCountFromServer(query(collection(state.db, ...base, 'presence'), where('lastSeen', '>', new Date(Date.now() - 120000))));
        await state.fb.addDoc(collection(state.db, ...base, 'auditLogs'), { eventType: 'station_opened' });
        await state.fb.setDoc(doc(state.db, ...base, 'checkins', 'visitor_1'), { stationId: '1' });
        const broadcast = await new Promise(resolve => {
            const unsubscribe = state.fb.onSnapshot(doc(state.db, 'artifacts', 'e2e-test', 'public', 'broadcast'), snapshot => {
                unsubscribe();
                resolve(snapshot.data());
            });
        });
        return { count: count.data().count, gold: stats.data().count_gold, text: broadcast.text };
    });
    expect(result).toEqual({ count: 1, gold: 2, text: 'Lokal gespeichert' });
    expect(writes.map(write => write.collection)).toEqual(['auditLogs', 'checkins']);
    expect(firestoreRequests).toEqual([]);
});

test('station modal zooms from its marker and respects reduced motion', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.__stationAnimations = [];
        const animate = Element.prototype.animate;
        Element.prototype.animate = function(frames, options) {
            if (this.id === 'modal-content') window.__stationAnimations.push(frames);
            return animate.call(this, frames, options);
        };
        window.openStation(1);
    });
    await expect.poll(() => page.evaluate(() => window.__stationAnimations.length)).toBe(1);
    expect(await page.evaluate(() => window.__stationAnimations[0][0].transform)).toMatch(/translate.*scale/);
    await page.getByRole('button', { name: 'Station schließen' }).click();
    await expect(page.locator('#detail-modal')).toBeHidden();
    await expect(page.locator('.recently-opened-station')).toHaveCount(1);
    await expect(page.locator('.recently-opened-station')).toHaveCount(0, { timeout: 6500 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.openStation(1));
    await expect(page.locator('#detail-modal')).toBeVisible();
    expect(await page.evaluate(() => window.__stationAnimations.length)).toBe(2);
});

test('stations and events stay individually displayed when zooming out', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        const { refreshMapMarkers } = await import('/js/maplibre-map.js');
        state.isAdmin = false;
        state.stations = [
            { id: 1, name: 'Mit Programm', lat: 49.158, lng: 10.552, tags: [] },
            { id: 2, name: 'Nachbar', lat: 49.15801, lng: 10.55201, tags: [] }
        ];
        state.events = [
            { id: 'concert', title: 'Konzert', stationId: 1 },
            { id: 'solo', title: 'Solo', lat: 49.1581, lng: 10.5521 }
        ];
        state.map.jumpTo({ center: [10.552, 49.158], zoom: 14 });
        refreshMapMarkers();
    });
    for (const zoom of [14, 12, 16]) {
        await page.evaluate(async zoom => (await import('/js/state.js')).state.map.jumpTo({ zoom }), zoom);
        await expect(page.locator('.station-cluster')).toHaveCount(0);
        await expect(page.locator('.custom-pin')).toHaveCount(2);
        await expect(page.locator('.program-pin')).toHaveCount(1);
        for (const marker of await page.locator('.custom-pin, .program-pin').all()) await expect(marker).toBeVisible();
    }
});

test('failed foot routing preserves the plan without drawing air lines or requesting GPS', async ({ page }) => {
    await page.route('https://routing.openstreetmap.de/**', route => route.abort());
    await page.goto('/index.html');
    await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        state.downloads.icsDate = '21.11.2099 17:00-21:00';
        state.userLocation = { lat: 49.157, lng: 10.548 };
        state.gpsAccuracy = 5;
        state.gpsLastFixAt = Date.now();
        navigator.geolocation.getCurrentPosition = () => { throw new Error('Unexpected GPS request'); };
        navigator.geolocation.watchPosition = () => { throw new Error('Unexpected GPS watch'); };
        window.openRoutePlan();
    });
    await expect(page.locator('#route-plan-modal')).toContainText('Wähle deine Stationen schon jetzt');
    await page.locator('[data-route-plan-submit]').click();
    await expect(page.locator('#route-info')).toContainText('Fußweg konnte nicht berechnet werden');
    expect(await page.evaluate(() => window.state.overviewRouteGeometry)).toBeNull();
    await page.evaluate(() => window.openRoutePlan());
    expect(await page.locator('[data-route-plan-station]:checked').count()).toBeGreaterThan(1);
});

test.beforeEach(async ({ page }) => {
    page.on('pageerror', error => console.error('Browser runtime error:', error.message));
    const startupMessages = [];
    page.on('console', message => { startupMessages.push(message.text()); if (startupMessages.length > 30) startupMessages.shift(); });
    page.on('requestfailed', request => console.error('Browser request failed:', request.url(), request.failure()?.errorText));
    await page.route('**/config.js*', route => route.fulfill({
        contentType: 'application/javascript',
        body: `var __firebase_config = '{"apiKey":""}'; var __app_id = 'e2e-test';`
    }));
    const originalGoto = page.goto.bind(page);
    page.goto = async (...args) => {
        const response = await originalGoto(...args);
        if (!String(args[0]).includes('help.html') && args[1]?.waitUntil !== 'commit') {
            try {
                await page.waitForFunction(() => window.__appReady === true, null, { timeout: 20000 });
            } catch (error) {
                console.error('Startup diagnostics:', await page.evaluate(() => ({ phase: window.__appStartupPhase, ready: document.readyState, stations: window.state?.stations?.length })), startupMessages);
                throw error;
            }
        }
        return response;
    };
    await page.addInitScript(() => {
        localStorage.setItem('tracking_consent', 'denied');
        localStorage.setItem('tutorial_seen', 'true');
        localStorage.setItem('mini_tour_seen_v1', 'true');
        localStorage.setItem('visitor_start_card_dismissed_v1', 'true');
        localStorage.setItem('visitor_start_card_dismissed_v2', 'true');
    });
});

test('unsaved station edits survive cancelled navigation and can be discarded explicitly', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => { window.state.isAdmin = true; window.openStation(1); window.editStation(1); });
    await page.locator('#modal-title').fill('Noch nicht gespeichert');
    page.once('dialog', dialog => dialog.dismiss());
    await page.evaluate(() => window.switchTab('events'));
    await expect(page.locator('#modal-title')).toHaveText('Noch nicht gespeichert');
    await expect(page.locator('#modal-content')).toHaveClass(/is-inline-station-editing/);
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => window.switchTab('events'));
    await expect(page.locator('#detail-modal')).toBeHidden();
    await page.evaluate(() => window.openStation(1));
    await expect(page.locator('#modal-title')).not.toHaveText('Noch nicht gespeichert');
});

test('failed station renumbering keeps original data and the editable draft', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.isAdmin = true;
        window.openStation(1); window.editStation(1);
        window.state.useLocalStorage = false;
        window.__renameCalls = 0;
        window.state.fb.renameStation = async () => { window.__renameCalls++; throw new Error('Simulierter Verbindungsfehler'); };
        window.state.fb.deleteDoc = async () => { throw new Error('Einzelnes Löschen darf nie aufgerufen werden'); };
    });
    await page.locator('#modal-number').fill('999');
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => window.saveStationChanges());
    expect(await page.evaluate(() => window.__renameCalls)).toBe(1);
    expect(await page.evaluate(() => window.state.stations.some(station => station.id === 1))).toBe(true);
    expect(await page.evaluate(() => window.state.stations.some(station => station.id === 999))).toBe(false);
    await expect(page.locator('#modal-number')).toHaveText('999');
    await expect(page.locator('#modal-content')).toHaveClass(/is-inline-station-editing/);
});

test('local backup explains server restore before offering a file picker', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(async () => {
        window.state.isAdmin = true;
        window.state.localBackend = true;
        const admin = await import('/js/admin.js?v=1.4.299');
        admin.updateAdminUiAvailability();
    });
    await expect(page.locator('#admin-legacy-restore')).toHaveClass(/hidden/);
    await expect(page.locator('#admin-server-restore-info')).not.toHaveClass(/hidden/);
    await expect(page.locator('#admin-server-restore-info')).toContainText('neue Datenbank');
});

test('map initialization failure does not block stations and program', async ({ page }) => {
    await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            return String(type).includes('webgl') ? null : getContext.call(this, type, ...args);
        };
    });
    await page.goto('/index.html');
    await expect(page.locator('#map')).toContainText('Stationen und Programm sind weiterhin verfügbar');
    await page.getByRole('button', { name: 'Stationsliste öffnen', exact: true }).click();
    await expect(page.locator('#view-list')).toBeVisible();
    await page.evaluate(() => window.switchTab('events'));
    await expect(page.locator('#view-events')).toBeVisible();
});

test('invalid saved favorites do not interrupt app startup', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('favorites', '{invalid'));
    await page.goto('/index.html');
    expect(await page.evaluate(() => window.state.favorites.size)).toBe(0);
    await page.evaluate(() => window.switchTab('list'));
    await expect(page.locator('#view-list')).toBeVisible();
});

test('failed app module download offers an explicit reload action', async ({ page }) => {
    await page.route('**/js/local-records.js*', route => route.abort('connectionreset'));
    await page.goto('/index.html', { waitUntil: 'commit' });
    await expect(page.locator('#app-load-error')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Erneut laden', exact: true })).toBeVisible();
});

test('undo check-in sends a server reversal without checking in again', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(async () => {
        const { markStationVisited } = await import('/js/utils.js?v=1.4.299');
        markStationVisited(1);
        window.state.localBackend = true;
        window.state.useLocalStorage = false;
        window.state.db = {};
        window.state.auth = { currentUser: { uid: 'audit-visitor' } };
        window.__undoCalls = [];
        window.__checkinCalls = 0;
        window.checkIn = () => { window.__checkinCalls++; };
        window.state.fb = {
            collection: () => ({}), addDoc: async () => {},
            undoCheckin: async id => { window.__undoCalls.push(String(id)); }
        };
        window.openStation(1);
    });
    await page.getByRole('button', { name: 'Check-in rückgängig', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__undoCalls)).toEqual(['1']);
    expect(await page.evaluate(() => window.__checkinCalls)).toBe(0);
    await expect(page.locator('#checkin-btn')).toContainText('Einchecken');
});

test('station image removal stays in the draft until saved', async ({ page }) => {
    await page.goto('/index.html');
    const original = await page.evaluate(() => {
        window.state.isAdmin = true;
        window.openStation(1); window.editStation(1);
        const image = window.state.stations.find(station => station.id === 1).image;
        window.clearStationImage();
        return image;
    });
    expect(await page.evaluate(() => window.state.stations.find(station => station.id === 1).image)).toBe(original);
    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => window.cancelStationEdit());
    await expect(page.locator('#modal-image-container img')).toHaveAttribute('src', original);
});

test('saved dark mode is applied before the first render', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('darkMode', 'true');
        document.addEventListener('DOMContentLoaded', () => {
            window.__darkModeAtDomReady = document.documentElement.classList.contains('dark');
        });
    });

    await page.goto('/index.html');

    await expect.poll(() => page.evaluate(() => window.__darkModeAtDomReady)).toBe(true);
    await expect(page.locator('html')).toHaveClass(/dark/);
});

test('system display preference follows the device setting', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
        localStorage.removeItem('darkMode');
        localStorage.setItem('themePreference', 'system');
        document.addEventListener('DOMContentLoaded', () => {
            window.__systemThemeAtDomReady = document.documentElement.classList.contains('dark');
        });
    });

    await page.goto('/index.html');

    await expect.poll(() => page.evaluate(() => window.__systemThemeAtDomReady)).toBe(true);
    await expect(page.locator('#theme-preference-btn')).toHaveAttribute('title', 'Darstellung: System');
});

test('visitor can choose system display mode', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#theme-preference-btn').click();
    await page.getByRole('menuitem', { name: 'System' }).click();

    await expect.poll(() => page.evaluate(() => localStorage.getItem('themePreference'))).toBe('system');
    await expect(page.locator('#theme-preference-menu')).toBeHidden();
});

test('visitor startup defers the admin module', async ({ page }) => {
    const adminRequests = [];
    page.on('request', request => {
        if (request.url().includes('/js/admin.js')) adminRequests.push(request.url());
    });

    await page.goto('/index.html');
    await page.waitForTimeout(300);

    expect(adminRequests).toHaveLength(0);
});

test('visitor can open a station detail modal from the station list', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#nav-list').click();
    await page.locator('#stations-list > button').first().waitFor({ state: 'visible' });
    await page.locator('#stations-list > button').first().click();

    await expect(page.locator('#detail-modal')).toBeVisible();
    await expect(page.locator('#modal-title')).not.toBeEmpty();
    await expect(page.locator('#bottom-nav')).toBeVisible();

    if (page.viewportSize().width < 640) {
        const layout = await page.evaluate(() => {
            const modal = document.getElementById('detail-modal').getBoundingClientRect();
            const navigation = document.getElementById('bottom-nav').getBoundingClientRect();
            return { modalBottom: modal.bottom, navigationTop: navigation.top };
        });
        expect(layout.modalBottom).toBeLessThanOrEqual(layout.navigationTop + 1);
    }

    await page.getByRole('button', { name: 'Station schließen' }).click();
    await expect(page.locator('#detail-modal')).toBeHidden();
    await page.getByRole('button', { name: 'Programm' }).click();
    await expect(page.locator('#view-events')).toBeVisible();
});

test('station edit modal stays above navigation and can scroll on a short landscape viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 520 });
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.evaluate(() => {
        window.closeAdminPage();
        window.switchTab('list');
    });
    await page.locator('#stations-list > button').first().click();
    await page.getByRole('button', { name: 'Bearbeiten' }).click();

    const layout = await page.evaluate(() => {
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('modal-content');
        const navigation = document.getElementById('bottom-nav');
        content.style.paddingBottom = '1000px';
        content.scrollTop = content.scrollHeight;
        return {
            modalZIndex: Number(getComputedStyle(modal).zIndex),
            navigationZIndex: Number(getComputedStyle(navigation).zIndex),
            scrollTop: content.scrollTop,
            scrollHeight: content.scrollHeight,
            clientHeight: content.clientHeight
        };
    });

    expect(layout.modalZIndex).toBeGreaterThan(layout.navigationZIndex);
    expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
    expect(layout.scrollTop).toBeGreaterThan(0);
});

test('feedback is easy to find without a disruptive floating button', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Feedback geben' }).click();

    await expect(page.locator('#bug-report-modal')).toBeVisible();
    await expect(page.locator('#bug-report-modal')).toContainText('Was gefällt dir');
});

test('presence waits for authentication and resumes without duplicate in-flight writes', async ({ page }) => {
    await page.goto('/index.html');
    const result = await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        const { initPresence } = await import('/js/gamification.js');
        let listener;
        let completeHeartbeat;
        let writes = 0;
        const intervals = [];
        state.useLocalStorage = false;
        state.localBackend = true;
        state.auth = { currentUser: null };
        state.fb = {
            doc: () => ({}), collection: () => ({}), query: () => ({}), where: () => ({}),
            serverTimestamp: () => ({}),
            setDoc: () => { writes++; return new Promise(resolve => { completeHeartbeat = resolve; }); },
            getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
            getDoc: async () => ({ exists: () => false }),
            onAuthStateChanged: (_auth, callback) => { listener = callback; return () => {}; }
        };
        const originalInterval = window.setInterval;
        window.setInterval = callback => { intervals.push(callback); return 0; };
        try { initPresence(); } finally { window.setInterval = originalInterval; }
        const beforeAuthentication = writes;
        state.auth.currentUser = { uid: 'visitor' };
        listener(state.auth.currentUser);
        listener(state.auth.currentUser);
        const whilePending = writes;
        completeHeartbeat();
        await Promise.resolve();
        state.auth.currentUser = null;
        listener(null);
        await intervals[0]();
        return { beforeAuthentication, whilePending, afterSignOut: writes };
    });
    expect(result).toEqual({ beforeAuthentication: 0, whilePending: 1, afterSignOut: 1 });
});

test('feedback prevents duplicate sends and preserves text when rate limited', async ({ page }) => {
    let pendingRoute;
    let requests = 0;
    await page.route('**/api/bug-report', route => {
        expect(route.request().headers().authorization).toBe('Bearer test-feedback-token');
        pendingRoute = route;
        requests++;
    });
    await page.goto('/index.html');
    await page.evaluate(async () => {
        const { state } = await import('/js/state.js');
        state.auth = { currentUser: { uid: 'feedback-test', getIdToken: async () => 'test-feedback-token' } };
    });
    await page.getByRole('button', { name: 'Feedback geben' }).click();
    await page.locator('#bug-desc').fill('Meine Rückmeldung bleibt erhalten.');
    await page.locator('#bug-report-submit').click();
    await expect.poll(() => requests).toBe(1);
    await expect(page.locator('#bug-report-submit')).toBeDisabled();
    await expect(page.locator('#bug-report-submit')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('[data-feedback-spinner]')).toBeVisible();
    await page.evaluate(() => window.submitBugReport());
    expect(requests).toBe(1);
    await pendingRoute.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate_limited"}' });
    await expect(page.getByText(/Zu viele Sendeversuche/)).toBeVisible();
    await expect(page.locator('#bug-desc')).toHaveValue('Meine Rückmeldung bleibt erhalten.');
    await expect(page.locator('#bug-report-submit')).toBeEnabled();
    await expect(page.locator('#bug-report-submit')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[data-feedback-spinner]')).toHaveCount(0);
});

test('feedback spinner stays until the server confirms successful delivery', async ({ page }) => {
    let pendingRoute;
    await page.route('**/api/bug-report', route => { pendingRoute = route; });
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Feedback geben' }).click();
    await page.locator('#bug-desc').fill('Testnachricht');
    await page.locator('#bug-report-submit').click();
    await expect(page.locator('[data-feedback-spinner]')).toBeVisible();
    await expect(page.locator('#bug-report-submit')).toBeDisabled();
    await expect(page.locator('#bug-report-submit')).toContainText('Wird gesendet');
    await expect(page.locator('#bug-report-modal')).toBeVisible();
    await expect(page.locator('#bug-desc')).toHaveValue('Testnachricht');
    await expect.poll(() => Boolean(pendingRoute)).toBe(true);
    await pendingRoute.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    await expect(page.locator('#bug-report-modal')).toBeHidden();
    await expect(page.locator('[data-feedback-spinner]')).toHaveCount(0);
    await expect(page.locator('#bug-report-submit')).toBeEnabled();
    await expect(page.locator('#bug-desc')).toHaveValue('');
});

for (const mode of ['disabled', 'included', 'denied']) {
    test(`feedback location is optional and one-shot: ${mode}`, async ({ page }) => {
        let payload;
        await page.addInitScript(mode => {
            window.__feedbackLocationRequests = 0;
            navigator.geolocation.getCurrentPosition = (success, failure) => {
                window.__feedbackLocationRequests++;
                if (mode === 'denied') failure({ code: 1 });
                else success({ coords: { latitude: 49.158, longitude: 10.552, accuracy: 15 }, timestamp: Date.now() });
            };
        }, mode);
        await page.route('**/api/bug-report', route => {
            payload = route.request().postDataJSON();
            return route.fulfill({ status: 200, json: { ok: true } });
        });
        await page.goto('/index.html#private-fragment');
        await page.getByRole('button', { name: 'Feedback geben' }).click();
        await expect(page.locator('#bug-report-location')).not.toBeChecked();
        if (mode !== 'disabled') await page.locator('#bug-report-location').check();
        else {
            await page.locator('#bug-report-location').check();
            await page.locator('#bug-report-modal').getByRole('button', { name: 'Abbrechen' }).click();
            await page.getByRole('button', { name: 'Feedback geben' }).click();
            await expect(page.locator('#bug-report-location')).not.toBeChecked();
        }
        await page.locator('#bug-desc').fill('Standorttest');
        await page.locator('#bug-report-submit').click();
        await expect(page.locator('#bug-report-modal')).toBeHidden();
        expect(await page.evaluate(() => window.__feedbackLocationRequests)).toBe(mode === 'disabled' ? 0 : 1);
        expect(payload.text).not.toContain('private-fragment');
        if (mode === 'included') expect(payload.location).toMatchObject({ lat: 49.158, lng: 10.552, accuracy: 15 });
        else expect(payload).not.toHaveProperty('location');
        if (mode === 'denied') await expect(page.getByText('Danke! Feedback ohne Standort gesendet.')).toBeVisible();
        await expect(page.locator('#bug-report-location')).not.toBeChecked();
        expect(await page.evaluate(() => window.state.userLocation)).toBeNull();
    });
}

test('station modal prioritizes its image immediately', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.openModal({ id: 1, name: 'Bildtest', tags: [], image: '/downloads/stations/test.webp' }));
    const image = page.locator('#modal-image-container img');
    await expect(image).toHaveAttribute('loading', 'eager');
    await expect(image).toHaveAttribute('fetchpriority', 'high');
    await expect(image).toHaveAttribute('decoding', 'async');
});

test('stations offering a WC show a restroom icon on the map', async ({ page }) => {
    await page.goto('/index.html');
    const restroomBadges = page.locator('.station-wc-badge');
    await expect.poll(() => restroomBadges.evaluateAll(elements => elements.filter(element => {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }).length)).toBeGreaterThan(0);
    await expect(restroomBadges.first()).toHaveAttribute('title', 'WC vorhanden');
    await expect(restroomBadges.first()).toContainText('WC');

    await page.locator('#nav-list').click();
    await page.locator('#stations-list > button').filter({ hasText: 'Metzgerei Weinmann' }).click();
    await expect(page.locator('#modal-wc-badge')).toBeVisible();
    await expect(page.locator('#modal-wc-badge')).toHaveText('WC');

    await page.evaluate(() => {
        const stationWithoutRestroom = window.state.stations.find(station =>
            !(station.tags || []).some(tag => String(tag).trim().toLowerCase() === 'wc')
        );
        window.openStation(stationWithoutRestroom.id);
    });
    await expect(page.locator('#modal-wc-badge')).toBeHidden();
});

test('admin can add a standalone restroom on the map', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.locator('#admin-experience-section > summary').click();
    await page.locator('#admin-standalone-restrooms').locator('xpath=preceding-sibling::div[1]').getByRole('button', { name: /Auf Karte setzen/ }).click();
    await expect(page.locator('#view-map')).toBeVisible();
    await expect(page.locator('#toast-container')).toContainText('Tippe auf die Karte');
    await page.locator('#map').click({ position: { x: 180, y: 240 } });

    await expect.poll(() => page.evaluate(() => window.state.config.standaloneRestrooms?.length || 0)).toBe(1);
    await expect(page.locator('.standalone-restroom-marker')).toBeVisible();
});

test('admin can add a standalone parking marker on the map', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.locator('#admin-experience-section > summary').click();
    await page.locator('#admin-standalone-parking').locator('xpath=preceding-sibling::div[1]').getByRole('button', { name: /Auf Karte setzen/ }).click();
    await expect(page.locator('#toast-container')).toContainText('Parkplatz');
    await page.locator('#map').click({ position: { x: 180, y: 240 } });

    await expect.poll(() => page.evaluate(() => window.state.config.standaloneParking?.length || 0)).toBe(1);
    await expect(page.locator('.standalone-parking-marker')).toBeVisible();
});

for (const kind of ['parking', 'wc', 'station-wc']) {
    test(`${kind} marker offers the correct external navigation without requesting GPS`, async ({ page }) => {
        await page.addInitScript(() => {
            window.__amenityGpsRequests = 0;
            navigator.geolocation.getCurrentPosition = () => { window.__amenityGpsRequests++; };
            navigator.geolocation.watchPosition = () => { window.__amenityGpsRequests++; };
        });
        await page.goto('/index.html');
        await page.evaluate(kind => {
            window.state.stations = kind === 'station-wc' ? [{ id: 1, name: 'WC bei Teststation', lat: 49.158, lng: 10.552, tags: ['wc'] }] : [];
            window.state.events = [];
            window.state.config.standaloneParking = kind === 'parking' ? [{ id: 'test-p', lat: 49.158, lng: 10.552 }] : [];
            window.state.config.standaloneRestrooms = kind === 'wc' ? [{ id: 'test-wc', lat: 49.158, lng: 10.552 }] : [];
            window.state.map.jumpTo({ center: [10.552, 49.158], zoom: 17 });
            window.refreshMapMarkers();
        }, kind);
        const selector = kind === 'parking' ? '.standalone-parking-marker' : kind === 'wc' ? '.standalone-restroom-marker' : '.station-wc-badge';
        await page.locator(selector).click();
        const popup = page.locator('.amenity-navigation-popup');
        await expect(popup).toBeVisible();
        const link = popup.getByRole('link', { name: kind === 'parking' ? 'Zum Parkplatz navigieren' : 'Zum WC navigieren' });
        const url = new URL(await link.getAttribute('href'));
        expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
        expect(url.searchParams.get('destination')).toBe('49.158,10.552');
        expect(url.searchParams.get('travelmode')).toBe(kind === 'parking' ? 'driving' : 'walking');
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(await page.evaluate(() => window.__amenityGpsRequests)).toBe(0);
        await expect(page.locator('#detail-modal')).toBeHidden();
        await page.evaluate(() => window.refreshMapMarkers());
        await expect(popup).toBeVisible();
        await popup.getByRole('button', { name: 'Hinweis schließen' }).click();
        await expect(popup).toHaveCount(0);
    });
}

test('amenity navigation is keyboard accessible and does not interfere with admin movement', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.stations = [];
        window.state.events = [];
        window.state.config.standaloneParking = [{ id: 'test-p', lat: 49.158, lng: 10.552 }];
        window.refreshMapMarkers();
    });
    await page.locator('.standalone-parking-marker').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.amenity-navigation-popup')).toBeVisible();
    await page.evaluate(() => { window.state.isAdmin = true; window.toggleMapEditMode(); });
    await expect(page.locator('.amenity-navigation-popup')).toHaveCount(0);
    await page.locator('.standalone-parking-marker').click();
    await expect(page.locator('.amenity-navigation-popup')).toHaveCount(0);
    expect(await page.evaluate(() => window.state.parkingMarkers[0].isDraggable())).toBe(true);
});

test('admin must explicitly enable marker movement', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.evaluate(() => {
        window.state.config.standaloneRestrooms = [{ id: 'wc-drag', lat: 49.159, lng: 10.552 }];
        window.state.config.standaloneParking = [{ id: 'parking-drag', lat: 49.1591, lng: 10.5521 }];
        window.refreshMapMarkers();
    });

    await expect.poll(() => page.evaluate(() => ({
        restroom: window.state.restroomMarkers[0]?.isDraggable(),
        parking: window.state.parkingMarkers[0]?.isDraggable()
    }))).toEqual({ restroom: false, parking: false });

    await page.locator('#map-edit-mode-btn').click();
    await expect(page.locator('#map-edit-mode-btn')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => ({
        restroom: window.state.restroomMarkers[0]?.isDraggable(),
        parking: window.state.parkingMarkers[0]?.isDraggable()
    }))).toEqual({ restroom: true, parking: true });
});

test('admin can edit stations and program entries from their visitor lists', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.evaluate(() => {
        window.closeAdminPage();
        window.switchTab('list');
    });
    await page.locator('#stations-list > button').first().click();
    await expect(page.getByRole('button', { name: 'Bearbeiten' })).toBeVisible();
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await expect(page.locator('#modal-view-mode')).toBeVisible();
    await expect(page.locator('#modal-edit-mode')).toBeHidden();
    await expect(page.locator('#modal-title')).toHaveAttribute('contenteditable', 'true');
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeVisible();
    await expect(page.locator('#inline-edit-tags input')).toHaveCount(0);
    await expect(page.locator('#inline-available-tags button')).not.toHaveCount(0);
    await expect(page.locator('#modal-image-change-btn, #modal-image-container [aria-label="Bild auswählen"]')).toBeVisible();

    expect(await page.evaluate(async () => {
        const { hasUnsavedStationChanges } = await import('/js/ui.js?v=1.4.299');
        if (!hasUnsavedStationChanges()) return null;
        const station = window.state.stations.find(item => item.id == window.state.activeStationId);
        return { station, fields: ['modal-number', 'modal-title', 'modal-subtitle', 'modal-desc', 'inline-edit-lat', 'inline-edit-lng', 'inline-edit-link', 'edit-tags'].map(id => {
            const element = document.getElementById(id);
            return [id, element.value ?? element.innerText];
        }) };
    })).toBeNull();

    await page.evaluate(() => {
        window.closeModal();
        window.switchTab('events');
    });
    await page.locator('#timeline-container [onclick^="openProgramEvent"]').first().click();
    await expect(page.locator('#program-edit')).toBeVisible();
    await page.locator('#program-edit').click();
    await expect(page.locator('#event-modal')).toBeVisible();
});

test('admin can turn a linked program entry into a standalone event', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.evaluate(() => {
        const event = window.state.events[0];
        const station = window.state.stations[0];
        event.stationId = String(station.id);
        event.lat = station.lat;
        event.lng = station.lng;
        event.loc = station.name;
        window.editEvent(event.id);
    });

    await expect(page.locator('#evt-unlink-station')).toBeVisible();
    await page.locator('#evt-unlink-station').click();
    await expect(page.locator('#evt-linked-station')).toHaveValue('');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect.poll(() => page.evaluate(() => window.state.events[0].stationId)).toBe('');
});

test('standalone program entries use a calendar icon on the map', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.events.push({
            id: 'standalone-map-event',
            time: '19:30',
            title: 'Eigenständiges Programm',
            desc: '',
            loc: 'Marktplatz',
            stationId: '',
            lat: 49.159,
            lng: 10.552,
            color: 'purple'
        });
        window.refreshMapMarkers();
    });

    const programMarker = page.getByRole('button', { name: 'Eigenständiges Event: Eigenständiges Programm' });
    await expect(programMarker).toBeVisible();
    await expect(programMarker.locator('.ph-calendar-star')).toBeVisible();
    await expect(programMarker).not.toContainText('E');
    await programMarker.click();
    await expect(page.locator('#program-event-modal')).toBeVisible();
});

test('deleting a program entry removes it immediately', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.evaluate(() => {
        window.state.events.push({ id: 'delete-program-event', time: '18:45', title: 'Zu löschendes Programm', loc: 'Marktplatz', lat: 49.159, lng: 10.552 });
        window.renderTimeline();
    });

    page.once('dialog', dialog => dialog.accept());
    await page.evaluate(() => window.deleteEvent('delete-program-event'));
    await expect.poll(() => page.evaluate(() => window.state.events.some(event => event.id === 'delete-program-event'))).toBe(false);
    await expect(page.locator('#timeline-container')).not.toContainText('Zu löschendes Programm');
});

test('new visitors get a concise onboarding with useful first actions', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.removeItem('tutorial_seen');
        localStorage.removeItem('onboarding_dismissed');
        localStorage.removeItem('mini_tour_seen_v1');
        localStorage.removeItem('mini_tour_prompt_dismissed_v1');
    });
    await page.goto('/index.html');

    await expect(page.locator('#tutorial-modal')).toBeVisible();
    await expect(page.locator('#tutorial-modal')).toContainText('Stationen sammeln');
    await expect(page.locator('#tutorial-modal')).toContainText('Dark Mode');
    await expect(page.getByRole('button', { name: /GPS aktivieren/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ohne Standort fortfahren' })).toBeVisible();
    await page.getByRole('button', { name: /Kurze Tour ansehen/ }).click();
    await expect(page.locator('.tour-tooltip')).toBeVisible();
    await expect(page.locator('.tour-tooltip')).toContainText('Standort bestimmen');
});

test('completed onboarding stays dismissed after reloading the app', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.removeItem('onboarding_completed_v2');
        localStorage.removeItem('tutorial_seen');
        localStorage.removeItem('onboarding_dismissed');
    });
    await page.goto('/index.html');
    await page.getByRole('button', { name: 'Ohne Standort fortfahren' }).click();
    await expect(page.locator('#tutorial-modal')).toBeHidden();

    await page.reload();
    await expect(page.locator('#tutorial-modal')).toBeHidden();
});

test('mobile station modal shows its image and subtle website link', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.stations[0].image = '/icon.png';
        window.state.stations[0].link = 'https://example.com/station';
        window.renderList(window.state.stations);
    });
    await page.locator('#nav-list').click();
    await page.locator('#stations-list > button').first().click();

    await expect(page.locator('#modal-image-container img')).toBeVisible();
    await expect(page.locator('#modal-image-container img')).toHaveClass(/object-contain/);
    await expect(page.locator('#modal-link-btn')).toBeVisible();
    await expect(page.locator('#modal-link-btn')).toHaveText(/Webseite/);
});

test('long station names do not overlap rating actions', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.stations[0].name = 'INTEGRATIONSKEGELCLUB PUDEL';
        window.openStation(window.state.stations[0].id);
    });
    const boxes = await page.evaluate(() => {
        const title = document.getElementById('modal-title').getBoundingClientRect();
        const actions = document.getElementById('modal-rating-actions').getBoundingClientRect();
        return { titleRight: title.right, actionsLeft: actions.left };
    });
    expect(boxes.titleRight).toBeLessThanOrEqual(boxes.actionsLeft);
});

test('station modal supports swipe-down and favorite vibration feedback', async ({ page }) => {
    await page.addInitScript(() => {
        window.__vibrationCalls = [];
        Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pattern => {
            window.__vibrationCalls.push(pattern);
            return true;
        } });
    });
    await page.goto('/index.html');
    await page.locator('#nav-list').click();
    await page.locator('#stations-list > button').first().click();
    await page.locator('#modal-fav-btn').click();
    await expect.poll(() => page.evaluate(() => window.__vibrationCalls.length)).toBeGreaterThan(0);
    await expect(page.locator('#modal-fav-btn')).toHaveClass(/favorite-feedback/);

    await page.evaluate(() => {
        const modalBody = document.getElementById('modal-number');
        modalBody.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 100, clientY: 100 }));
        window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientY: 200 }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientY: 200 }));
    });
    await expect(page.locator('#detail-modal')).toBeHidden();
});

test('offline mode shows cached-data status and queues visitor actions', async ({ page, context }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.visitorDataSavedAt = Date.now();
    });
    await context.setOffline(true);
    await expect(page.locator('#connection-status')).toBeVisible();
    await expect(page.locator('#connection-status')).toContainText('Offline');
    await expect(page.locator('#connection-status')).toContainText('Daten vom');

    await page.locator('#nav-list').click();
    await page.locator('#stations-list > button').first().click();
    await page.locator('#modal-like-btn').click();
    const queuedTypes = await page.evaluate(() => JSON.parse(localStorage.getItem('offline_action_queue_v1') || '[]').map(item => item.type));
    expect(queuedTypes).toContain('like');
    expect(queuedTypes).toContain('audit');
});

test('vector map renders stations without an API-key warning', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await expect(page.locator('.maplibregl-marker .station-pin')).not.toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('API KEY REQUIRED');
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
});

test('map layer control toggles satellite view without an API key', async ({ page }) => {
    await page.goto('/index.html');
    const layerButton = page.locator('#map-layer-btn');

    await layerButton.click();
    await expect.poll(() => page.evaluate(() => Boolean(window.state.map.getStyle()?.sources?.['esri-world-imagery']))).toBe(true);
    await expect(layerButton).toHaveAttribute('aria-label', 'Kartenansicht einschalten');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('map_view_mode_v1'))).toBe('satellite');

    await layerButton.click();
    await expect(layerButton).toHaveAttribute('aria-label', 'Satellitenansicht einschalten');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('map_view_mode_v1'))).toBe('map');
});

test('map overview draws a guided round route without direction arrows', async ({ page }) => {
    await page.route('https://routing.openstreetmap.de/**/table/**', route => {
        const count = route.request().url().split('/driving/')[1].split('?')[0].split(';').length;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'Ok', durations: Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, column) => Math.abs(row - column) * 60)) }) });
    });
    await page.route('https://routing.openstreetmap.de/**/route/**', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
            code: 'Ok',
            routes: [{
                distance: 2400,
                duration: 1800,
                geometry: {
                    type: 'LineString',
                    coordinates: [[10.5484, 49.15714], [10.552, 49.158], [10.5484, 49.15714]]
                }
            }]
        })
    }));
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.userLocation = { lat: 49.15714, lng: 10.5484 };
        window.state.gpsAccuracy = 10;
        window.state.gpsLastFixAt = Date.now();
    });

    const routeButton = page.locator('#map-overview-route-btn');
    await routeButton.click();
    await expect(page.locator('#route-plan-modal')).toBeVisible();
    await page.locator('[data-route-plan-submit]').click();
    await expect.poll(() => page.evaluate(() => Boolean(window.state.overviewRouteGeometry))).toBe(true);
    await expect(page.locator('#route-info')).toBeVisible();
    await expect(page.locator('#route-info-title')).toContainText('Rundweg');
    await expect(page.locator('#route-info-detail')).toContainText('2.4 km');
    if (page.viewportSize().width < 640) {
        const layout = await page.evaluate(() => {
            const [routeInfo, routeButton, layerButton] = ['route-info', 'map-overview-route-btn', 'map-layer-btn'].map(id => document.getElementById(id).getBoundingClientRect());
            const overlaps = (first, second) => first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
            return {
                routeInfo: { left: routeInfo.left, right: routeInfo.right },
                routeButtonOverlaps: overlaps(routeInfo, routeButton),
                layerButtonOverlaps: overlaps(routeInfo, layerButton)
            };
        });
        expect(layout.routeInfo.left).toBeGreaterThanOrEqual(100);
        expect(layout.routeInfo.right).toBeLessThanOrEqual(page.viewportSize().width - 8);
        expect(layout.routeButtonOverlaps).toBe(false);
        expect(layout.layerButtonOverlaps).toBe(false);
    }
    await expect(page.locator('.overview-route-arrow')).toHaveCount(0);
    await page.evaluate(() => {
        window.state.userLocation = { lat: 49.15714, lng: 10.5484 };
        window.state.gpsAccuracy = 10;
        window.state.gpsLastFixAt = Date.now();
    });
    await expect.poll(() => page.evaluate(() => window.state.overviewRouteNavigationActive)).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(window.state.overviewApproach?.route))).toBe(true);
    await expect(page.locator('#route-info-detail')).toContainText('Fußweg zum Ziel');
    expect(await page.evaluate(() => Boolean(window.state.map.getLayer('overview-approach-line')))).toBe(true);
    await expect(page.locator('#overview-route-skip-btn')).toBeVisible();
    await page.locator('#overview-route-skip-btn').click();
    await expect.poll(() => page.evaluate(() => window.state.overviewRouteNavigationProgress)).toBe(1);

    await page.locator('#route-info button[onclick="clearRoute()"]').click();
    await expect.poll(() => page.evaluate(() => Boolean(window.state.overviewRouteGeometry))).toBe(false);
    expect(await page.evaluate(() => Boolean(window.state.map.getLayer('overview-approach-line')))).toBe(false);
});

for (const mode of ['open', 'round']) test(`${mode} walking tour starts at GPS and finishes at the correct endpoint`, async ({ page }) => {
    await page.route('https://routing.openstreetmap.de/**', route => {
        const url = route.request().url();
        const count = url.split('/driving/')[1].split('?')[0].split(';').length;
        const result = url.includes('/table/')
            ? { code: 'Ok', durations: Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, column) => Math.abs(row - column) * 60)) }
            : { code: 'Ok', routes: [{ distance: 150, duration: 120, geometry: { type: 'LineString', coordinates: [[10.5484, 49.15714], [10.552, 49.158]] } }] };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.userLocation = { lat: 49.15, lng: 10.54 };
        window.state.gpsAccuracy = 5;
        window.state.gpsLastFixAt = Date.now();
    });
    await page.evaluate(() => window.openRoutePlan());
    await page.locator('[data-route-plan-mode]').selectOption(mode);
    await page.locator('[data-route-plan-none]').click();
    const options = page.locator('[data-route-plan-station]');
    await options.nth(0).check();
    await options.nth(1).check();
    await options.nth(2).check();
    await page.locator('[data-route-plan-submit]').click();
    await expect(page.locator('#route-info-title')).toContainText(`${mode === 'open' ? 'Stationentour' : 'Rundweg'} · 3 Stationen`);
    expect(await page.evaluate(() => window.state.overviewRouteOrigin)).toEqual({ lat: 49.15, lng: 10.54 });
    await expect(page.locator('.tour-start-marker')).toHaveText('Start');
    for (let stop = 0; stop < 3; stop += 1) {
        await page.evaluate(() => {
            const target = window.state.overviewRouteStations[window.state.overviewRouteNavigationIndex];
            window.state.userLocation = { lat: Number(target.lat), lng: Number(target.lng) };
            window.state.gpsLastFixAt = Date.now();
        });
        await expect(page.locator('#overview-route-navigation-btn')).toBeEnabled();
        await page.locator('#overview-route-navigation-btn').click();
    }
    if (mode === 'round') {
        await expect(page.locator('#route-info-detail')).toContainText('Zurück zu deinem GPS-Ausgangspunkt');
        await expect(page.locator('#overview-route-navigation-btn')).toBeDisabled();
        await page.evaluate(() => {
            window.state.userLocation = { ...window.state.overviewRouteOrigin };
            window.state.gpsLastFixAt = Date.now();
        });
        await expect(page.locator('#overview-route-navigation-btn')).toBeEnabled();
        await page.locator('#overview-route-navigation-btn').click();
    }
    await expect(page.locator('#route-info-detail')).toContainText('Tour beendet · 3 erreicht');
    expect(await page.evaluate(() => window.state.overviewRouteOrigin)).toEqual({ lat: 49.15, lng: 10.54 });
    expect(await page.evaluate(() => window.state.overviewApproach)).toBeNull();
    await page.evaluate(() => window.openRoutePlan());
    await expect(page.locator('[data-route-plan-mode]')).toHaveValue(mode);
});

test('route planner uses favorites and lets visitors adjust the selected stations', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => { window.state.favorites = new Set(['1', '2']); });

    await page.locator('#map-overview-route-btn').click();
    await page.locator('[data-route-plan-favorites]').click();
    await expect(page.locator('[data-route-plan-count]')).toContainText('2 Stationen ausgewählt');
    await expect(page.locator('input[data-route-plan-station]:checked')).toHaveCount(2);

    await page.locator('input[data-route-plan-station]').first().uncheck();
    await expect(page.locator('[data-route-plan-submit]')).toBeDisabled();
    await page.locator('[data-route-plan-all]').click();
    await expect(page.locator('[data-route-plan-submit]')).toBeEnabled();
    await page.locator('[data-route-plan-none]').click();
    await expect(page.locator('input[data-route-plan-station]:checked')).toHaveCount(0);
    await expect(page.locator('[data-route-plan-submit]')).toBeDisabled();
});

test('route planner selection buttons fit narrow screens without horizontal scrolling', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.openRoutePlan());
    for (const width of [320, 375, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        const bounds = await page.locator('[data-route-plan-none]').evaluate(button => {
            const container = button.parentElement;
            const rectangle = container.getBoundingClientRect();
            return {
                width: container.clientWidth, scrollWidth: container.scrollWidth,
                left: rectangle.left, right: rectangle.right,
                buttons: [...container.querySelectorAll('button')].map(item => {
                    const bounds = item.getBoundingClientRect();
                    return { left: bounds.left, right: bounds.right, height: bounds.height, width: item.clientWidth, scrollWidth: item.scrollWidth };
                })
            };
        });
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width);
        for (const button of bounds.buttons) {
            expect(button.left).toBeGreaterThanOrEqual(Math.max(0, bounds.left));
            expect(button.right).toBeLessThanOrEqual(Math.min(width, bounds.right));
            expect(button.height).toBeGreaterThanOrEqual(44);
            expect(button.scrollWidth).toBeLessThanOrEqual(button.width);
        }
        await page.locator('[data-route-plan-none]').click();
        await expect(page.locator('input[data-route-plan-station]:checked')).toHaveCount(0);
        await page.locator('[data-route-plan-all]').click();
        await expect(page.locator('[data-route-plan-submit]')).toBeEnabled();
    }
});

test('map falls back to OpenStreetMap raster tiles when vector style fails', async ({ page }) => {
    await page.route('https://tiles.openfreemap.org/**', route => route.abort());
    await page.goto('/index.html');

    await expect.poll(() => page.evaluate(() => Boolean(window.state.map.getSource('fallback-osm')))).toBe(true);
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await expect(page.locator('.maplibregl-marker .station-pin')).not.toHaveCount(0);
});

test('vector map ignores stations with invalid coordinates without crashing', async ({ page }) => {
    await page.goto('/index.html');
    const markerCount = await page.locator('.maplibregl-marker .station-pin').count();

    await page.evaluate(() => {
        window.state.stations.push({ id: 'invalid-map-test', name: 'Ungültige Position', lat: '', lng: 'kein-wert' });
        window.refreshMapMarkers();
    });

    await expect(page.locator('.maplibregl-marker .station-pin')).toHaveCount(markerCount);
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('moving an admin station marker saves its new coordinates', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.locator('#map-edit-mode-btn').click();

    await page.evaluate(() => {
        const stationMarker = window.state.markers.find(item => String(item.id) === '1').marker;
        stationMarker.setLngLat([10.55111, 49.15999]);
        stationMarker.fire('dragend');
    });

    await expect.poll(() => page.evaluate(() => {
        const station = window.state.stations.find(item => String(item.id) === '1');
        return [station.lat, station.lng];
    })).toEqual([49.15999, 10.55111]);
    await expect.poll(() => page.evaluate(() => {
        const station = JSON.parse(localStorage.getItem('stations_data')).find(item => String(item.id) === '1');
        return [station.lat, station.lng];
    })).toEqual([49.15999, 10.55111]);
});

test('map keeps individual station markers clickable after zooming out', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.state.map.jumpTo({ zoom: 13 }));
    await expect(page.locator('.station-cluster')).toHaveCount(0);
    const markers = page.locator('.custom-pin');
    await expect(markers).toHaveCount(await page.evaluate(() => window.state.markers.length));
    await markers.first().dispatchEvent('click');
    await expect(page.locator('#detail-modal')).toBeVisible();
    await expect(page.locator('#modal-title')).not.toBeEmpty();
});

test('GPS watch centers once and then allows free map movement', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:8000' });
    await context.setGeolocation({ latitude: 49.157, longitude: 10.548 });
    await page.goto('/index.html');
    await page.locator('#map-locate-btn').click();
    await expect.poll(() => page.evaluate(() => window.state.hasLocatedUser)).toBe(true);

    await page.evaluate(() => window.state.map.jumpTo({ center: [10.56, 49.165] }));
    const manuallySelectedCenter = await page.evaluate(() => window.state.map.getCenter().toArray());
    await context.setGeolocation({ latitude: 49.1571, longitude: 10.5481 });
    await page.waitForTimeout(500);

    const centerAfterGpsUpdate = await page.evaluate(() => window.state.map.getCenter().toArray());
    expect(centerAfterGpsUpdate[0]).toBeCloseTo(manuallySelectedCenter[0], 4);
    expect(centerAfterGpsUpdate[1]).toBeCloseTo(manuallySelectedCenter[1], 4);
});

test('startup and tab changes do not trigger a new GPS permission prompt', async ({ page }) => {
    await page.addInitScript(() => {
        window.__gpsRequests = 0;
        Object.defineProperty(navigator, 'permissions', {
            configurable: true,
            value: { query: async () => ({ state: 'prompt' }) }
        });
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: () => { window.__gpsRequests += 1; },
                watchPosition: () => { window.__gpsRequests += 1; return 1; },
                clearWatch: () => {}
            }
        });
    });

    await page.goto('/index.html');
    await page.locator('#nav-events').click();
    await page.locator('#nav-list').click();
    await page.locator('#nav-map').click();

    await expect.poll(() => page.evaluate(() => window.__gpsRequests)).toBe(0);
});

test('previously activated GPS resumes on Safari-like browsers without Permissions API', async ({ page }) => {
    await page.addInitScript(() => {
        window.__gpsRequests = 0;
        Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
        Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: (success) => {
                    window.__gpsRequests += 1;
                    success({ coords: { latitude: 49.157, longitude: 10.548, accuracy: 10 }, timestamp: Date.now() });
                },
                watchPosition: (success) => {
                    success({ coords: { latitude: 49.157, longitude: 10.548, accuracy: 10 }, timestamp: Date.now() });
                    return 1;
                },
                clearWatch: () => {}
            }
        });
    });

    await page.goto('/index.html');
    await page.locator('#map-locate-btn').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('gps_auto_resume_v1'))).toBe('true');

    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__gpsRequests)).toBeGreaterThan(0);
    await expect(page.locator('#map-locate-btn')).toHaveAttribute('aria-label', 'Standort erneut bestimmen');
});

test('GPS activation is retained when the page reloads before the first location fix', async ({ page }) => {
    await page.addInitScript(() => {
        const firstLoad = localStorage.getItem('gps-resume-intent-test') !== 'ready';
        localStorage.setItem('gps-resume-intent-test', 'ready');
        Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false });
        Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined });
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: firstLoad ? {
                getCurrentPosition: () => {},
                watchPosition: () => 1,
                clearWatch: () => {}
            } : {
                getCurrentPosition: success => success({ coords: { latitude: 49.157, longitude: 10.548, accuracy: 10 }, timestamp: Date.now() }),
                watchPosition: success => {
                    success({ coords: { latitude: 49.157, longitude: 10.548, accuracy: 10 }, timestamp: Date.now() });
                    return 1;
                },
                clearWatch: () => {}
            }
        });
    });

    await page.goto('/index.html');
    await page.locator('#map-locate-btn').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('gps_auto_resume_intent_v1'))).toBe('true');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('gps_auto_resume_v1'))).toBe(null);

    await page.reload();

    await expect(page.locator('#map-locate-btn')).toHaveAttribute('aria-label', 'Standort erneut bestimmen');
});

test('starting a route does not request compass permission again after GPS was activated', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('gps_auto_resume_v1', 'true');
        window.__compassPermissionRequests = 0;
        Object.defineProperty(window, 'DeviceOrientationEvent', {
            configurable: true,
            value: { requestPermission: async () => {
                window.__compassPermissionRequests += 1;
                return 'granted';
            } }
        });
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: success => success({ coords: { latitude: 49.157, longitude: 10.548, accuracy: 10 }, timestamp: Date.now() }),
                watchPosition: success => {
                    success({ coords: { latitude: 49.157, longitude: 10.548, accuracy: 10 }, timestamp: Date.now() });
                    return 1;
                },
                clearWatch: () => {}
            }
        });
    });
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.userLocation = null;
        window.state.overviewRouteGeometry = { type: 'LineString', coordinates: [] };
        window.state.overviewRouteStations = window.state.stations.slice(0, 2);
        window.startOverviewNavigation();
    });

    await expect.poll(() => page.evaluate(() => window.__compassPermissionRequests)).toBe(0);
});

test('compass permission is requested only after tapping the GPS control', async ({ page }) => {
    await page.addInitScript(() => {
        window.__compassPermissionRequests = 0;
        Object.defineProperty(window, 'DeviceOrientationEvent', {
            configurable: true,
            value: { requestPermission: async () => {
                window.__compassPermissionRequests += 1;
                return 'granted';
            } }
        });
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: success => success({ coords: { latitude: 49.157, longitude: 10.548, accuracy: 10 }, timestamp: Date.now() }),
                watchPosition: success => {
                    success({ coords: { latitude: 49.157, longitude: 10.548, accuracy: 10 }, timestamp: Date.now() });
                    return 1;
                },
                clearWatch: () => {}
            }
        });
    });
    await page.goto('/index.html');
    await page.evaluate(() => window.locateUser(null, { userInitiated: true }));

    await expect.poll(() => page.evaluate(() => window.__compassPermissionRequests)).toBe(0);
    await page.locator('#map-locate-btn').click();
    await expect.poll(() => page.evaluate(() => window.__compassPermissionRequests)).toBe(1);
});

test('empty station search explains active filters and can reset them', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#nav-list').click();
    await page.locator('#search-input').fill('unauffindbare-teststation-xyz');

    await expect(page.getByRole('heading', { name: 'Keine passenden Stationen' })).toBeVisible();
    await expect(page.locator('#stations-list')).toContainText('unauffindbare-teststation-xyz');
    await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();

    await expect(page.locator('#search-input')).toHaveValue('');
    await expect(page.locator('#stations-list > button')).not.toHaveCount(0);
});

test('changing a station filter scrolls the station list back to the top', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#nav-list').click();
    await page.evaluate(() => {
        const stationList = document.getElementById('stations-list');
        window.__stationListScrollTarget = null;
        stationList.scrollTo = options => { window.__stationListScrollTarget = options; };
    });

    await page.evaluate(() => window.filterList('favorites'));
    await expect.poll(() => page.evaluate(() => window.__stationListScrollTarget?.top)).toBe(0);
});

test('station and program forms clearly label non-obvious fields', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.locator('label[for="evt-loc"]')).toContainText('Ort / Adresse');
    await expect(page.locator('label[for="evt-address-search"]')).toContainText('Kartenposition suchen');
    await expect(page.getByText('Programmbild ⓘ')).toHaveCount(1);
});

test('station detail editing accepts manual coordinates with decimal commas', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.evaluate(() => {
        window.openStation(1);
        window.editStation(1);
    });
    await expect(page.locator('#modal-view-mode')).toBeVisible();
    await expect(page.locator('#inline-edit-lat')).toBeVisible();
    await expect(page.locator('#inline-edit-lng')).toBeVisible();
    await page.locator('#inline-edit-lat').fill('49,15719');
    await page.locator('#inline-edit-lng').fill('10,54844');
    await page.evaluate(async () => {
        const { refreshVisitorDataIfStale } = await import('/js/data.js?v=1.4.202');
        await refreshVisitorDataIfStale(0);
    });
    await expect(page.locator('#modal-view-mode')).toBeVisible();
    await expect(page.locator('#modal-content')).toHaveClass(/is-inline-station-editing/);
    await expect(page.locator('#inline-edit-lat')).toHaveValue('49,15719');
    await expect(page.locator('#inline-edit-lng')).toHaveValue('10,54844');
    await page.locator('#modal-inline-edit-actions').getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect.poll(() => page.evaluate(() => window.state.stations.find(station => station.id === 1)?.lat)).toBe(49.15719);
    await expect.poll(() => page.evaluate(() => window.state.stations.find(station => station.id === 1)?.lng)).toBe(10.54844);
});

test('station website link is retained after saving and reloading', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.evaluate(() => {
        window.openStation(1);
        window.editStation(1);
    });
    await page.locator('#inline-edit-link').fill('https://example.com/station-info');
    await page.locator('#modal-inline-edit-actions').getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.state.stations.find(station => station.id === 1)?.link)).toBe('https://example.com/station-info');

    await page.reload();
    await page.waitForFunction(() => window.__appReady === true);
    await page.evaluate(() => window.openStation(1));
    await expect(page.locator('#modal-link-btn')).toBeVisible();
});

test('station without an ID can be assigned a station number', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.evaluate(() => {
        const station = { __docId: 'synced-without-id', id: '', name: 'Neue Station', desc: '', offer: '', lat: 49.16, lng: 10.55, tags: [] };
        window.state.stations.push(station);
        window.editStation(station);
    });
    await page.locator('#modal-number').fill('99');
    await page.locator('#modal-inline-edit-actions').getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect.poll(() => page.evaluate(() => window.state.stations.some(station => station.id === 99 && station.name === 'Neue Station'))).toBe(true);
});

test('links in station descriptions are clickable and open safely', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        const station = window.state.stations[0];
        station.offer = 'Mehr Infos unter https://example.com/programm.';
        window.openStation(station.id);
    });

    const descriptionLink = page.locator('#modal-desc a');
    await expect(descriptionLink).toHaveText('https://example.com/programm');
    await expect(descriptionLink).toHaveAttribute('href', 'https://example.com/programm');
    await expect(descriptionLink).toHaveAttribute('target', '_blank');
    await expect(descriptionLink).toHaveAttribute('rel', 'noopener noreferrer');
});

test('station list shows the station description', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        const station = window.state.stations[0];
        station.offer = 'Livemusik, Getränke und kleine Snacks.';
        window.renderList(window.state.stations);
    });

    await expect(page.locator('#stations-list > button').first()).toContainText('Livemusik, Getränke und kleine Snacks.');
});

test('admin can create a standalone program event without a station', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.evaluate(() => window.openNewEvent());
    await expect(page.locator('#event-modal')).toBeVisible();
    await expect(page.locator('#evt-linked-station')).toHaveValue('');
    await page.locator('#evt-time').fill('18:30');
    await page.locator('#evt-title').fill('Eigenständige Show');
    await page.locator('#evt-loc').fill('Marktplatz');
    await page.locator('#event-modal').getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect(page.locator('#event-modal')).toBeHidden();
    await expect(page.locator('#timeline-container')).toContainText('Eigenständige Show');
});

test('admin can copy a program event and adjust it before saving', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.evaluate(() => window.editEvent(window.state.events[0].id));
    const originalTitle = await page.locator('#evt-title').inputValue();
    await page.locator('#btn-duplicate-event').click();

    await expect(page.locator('#btn-delete-event')).toBeHidden();
    await expect(page.locator('#btn-duplicate-event')).toBeHidden();
    await expect(page.locator('#evt-title')).toHaveValue(`${originalTitle} (Kopie)`);
    await page.locator('#evt-time').fill('22:15');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect(page.locator('#event-modal')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.state.events.filter(event => event.title === `${window.state.events[0].title} (Kopie)`).length)).toBe(1);
});

test('linked program event identifies its station in the timeline', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.evaluate(() => window.openNewEvent());
    await page.locator('#evt-linked-station').selectOption('1');
    await page.locator('#evt-time').fill('19:15');
    await page.locator('#evt-title').fill('Verknüpfte Vorführung');
    await page.locator('#event-modal').getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect(page.locator('#timeline-container')).toContainText('Bei Station #1');
    await expect(page.locator('#timeline-container')).toContainText('Deutsches Pinsel- & Bürstenmuseum');
});

test('visitor navigation is accessible and opens all main areas', async ({ page }) => {
    await page.goto('/index.html');

    const mapButton = page.getByRole('button', { name: 'Karte', exact: true });
    const stationButton = page.getByRole('button', { name: 'Stationen', exact: true });
    const programButton = page.getByRole('button', { name: 'Programm' });

    await expect(mapButton).toHaveAttribute('aria-current', 'page');
    await stationButton.click();
    await expect(stationButton).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#view-list')).toBeVisible();
    if (page.viewportSize().width < 640) await expect(page.locator('#floating-status')).toBeHidden();

    await programButton.click();
    await expect(programButton).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#view-events')).toBeVisible();

    await page.locator('#view-events .scroll-container').evaluate(element => {
        element.scrollTop = element.scrollHeight;
    });
    await expect(page.locator('#bottom-nav')).toBeVisible();
    const navBounds = await page.locator('#bottom-nav').evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom };
    });
    expect(navBounds.top).toBeGreaterThan(0);
    expect(navBounds.bottom).toBeGreaterThanOrEqual(page.viewportSize().height - 1);
});

test('mobile bottom navigation keeps every label fully visible', async ({ page }) => {
    await page.goto('/index.html');
    const layout = await page.locator('#bottom-nav').evaluate(nav => {
        const navBox = nav.getBoundingClientRect();
        const labels = [...nav.querySelectorAll('.nav-text')].map(label => {
            const box = label.getBoundingClientRect();
            return { top: box.top, bottom: box.bottom };
        });
        return { navTop: navBox.top, navBottom: navBox.bottom, labels };
    });
    for (const label of layout.labels) {
        expect(label.top).toBeGreaterThanOrEqual(layout.navTop);
        expect(label.bottom).toBeLessThanOrEqual(layout.navBottom - 8);
    }
    if (page.viewportSize().width < 640) {
        expect(layout.navBottom).toBeGreaterThanOrEqual(page.viewportSize().height - 1);
        expect(layout.navBottom - layout.navTop).toBeLessThanOrEqual(80);
        const floatingStatus = await page.locator('#floating-status').evaluate(element => {
            const box = element.getBoundingClientRect();
            return { bottom: box.bottom };
        });
        expect(floatingStatus.bottom).toBeLessThanOrEqual(layout.navTop - 8);
        const homeButton = await page.locator('#map-home-btn').evaluate(element => {
            const box = element.getBoundingClientRect();
            return { left: box.left, bottom: box.bottom };
        });
        expect(homeButton.left).toBeLessThan(32);
        expect(homeButton.bottom).toBeLessThanOrEqual(layout.navTop - 8);
        const gpsStatus = await page.locator('#map-gps-status').evaluate(element => {
            const box = element.getBoundingClientRect();
            return { top: box.top, bottom: box.bottom };
        });
        const attribution = await page.locator('.maplibregl-ctrl-top-left').evaluate(element => {
            const box = element.getBoundingClientRect();
            return { top: box.top, bottom: box.bottom };
        });
        expect(attribution.top).toBeGreaterThanOrEqual(gpsStatus.bottom + 8);
        await expect(page.locator('#map .maplibregl-ctrl-attrib')).not.toHaveAttribute('open', '');
    }
});

test('program details can be dismissed by swiping the modal body down', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => window.openProgramEvent(window.state.events[0].id));
    await expect(page.locator('#program-event-modal')).toBeVisible();
    await expect(page.locator('#bottom-nav')).toBeVisible();

    if (page.viewportSize().width < 640) {
        const layout = await page.evaluate(() => {
            const modal = document.getElementById('program-event-modal').getBoundingClientRect();
            const navigation = document.getElementById('bottom-nav').getBoundingClientRect();
            return { modalBottom: modal.bottom, navigationTop: navigation.top };
        });
        expect(layout.modalBottom).toBeLessThanOrEqual(layout.navigationTop + 1);
    }

    await page.getByRole('button', { name: 'Programmpunkt schließen' }).click();
    await expect(page.locator('#program-event-modal')).toHaveCount(0);
    await page.getByRole('button', { name: 'Stationen', exact: true }).click();
    await expect(page.locator('#view-list')).toBeVisible();

    await page.evaluate(() => window.openProgramEvent(window.state.events[0].id));
    await expect(page.locator('#program-event-modal')).toBeVisible();

    await page.evaluate(() => {
        const title = document.querySelector('#program-event-modal h2');
        title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 100, clientY: 100 }));
        window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 100, clientY: 200 }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 100, clientY: 200 }));
    });

    await expect(page.locator('#program-event-modal')).toBeHidden();
});

test('welcome card does not duplicate the main navigation', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('visitor_start_card_dismissed_v1'));
    await page.addInitScript(() => localStorage.removeItem('visitor_start_card_dismissed_v2'));
    await page.goto('/index.html');

    await expect(page.locator('#visitor-start-card')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Standort aktivieren & Stationen finden' })).toBeVisible();
    await expect(page.locator('#visitor-start-card [data-visitor-tab]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Karte', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Stationen', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Programm', exact: true })).toHaveCount(1);
});

test('station route actions clearly distinguish app route and Google Maps', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#nav-list').click();
    await page.locator('#stations-list > button').first().click();

    await expect(page.getByRole('button', { name: 'Route in der App anzeigen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mit Google Maps navigieren' })).toBeVisible();
});

test('header shows a compact countdown for the configured event window', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const date = `${String(tomorrow.getDate()).padStart(2, '0')}.${String(tomorrow.getMonth() + 1).padStart(2, '0')}.${tomorrow.getFullYear()}`;
        window.state.downloads.icsDate = `${date} 17:00-22:30`;
        window.updateHeaderCountdown();
    });

    await expect(page.locator('#app-countdown')).toBeVisible();
    await expect(page.locator('#app-countdown')).toContainText(/Noch 1 Tag|Start in/);
});

test('planning popup shows countdown only when an event date is configured', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        const eventStart = new Date();
        eventStart.setDate(eventStart.getDate() + 2);
        const date = `${String(eventStart.getDate()).padStart(2, '0')}.${String(eventStart.getMonth() + 1).padStart(2, '0')}.${eventStart.getFullYear()}`;
        window.state.config.planningMode = true;
        window.state.downloads.icsDate = `${date} 17:00-22:30`;
        window.checkPlanningMode();
    });

    await expect(page.locator('#planning-countdown')).toContainText(/Noch \d+ (Tag|Tage), \d+ Std\./);
    await page.evaluate(() => {
        window.closePlanningBanner();
        window.state.downloads.icsDate = '';
        window.checkPlanningMode();
    });
    await expect(page.locator('#planning-countdown')).toHaveCount(0);
});

test('dismissed planning popup stays closed during data refreshes', async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => {
        window.state.config.planningMode = true;
        window.state.config.planningText = 'Neue Planung läuft';
        window.checkPlanningMode();
    });
    await expect(page.locator('#planning-banner')).toBeVisible();
    await page.getByRole('button', { name: 'Verstanden' }).click();
    await expect(page.locator('#planning-banner')).toHaveCount(0);

    await page.evaluate(() => window.checkPlanningMode());
    await expect(page.locator('#planning-banner')).toHaveCount(0);

    await page.evaluate(() => {
        window.state.config.planningText = 'Planung wurde aktualisiert';
        window.checkPlanningMode();
    });
    await expect(page.locator('#planning-banner')).toBeVisible();
});

test('location marker stays visible above stations and follows GPS updates', async ({ context, page }) => {
    await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:8000' });
    await context.setGeolocation({ latitude: 49.15714, longitude: 10.5484, accuracy: 12 });
    await page.goto('/index.html');
    await page.locator('#map-locate-btn').click();

    const marker = page.locator('.user-loc');
    await expect(marker).toBeVisible();
    await expect(marker).toHaveClass(/maplibregl-marker/);
    await expect(page.locator('#map-locate-btn')).toHaveAttribute('aria-label', 'Standort erneut bestimmen');
    await expect(page.locator('#map-locate-btn')).not.toHaveClass(/ring-blue-500/);
    const controlSizes = await page.locator('#map-locate-btn, #map-home-btn').evaluateAll(buttons => buttons.map(button => {
        const box = button.getBoundingClientRect();
        return [Math.round(box.width), Math.round(box.height)];
    }));
    expect(controlSizes).toEqual([[48, 48], [48, 48]]);
    await expect(page.locator('#map-locate-btn + #map-gps-status')).toHaveCount(1);
    const gpsStatusDotContent = await page.locator('#map-locate-btn').evaluate(button => getComputedStyle(button, '::after').content);
    expect(gpsStatusDotContent).toBe('none');

    const initialPosition = await marker.getAttribute('style');
    await context.setGeolocation({ latitude: 49.1582, longitude: 10.5501, accuracy: 8 });
    await expect.poll(() => marker.getAttribute('style')).not.toBe(initialPosition);
    await expect(marker).toHaveClass(/maplibregl-marker/);

    const markerZIndex = await marker.evaluate(element => getComputedStyle(element).zIndex);
    expect(Number(markerZIndex)).toBeGreaterThan(600);
});

test('internal route is drawn on the MapLibre map', async ({ context, page }) => {
    await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:8000' });
    await context.setGeolocation({ latitude: 49.15714, longitude: 10.5484, accuracy: 10 });
    await page.route('**/route/v1/driving/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ routes: [{ geometry: { type: 'LineString', coordinates: [[10.5484, 49.15714], [10.55191, 49.15712]] } }] })
    }));
    await page.goto('/index.html');
    await page.locator('#map-locate-btn').click();
    await expect(page.locator('.user-loc')).toBeVisible();
    await page.locator('#nav-list').click();
    await page.locator('#stations-list > button').first().click();
    await page.locator('#btn-internal-route').click();

    await expect.poll(() => page.evaluate(() => Boolean(window.state?.routeGeometry))).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(window.state?.map?.getLayer('active-route-line')))).toBe(true);
    await expect(page.locator('#route-info')).toBeHidden();
    await page.evaluate(() => window.clearRoute());
    await expect(page.locator('#route-info')).toBeHidden();
    await expect.poll(() => page.evaluate(() => Boolean(window.state?.map?.getLayer('active-route-line')))).toBe(false);
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('location button remains usable during a GPS search', async ({ context, page }) => {
    await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:8000' });
    await page.goto('/index.html');

    const locateButton = page.locator('#map-locate-btn');
    await expect(locateButton).toBeEnabled();
    await locateButton.click();

    await context.setGeolocation({ latitude: 49.15714, longitude: 10.5484, accuracy: 12 });
    await expect(page.locator('.user-loc')).toBeVisible();
    await expect(locateButton).toHaveAttribute('aria-label', 'Standort erneut bestimmen');
});

test('blocked location permission opens recovery instructions', async ({ context, page }) => {
    await context.clearPermissions();
    await page.goto('/index.html');
    await page.locator('#map-locate-btn').click();

    await expect(page.locator('#location-permission-help')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Standort wieder freigeben' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
});

test('visitor pass hides admin exports', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#pass-progress').click();

    await expect(page.locator('#pass-modal')).toBeVisible();
    await expect(page.locator('#pass-history-export')).toHaveCount(0);
});

test('help explains current favorite, voting and notification controls', async ({ page }) => {
    await page.goto('/help.html');

    await expect(page.getByText('Markiere Stationen mit dem Stern')).toBeVisible();
    await expect(page.getByText('Gib einer Station einmalig einen Daumen hoch')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Programmerinnerungen' })).toBeVisible();
});

test('admin shortcut opens login and local admin can run data check', async ({ page }) => {
    await page.goto('/admin/');

    await expect(page.locator('#login-modal')).toBeVisible();
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.locator('#admin-panel')).toBeVisible();
    const dataSection = page.locator('#admin-data-section');
    await expect(dataSection).not.toHaveAttribute('open', '');
    await dataSection.locator('summary').click();
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await expect(page.locator('#admin-validation-results')).not.toContainText('Noch nicht geprüft.');

    const auditSection = page.locator('#admin-audit-section');
    await expect(auditSection).not.toHaveAttribute('open', '');
    await auditSection.locator('summary').click();
    await expect(page.locator('#admin-audit-role')).toHaveValue('visitor');
    await expect(page.getByText('keine Namen, Kontaktdaten, GPS-Koordinaten oder Freitexte')).toBeVisible();
});

test('active admin input extends the inactivity session', async ({ page }) => {
    await page.addInitScript(() => {
        const originalSetTimeout = window.setTimeout.bind(window);
        window.__adminIdleTimerCount = 0;
        window.setTimeout = (callback, delay, ...args) => {
            if (delay >= 3_599_000 && delay <= 3_600_000) window.__adminIdleTimerCount += 1;
            return originalSetTimeout(callback, delay, ...args);
        };
    });
    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();

    const initialTimerCount = await page.evaluate(() => window.__adminIdleTimerCount);
    const configSection = page.locator('#admin-experience-section');
    await configSection.locator('summary').click();
    await page.locator('#admin-app-title').fill('Aktive Bearbeitung');
    await expect.poll(() => page.evaluate(() => window.__adminIdleTimerCount)).toBeGreaterThan(initialTimerCount);
});

test('station image endpoint rejects unauthenticated uploads', async ({ request }) => {
    const response = await request.post('/api/station-image?station=1', {
        headers: { 'Content-Type': 'image/webp' },
        data: Buffer.from('not-a-webp')
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
});

test('event image endpoint rejects unauthenticated uploads', async ({ request }) => {
    const response = await request.post('/api/event-image?event=e1', {
        headers: { 'Content-Type': 'image/webp' },
        data: Buffer.from('not-a-webp')
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
});

test('flyer upload endpoint rejects unauthenticated PDF uploads', async ({ request }) => {
    const response = await request.post('/api/flyer-pdf?slot=flyer1', {
        headers: { 'Content-Type': 'application/pdf' },
        data: Buffer.from('%PDF-1.7\n')
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
});

test('Google Sheets synchronization endpoint requires an admin token', async ({ request }) => {
    const response = await request.get('/api/google-sheet?id=12345678901234567890&sheet=Stationen');
    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Admin-Anmeldung ungültig' });
});

test('system metrics are protected and visible only in admin UI', async ({ request, page }) => {
    const response = await request.get('/api/system-metrics');
    expect(response.status()).toBe(403);

    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Systemstatus' })).toBeVisible();
    await expect(page.locator('#admin-system-metrics')).toBeVisible();
    await expect(page.locator('#admin-release-version')).toHaveText(/v\d+\.\d+\.\d+/);
});
