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
    const stationButton = page.getByRole('button', { name: 'Stationen' });
    const programButton = page.getByRole('button', { name: 'Programm' });

    await expect(mapButton).toHaveAttribute('aria-current', 'page');
    await stationButton.click();
    await expect(stationButton).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#view-list')).toBeVisible();

    await programButton.click();
    await expect(programButton).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#view-events')).toBeVisible();
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

test('location marker stays visible above stations and follows GPS updates', async ({ context, page }) => {
    await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:8000' });
    await context.setGeolocation({ latitude: 49.15714, longitude: 10.5484, accuracy: 12 });
    await page.goto('/index.html');
    await page.locator('#map-locate-btn').click();

    const marker = page.locator('.user-loc');
    await expect(marker).toBeVisible();
    await expect(page.locator('#map-locate-btn')).toHaveAttribute('aria-label', 'Standort erneut bestimmen');

    const initialPosition = await marker.getAttribute('style');
    await context.setGeolocation({ latitude: 49.1582, longitude: 10.5501, accuracy: 8 });
    await expect.poll(() => marker.getAttribute('style')).not.toBe(initialPosition);

    const paneZIndex = await marker.evaluate(element => getComputedStyle(element.parentElement).zIndex);
    expect(Number(paneZIndex)).toBeGreaterThan(600);
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
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await expect(page.locator('#admin-validation-results')).not.toContainText('Noch nicht geprüft.');
});

test('station image endpoint rejects unauthenticated uploads', async ({ request }) => {
    const response = await request.post('/api/station-image?station=1', {
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
