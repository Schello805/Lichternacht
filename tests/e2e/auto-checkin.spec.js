import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const mainSource = await readFile(new URL('../../main.js', import.meta.url), 'utf8');
const { version } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const passModalStart = mainSource.indexOf('window.showPassInfo = () => {');
const passModalEnd = mainSource.indexOf('\nwindow.openPrizeClaimModal =', passModalStart);
if (passModalStart < 0 || passModalEnd < 0) throw new Error('Pass modal integration could not be isolated');
const harnessModule = `
    import { state } from '/js/state.js';
    import * as utils from '/js/utils.js?v=${version}';
    import { countAvailableStations } from '/js/station-status.js?v=${version}';
    import { initAutoCheckin, checkProximity } from '/js/gamification.js?v=${version}';
    import { locateUser } from '/js/maplibre-map.js?v=${version}';
    import { getCheckinSyncSummary } from '/js/offline-sync.js?v=${version}';
    const showToast = utils.showToast;
    const hasAcceptedPassParticipation = () => false;
    const isPassParticipationAvailable = () => false;
    function getPassProgressSnapshot() {
        const visitedRecords = utils.getPassVisitedStationRecords(state.stations);
        return { visitedRecords, visited: visitedRecords.length, total: countAvailableStations(state.stations) };
    }
    ${mainSource.slice(passModalStart, passModalEnd)}
    Object.assign(window, { state, checkProximity, locateUser });
    state.useLocalStorage = true;
    state.localBackend = false;
    state.config = {};
    state.downloads.icsDate = '21.11.2026 17:00-23:59';
    state.stations = [
        { id: 1, name: 'Nearby station', lat: 49.157, lng: 10.548 },
        ...[2, 3, 4].map(id => ({ id, name: 'Distant station', lat: 49.157 + id, lng: 10.548 }))
    ];
    state.map = null;
    state.hasLocatedUser = true;
    navigator.geolocation.getCurrentPosition = success => { window.__gpsSuccess = success; };
    navigator.geolocation.watchPosition = (success, error) => {
        window.__gpsSuccess = success;
        window.__gpsError = error;
        return 1;
    };
    navigator.geolocation.clearWatch = () => {};
    window.__emitFix = (accuracy = 10, timestamp = Date.now()) => window.__gpsSuccess({
        coords: { latitude: 49.157, longitude: 10.548, accuracy }, timestamp
    });
    window.__startFixes = () => {
        window.__emitFix();
        window.__fixInterval = setInterval(() => window.__emitFix(), 1000);
    };
    window.__visited = () => JSON.parse(localStorage.getItem('visited_stations') || '[]');
    window.__harnessReady = true;
`;

test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-21T18:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-21T18:00:00Z'));
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'auto-checkin.test') return route.abort();
        if (url.pathname === '/main.js') return route.fulfill({ contentType: 'text/javascript', body: harnessModule });
        try {
            const body = await readFile(new URL(`../../${url.pathname.slice(1)}`, import.meta.url));
            const contentType = /\.m?js$/.test(url.pathname) ? 'text/javascript'
                : url.pathname.endsWith('.html') ? 'text/html'
                    : url.pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream';
            return route.fulfill({ body, contentType });
        } catch {
            return route.fulfill({ status: 404, body: '' });
        }
    });
    await page.goto('https://auto-checkin.test/index.html');
    await page.waitForFunction(() => window.__harnessReady);
    await page.evaluate(async () => {
        document.getElementById('onboarding-overlay')?.remove();
        await window.locateUser(() => {}, { userInitiated: false, forceCenter: false });
        window.showPassInfo();
    });
});

test('mounted Pass checkbox defaults on, allows session opt-out and resets on reload', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', { name: 'Automatisch einchecken (freiwillig)' });
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(page.locator('#auto-checkin-description')).toContainText('Genauigkeit ist nicht garantiert');
    await page.evaluate(() => window.__startFixes());
    await page.clock.runFor(125000);
    expect(await page.evaluate(() => window.__visited())).toEqual([]);
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await page.evaluate(() => window.showPassInfo());
    await expect(checkbox).toBeChecked();
    await expect(checkbox).toHaveCount(1);
    await checkbox.uncheck();
    await page.clock.runFor(125000);
    expect(await page.evaluate(() => window.__visited())).toEqual([]);
    await page.reload();
    await page.waitForFunction(() => window.__harnessReady);
    await page.evaluate(() => window.showPassInfo());
    await expect(checkbox).toBeChecked();
});

test('strict two-minute boundary needs a new accurate fix and never opens the GPS hint', async ({ page }) => {
    await page.locator('#auto-checkin-enabled').check();
    await page.evaluate(() => window.__startFixes());
    await page.clock.runFor(120000);
    expect(await page.evaluate(() => window.__visited())).toEqual([]);
    await page.evaluate(() => clearInterval(window.__fixInterval));
    await page.clock.runFor(1);
    await page.evaluate(() => window.__emitFix(8, window.state.gpsLastFixAt));
    expect(await page.evaluate(() => window.__visited())).toEqual([]);
    await page.evaluate(() => window.__emitFix(8));
    expect(await page.evaluate(() => window.__visited())).toEqual(['1']);
    await expect(page.locator('#gps-checkin-hint-modal')).toHaveCount(0);
    await page.clock.runFor(10000);
    expect(await page.evaluate(() => window.__visited())).toEqual(['1']);
});

test('hidden transition and subsequent stale gap reset continuous dwell', async ({ page }) => {
    await page.locator('#auto-checkin-enabled').check();
    await page.evaluate(() => window.__startFixes());
    await page.clock.runFor(119000);
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__hidden ? 'hidden' : 'visible' });
        window.__hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(5000);
    expect(await page.evaluate(() => window.__visited())).toEqual([]);
    await page.evaluate(() => {
        window.__hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        window.__emitFix();
    });
    await page.clock.runFor(119000);
    expect(await page.evaluate(() => window.__visited())).toEqual([]);
    await page.evaluate(() => clearInterval(window.__fixInterval));
    await page.clock.runFor(10000);
    await page.evaluate(() => window.checkProximity(state.userLocation.lat, state.userLocation.lng));
    expect(await page.evaluate(() => window.__visited())).toEqual([]);
    await page.evaluate(() => window.__startFixes());
    await page.clock.runFor(120000);
    expect(await page.evaluate(() => window.__visited())).toEqual([]);
    await page.clock.runFor(1000);
    expect(await page.evaluate(() => window.__visited())).toEqual(['1']);
});

test('real geolocation updates display uncertain GPS badges and hide them only for good fixes', async ({ page }) => {
    await page.evaluate(() => window.__emitFix(75));
    for (const id of ['map-gps-status', 'list-gps-status']) {
        await expect(page.locator(`#${id}`)).toHaveText('GPS ±75 m');
        await expect(page.locator(`#${id}`)).not.toHaveClass(/\bhidden\b/);
    }
    expect(await page.evaluate(() => state.gpsAccuracy)).toBe(75);
    await page.clock.runFor(1000);
    await page.evaluate(() => window.__emitFix(20));
    for (const id of ['map-gps-status', 'list-gps-status']) {
        await expect(page.locator(`#${id}`)).toHaveClass(/\bhidden\b/);
    }
    await page.evaluate(() => {
        state.gpsAccuracy = null;
        window.__gpsError({ code: 2, message: 'Controlled missing accuracy' });
    });
    for (const id of ['map-gps-status', 'list-gps-status']) {
        await expect(page.locator(`#${id}`)).toHaveText('GPS-Genauigkeit unbekannt');
        await expect(page.locator(`#${id}`)).not.toHaveClass(/\bhidden\b/);
    }
});
