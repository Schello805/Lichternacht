import test from 'node:test';
import assert from 'node:assert/strict';

import {
    formatEventWindowDe,
    isWithinEventWindowNow,
    parseEventDateKey,
    parseEventWindowConfig,
    toCsvValue
} from '../js/utils.js';

test('parseEventDateKey accepts German, compact and ISO dates', () => {
    assert.equal(parseEventDateKey('22.11.2026 17:00-23:00'), '2026-11-22');
    assert.equal(parseEventDateKey('20261122'), '2026-11-22');
    assert.equal(parseEventDateKey('2026-11-22'), '2026-11-22');
});

test('parseEventWindowConfig parses optional time range', () => {
    const windowConfig = parseEventWindowConfig('22.11.2026 17:00-23:00');

    assert.deepEqual(windowConfig, {
        dateKey: '2026-11-22',
        startMin: 1020,
        endMin: 1380
    });
    assert.equal(formatEventWindowDe(windowConfig), '22.11.2026 17:00–23:00');
});

test('isWithinEventWindowNow respects configured date and time', () => {
    const windowConfig = parseEventWindowConfig('22.11.2026 17:00-23:00');

    assert.equal(isWithinEventWindowNow(windowConfig, new Date('2026-11-22T18:00:00+01:00')), true);
    assert.equal(isWithinEventWindowNow(windowConfig, new Date('2026-11-22T16:00:00+01:00')), false);
    assert.equal(isWithinEventWindowNow(windowConfig, new Date('2026-11-23T18:00:00+01:00')), false);
});

test('toCsvValue quotes values that need escaping', () => {
    assert.equal(toCsvValue('normal'), 'normal');
    assert.equal(toCsvValue('A;B'), '"A;B"');
    assert.equal(toCsvValue('Er sagt "Hallo"'), '"Er sagt ""Hallo"""');
});
