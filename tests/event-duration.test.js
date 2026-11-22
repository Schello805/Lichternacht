import test from 'node:test';
import assert from 'node:assert/strict';
import { formatProgramTime, getExplicitProgramPhase, getProgramLiveEndMinutes, isValidEventDurationMinutes, parseEventDurationMinutes } from '../js/event-duration.js';
import { validateEvents } from '../js/validate.js';

test('duration is optional and otherwise an integer from 1 to 1440', () => {
    for (const value of [undefined, null, '', '  ']) {
        assert.equal(isValidEventDurationMinutes(value), true);
        assert.equal(parseEventDurationMinutes(value), null);
    }
    for (const value of [1, 30, 1440, ' 60 ']) {
        assert.equal(isValidEventDurationMinutes(value), true);
        assert.equal(parseEventDurationMinutes(value), Number(value));
    }
    for (const value of [0, -1, 1441, 1.5, '30min', NaN, Infinity, true, false, [], {}]) {
        assert.equal(isValidEventDurationMinutes(value), false);
        assert.equal(parseEventDurationMinutes(value), null);
    }
});

test('event validation identifies invalid explicit durations but accepts empty legacy cells', () => {
    const event = { id: 'show', time: '18:00', title: 'Show', loc: 'Platz' };
    for (const value of [undefined, null, '', ' ', 1, '30', 1440]) {
        assert.equal(validateEvents([{ ...event, durationMinutes: value }]).some(issue => issue.field === 'durationMinutes'), false);
    }
    for (const value of [0, -5, 1441, 1.5, 'invalid', true]) {
        assert.ok(validateEvents([{ ...event, durationMinutes: value }]).some(issue => issue.field === 'durationMinutes' && issue.severity === 'error'));
    }
});

test('explicit duration overrides next start while legacy boundaries stay unchanged', () => {
    const event = { time: '18:00' };
    const events = [event, { time: '18:15' }, { time: '18:00' }];
    assert.deepEqual(getProgramLiveEndMinutes({ ...event, durationMinutes: 60 }, events), { end: 1140, inclusive: false });
    assert.deepEqual(getProgramLiveEndMinutes({ ...event, durationMinutes: 5 }, events), { end: 1085, inclusive: false });
    assert.deepEqual(getProgramLiveEndMinutes(event, events), { end: 1095, inclusive: false });
    assert.deepEqual(getProgramLiveEndMinutes(event, [event]), { end: 1125, inclusive: true });
});

test('explicit live interval includes start, excludes end and crosses midnight', () => {
    const event = { time: '23:45', durationMinutes: 60 };
    const phase = now => getExplicitProgramPhase(event, '2026-11-21', now);
    assert.equal(phase(new Date(2026, 10, 21, 23, 44, 59)), null);
    assert.equal(phase(new Date(2026, 10, 21, 23, 45)), 'live');
    assert.equal(phase(new Date(2026, 10, 22, 0, 44, 59)), 'live');
    assert.equal(phase(new Date(2026, 10, 22, 0, 45)), 'past');
    assert.equal(getExplicitProgramPhase({ time: '23:45' }, '2026-11-21', new Date(2026, 10, 22)), null);
    assert.equal(getExplicitProgramPhase(event, null, new Date()), null);
    assert.equal(getExplicitProgramPhase({ time: '18:00', durationMinutes: 1440 }, '2026-11-21', new Date(2026, 10, 22, 17, 59)), 'live');
});

test('time labels show explicit end and next-day rollover only when configured', () => {
    assert.equal(formatProgramTime({ time: '18:00' }), '18:00 Uhr');
    assert.equal(formatProgramTime({ time: '18:00', durationMinutes: 30 }), '18:00–18:30 Uhr');
    assert.equal(formatProgramTime({ time: '23:45', durationMinutes: 60 }), '23:45–00:45 Uhr (+1 Tag)');
    assert.equal(formatProgramTime({ time: '18:00', durationMinutes: 1440 }), '18:00–18:00 Uhr (+1 Tag)');
});
