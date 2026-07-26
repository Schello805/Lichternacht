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
    await page.locator('#stations-list > div').first().waitFor({ state: 'visible' });
    await page.locator('#stations-list > div').first().click();

    await expect(page.locator('#detail-modal')).toBeVisible();
    await expect(page.locator('#modal-title')).not.toBeEmpty();
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
