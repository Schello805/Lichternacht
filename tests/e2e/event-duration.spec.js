import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'duration.test') return route.abort();
        if (url.pathname === '/main.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
        try {
            const body = await readFile(new URL(`../../${url.pathname.slice(1)}`, import.meta.url));
            const contentType = /\.m?js$/.test(url.pathname) ? 'text/javascript' : url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.css') ? 'text/css' : 'application/octet-stream';
            await route.fulfill({ body, contentType });
        } catch {
            await route.fulfill({ status: 404, body: '' });
        }
    });
    await page.goto('https://duration.test/index.html');
    await page.evaluate(async () => {
        const ui = await import('/js/ui.js');
        const { state } = await import('/js/state.js');
        Object.assign(window, ui, { state });
        state.useLocalStorage = true;
        state.stations = [{ id: 1, name: 'Absage', cancelled: true, lat: 49, lng: 10 }];
        state.events = [{ id: 'show', time: '18:00', title: 'Show', loc: 'Platz', durationMinutes: 60, stationId: '1', cancelled: true, cancellationReason: 'Unverändert', lat: 49, lng: 10 }];
        state.downloads.icsDate = '21.11.2026 17:00-23:59';
    });
});

test('editor saves, copies, clears and validates duration while preserving metadata', async ({ page }) => {
    await page.evaluate(() => editEvent('show'));
    const duration = page.locator('#evt-duration');
    await expect(duration).toHaveValue('60');
    await duration.fill('1441');
    await page.evaluate(() => saveEventChanges());
    expect(await page.evaluate(() => state.events[0].durationMinutes)).toBe(60);
    await duration.fill('30');
    await page.evaluate(async () => { duplicateEvent(); await saveEventChanges(); });
    expect(await page.evaluate(() => state.events.map(event => [event.durationMinutes, event.cancelled, event.stationId]))).toEqual([[60, true, '1'], [30, true, '1']]);
    await page.evaluate(() => editEvent('show'));
    await duration.fill('');
    await page.evaluate(() => saveEventChanges());
    expect(await page.evaluate(() => Object.hasOwn(state.events[0], 'durationMinutes'))).toBe(false);
    expect(await page.evaluate(() => state.events[0].cancellationReason)).toBe('Unverändert');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('events_data'))[0].durationMinutes)).toBeUndefined();
    await page.evaluate(() => openNewEvent());
    await expect(duration).toHaveValue('');
});

test('status and end time honor overlapping durations and next-day live intervals', async ({ page }) => {
    const midnightQuarter = await page.evaluate(() => new Date(2026, 10, 22, 0, 15).getTime());
    await page.clock.install({ time: new Date(midnightQuarter) });
    await page.evaluate(() => {
        state.events = [{ id: 'late', time: '23:45', title: 'Nachtshow', loc: 'Platz', durationMinutes: 60 }, { id: 'next', time: '23:50', title: 'Parallelshow', loc: 'Platz' }];
        renderTimeline();
        openProgramEvent('late');
    });
    await expect(page.locator('[data-program-status-event="late"]')).toHaveText('Live');
    await expect(page.locator('#program-event-modal')).toContainText('23:45–00:45 Uhr (+1 Tag)');
    await expect(page.locator('#timeline-container')).toContainText('23:45–00:45 Uhr (+1 Tag)');
    await expect(page.locator('#current-event-display')).toContainText('Nachtshow');
    await page.clock.fastForward(30 * 60000);
    await page.evaluate(() => renderTimeline());
    await expect(page.locator('[data-program-status-event="late"]')).toHaveText('Vorbei');
});

test('single-event calendar uses explicit duration and retains legacy thirty-minute default', async ({ page }) => {
    for (const durationMinutes of [60, undefined]) {
        await page.evaluate(duration => {
            state.events[0].durationMinutes = duration;
            window.__calendarBlobs = [];
            URL.createObjectURL = blob => { window.__calendarBlobs.push(blob); return 'blob:duration-test'; };
            URL.revokeObjectURL = () => {};
            HTMLAnchorElement.prototype.click = () => {};
            openProgramEvent('show');
        }, durationMinutes);
        await page.locator('#program-calendar').click();
        const calendar = await page.evaluate(() => window.__calendarBlobs[0].text());
        const start = calendar.match(/DTSTART:(.*)/)[1];
        const end = calendar.match(/DTEND:(.*)/)[1];
        const dateValue = value => Date.parse(value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));
        expect(dateValue(end) - dateValue(start)).toBe((durationMinutes ?? 30) * 60000);
    }
});

test('old XLSX templates preserve duration while explicit blank cells clear it', async ({ page }) => {
    await page.addScriptTag({ url: 'https://duration.test/vendor/exceljs/exceljs.min.js' });
    const results = await page.evaluate(async () => {
        const { importEventsTable } = await import('/js/admin.js');
        window.confirm = () => true;
        HTMLAnchorElement.prototype.click = () => {};
        const results = [];
        for (const duration of [undefined, '', '45', 'invalid', '1441']) {
            state.events = [{ id: 'show', time: '18:00', title: 'Show', loc: 'Platz', durationMinutes: 60 }];
            const row = { id: 'show', time: '18:00', title: 'Imported show', description: '', link: '', image: '', loc: 'Platz', stationId: '', lat: '', lng: '', color: 'yellow' };
            if (duration !== undefined) row.durationMinutes = duration;
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Programm');
            sheet.addRow(Object.keys(row));
            sheet.addRow(Object.values(row));
            const file = new File([await workbook.xlsx.writeBuffer()], 'programm.xlsx');
            const transfer = new DataTransfer();
            transfer.items.add(file);
            document.getElementById('admin-events-table').files = transfer.files;
            await importEventsTable();
            results.push({ duration: state.events[0].durationMinutes ?? null, title: state.events[0].title });
        }
        return results;
    });
    expect(results).toEqual([
        { duration: 60, title: 'Imported show' },
        { duration: null, title: 'Imported show' },
        { duration: 45, title: 'Imported show' },
        { duration: 60, title: 'Show' },
        { duration: 60, title: 'Show' }
    ]);
});

test('station navigation starts walking directions safely without changing in-app routing', async ({ page }) => {
    await page.evaluate(() => {
        window.__navigation = [];
        window.open = (...args) => window.__navigation.push(args);
        openModal(state.stations[0]);
    });
    await expect(page.locator('#btn-route')).toBeDisabled();
    await page.evaluate(() => {
        state.stations[0].cancelled = false;
        openModal(state.stations[0]);
    });
    await page.locator('#btn-route').click();
    const navigation = await page.evaluate(() => window.__navigation);
    expect(navigation).toHaveLength(1);
    const url = new URL(navigation[0][0]);
    expect(url.searchParams.get('dir_action')).toBe('navigate');
    expect(url.searchParams.get('travelmode')).toBe('walking');
    expect(navigation[0].slice(1)).toEqual(['_blank', 'noopener,noreferrer']);
});
