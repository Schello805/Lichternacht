import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEventCalendar, canDownloadEventCalendar, getCalendarEventWindow } from '../js/event-calendar.js';

test('calendar visibility ends exactly one hour before Berlin start', () => {
    const config = '21.11.2026 16:30-21:00';
    const cutoff = Date.parse('2026-11-21T14:30:00Z');
    assert.equal(canDownloadEventCalendar(config, cutoff - 1), true);
    assert.equal(canDownloadEventCalendar(config, cutoff), false);
    assert.equal(canDownloadEventCalendar(config, Date.parse('2026-11-22T10:00:00Z')), false);
    assert.equal(buildEventCalendar(config, 'Lichternacht', cutoff), null);
});

test('calendar contains one complete event even without program entries', () => {
    const content = buildEventCalendar('21.11.2026 16:30-21:00', 'Lichternacht, Bechhofen', Date.parse('2026-11-01T10:00:00Z'));
    assert.equal(content.match(/BEGIN:VEVENT/g).length, 1);
    assert.match(content, /DTSTART:20261121T153000Z\r\n/);
    assert.match(content, /DTEND:20261121T200000Z\r\n/);
    assert.match(content, /SUMMARY:Lichternacht\\, Bechhofen/);
    assert.match(content, /UID:lichternacht-2026-11-21@/);
    assert.match(content, /URL:https:\/\/lichternacht-bechhofen.de\//);
});

test('calendar handles Berlin summer time, overnight events and all-day events', () => {
    const summer = getCalendarEventWindow('21.06.2026 17:00-01:00');
    assert.equal(new Date(summer.start).toISOString(), '2026-06-21T15:00:00.000Z');
    assert.equal(new Date(summer.end).toISOString(), '2026-06-21T23:00:00.000Z');
    const content = buildEventCalendar('31.12.2026', 'Lichternacht', Date.parse('2026-01-01T00:00:00Z'));
    assert.match(content, /DTSTART;VALUE=DATE:20261231/);
    assert.match(content, /DTEND;VALUE=DATE:20270101/);
    for (const input of ['', 'invalid', '21.11.2026 29:00-30:00', '21.11.2026 17:00-17:00']) {
        assert.equal(canDownloadEventCalendar(input, 0), false);
    }
});

test('calendar escapes text and folds UTF-8 lines without splitting characters', () => {
    const title = 'Ä'.repeat(80) + ';\r\nBEGIN:VEVENT';
    const content = buildEventCalendar('21.11.2026 16:30-21:00', title, 0);
    for (const line of content.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
    assert.equal(content.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
    assert.ok(content.replace(/\r\n /g, '').includes('SUMMARY:' + 'Ä'.repeat(80) + '\\;\\nBEGIN:VEVENT'));
});
