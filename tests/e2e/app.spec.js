import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('tracking_consent', 'denied');
        localStorage.setItem('tutorial_seen', 'true');
        localStorage.setItem('mini_tour_seen_v1', 'true');
        localStorage.setItem('visitor_start_card_dismissed_v1', 'true');
    });
});

test('visitor can open a station detail modal from the station list', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('#nav-list').click();
    await page.locator('#stations-list > button').first().waitFor({ state: 'visible' });
    await page.locator('#stations-list > button').first().click();

    await expect(page.locator('#detail-modal')).toBeVisible();
    await expect(page.locator('#modal-title')).not.toBeEmpty();
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

test('vector map renders stations without an API-key warning', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await expect(page.locator('.maplibregl-marker .station-pin')).not.toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('API KEY REQUIRED');
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
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

test('mobile map clusters close stations and zooms in on tap', async ({ page }) => {
    await page.goto('/index.html');
    const cluster = page.locator('.station-cluster').first();
    await expect(cluster).toBeVisible();
    const zoomBefore = await page.evaluate(() => window.state.map.getZoom());
    await cluster.dispatchEvent('click');
    await expect.poll(() => page.evaluate(() => window.state.map.getZoom())).toBeGreaterThan(zoomBefore);
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

test('station and program forms clearly label non-obvious fields', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.locator('label[for="evt-loc"]')).toContainText('Ort / Adresse');
    await expect(page.locator('label[for="evt-address-search"]')).toContainText('Kartenposition suchen');
    await expect(page.getByText('Programmbild ⓘ')).toHaveCount(1);
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

    const mapButton = page.getByRole('button', { name: 'Karte' });
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
});

test('program details can be dismissed by swiping the modal body down', async ({ page }) => {
    await page.goto('/index.html');
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
    await page.goto('/index.html');

    await expect(page.locator('#visitor-start-card')).toBeVisible();
    await expect(page.locator('#visitor-start-card [data-visitor-tab]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Karte', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Stationen', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Programm', exact: true })).toHaveCount(1);
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

test('location marker stays visible above stations and follows GPS updates', async ({ context, page }) => {
    await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:8000' });
    await context.setGeolocation({ latitude: 49.15714, longitude: 10.5484, accuracy: 12 });
    await page.goto('/index.html');
    await page.locator('#map-locate-btn').click();

    const marker = page.locator('.user-loc');
    await expect(marker).toBeVisible();
    await expect(marker).toHaveClass(/maplibregl-marker/);
    await expect(page.locator('#map-locate-btn')).toHaveAttribute('aria-label', 'Standort erneut bestimmen');

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
    const dataSection = page.locator('details').filter({ hasText: '1. Daten (Excel/Tabelle)' });
    await expect(dataSection).not.toHaveAttribute('open', '');
    await dataSection.locator('summary').click();
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await expect(page.locator('#admin-validation-results')).not.toContainText('Noch nicht geprüft.');

    const auditSection = page.locator('details').filter({ hasText: '9. Auditlog (pseudonym)' });
    await expect(auditSection).not.toHaveAttribute('open', '');
    await auditSection.locator('summary').click();
    await expect(page.locator('#admin-audit-role')).toHaveValue('visitor');
    await expect(page.getByText('keine Namen, Kontaktdaten, GPS-Koordinaten oder Freitexte')).toBeVisible();
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

test('system metrics are protected and visible only in admin UI', async ({ request, page }) => {
    const response = await request.get('/api/system-metrics');
    expect(response.status()).toBe(403);

    await page.goto('/admin/');
    await page.locator('#admin-email').fill('local@example.test');
    await page.locator('#admin-pass').fill('test-password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('heading', { name: 'Systemstatus' })).toBeVisible();
    await expect(page.locator('#admin-system-metrics')).toBeVisible();
});
