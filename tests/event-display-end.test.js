import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEventWindowConfig, getEventDisplayEnd, isEventEndReminderDue, isWithinPassCheckinWindowNow } from '../js/utils.js';
import { updateHeaderCountdown } from '../js/header-countdown.js';
import { state } from '../js/state.js';

test('end message and prize reminder wait thirty minutes without changing check-ins', () => {
    const window = parseEventWindowConfig('21.11.2026 17:00-21:00');
    assert.equal(getEventDisplayEnd(window).getTime(), new Date(2026, 10, 21, 21, 30).getTime());
    for (const time of [new Date(2026, 10, 21, 21), new Date(2026, 10, 21, 21, 29, 59)]) assert.equal(isEventEndReminderDue(window, time), false);
    assert.equal(isEventEndReminderDue(window, new Date(2026, 10, 21, 21, 30)), true);
    assert.equal(isEventEndReminderDue(window, new Date(2026, 10, 22, 21, 30)), false);
    assert.equal(isEventEndReminderDue(null), false);
    assert.equal(isWithinPassCheckinWindowNow(window, new Date(2026, 10, 21, 23, 59)), true);
});

test('thirty-minute grace also works for midnight and overnight endings', () => {
    for (const config of ['21.11.2026 17:00-23:45', '21.11.2026 22:00-00:45']) {
        const window = parseEventWindowConfig(config);
        const end = getEventDisplayEnd(window);
        assert.equal(end.getDate(), 22);
        assert.equal(isEventEndReminderDue(window, new Date(end.getTime() - 1000)), false);
        assert.equal(isEventEndReminderDue(window, end), true);
    }
});

test('header keeps its end announcement back until 21:30', () => {
    const oldDocument = globalThis.document;
    const oldDownloads = state.downloads;
    const element = { textContent: '', classList: { add() {}, remove() {} } };
    globalThis.document = { getElementById: () => element };
    state.downloads = { icsDate: '21.11.2026 17:00-21:00' };
    try {
        updateHeaderCountdown(new Date(2026, 10, 21, 21, 29, 59));
        assert.doesNotMatch(element.textContent, /beendet/);
        updateHeaderCountdown(new Date(2026, 10, 21, 21, 30));
        assert.match(element.textContent, /beendet/);
    } finally {
        globalThis.document = oldDocument;
        state.downloads = oldDownloads;
    }
});
