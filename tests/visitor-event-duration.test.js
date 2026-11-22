import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { getExplicitProgramPhase } from '../js/event-duration.js';

const source = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const visitorFunctions = source.slice(source.indexOf('function parseTimeToMinutes('), source.indexOf('function hideVisitorStartCard('));
const eventWindow = { dateKey: '2026-11-21' };

function selectVisitorEvent(events, now, windowConfig = eventWindow) {
    class FixedDate extends Date {
        constructor(...values) {
            super(...(values.length ? values : [now.getTime()]));
        }
    }
    const context = vm.createContext({ state: { events }, Date: FixedDate, getExplicitProgramPhase });
    vm.runInContext(visitorFunctions, context);
    return context.getNextVisitorEvent(windowConfig);
}

test('visitor card prefers a live explicit duration over the next start', () => {
    const live = { id: 'live', time: '18:00', durationMinutes: 60 };
    const next = { id: 'next', time: '18:30' };
    const finished = { id: 'finished', time: '17:00', durationMinutes: 10 };
    assert.equal(selectVisitorEvent([next, finished, live], new Date(2026, 10, 21, 18, 20)), live);
    assert.equal(selectVisitorEvent([live, next], new Date(2026, 10, 21, 18)), live);
    assert.equal(selectVisitorEvent([{ ...live, durationMinutes: 1440 }, next], new Date(2026, 10, 22, 17, 59)).id, 'live');
});

test('visitor card excludes finished explicit durations at the exact end boundary', () => {
    const finished = { id: 'finished', time: '18:00', durationMinutes: 15 };
    const next = { id: 'next', time: '18:30' };
    assert.equal(selectVisitorEvent([finished, next], new Date(2026, 10, 21, 18, 15)), next);
    assert.equal(selectVisitorEvent([finished], new Date(2026, 10, 21, 18, 15)), null);
    assert.equal(selectVisitorEvent([{ time: '18:00', durationMinutes: 1440 }], new Date(2026, 10, 22, 18)), null);
});

test('visitor card includes live explicit durations on the following calendar day only until their end', () => {
    const live = { id: 'overnight', time: '23:45', durationMinutes: 60 };
    const legacy = { id: 'legacy', time: '23:50' };
    assert.equal(selectVisitorEvent([legacy, live], new Date(2026, 10, 22, 0, 15)), live);
    assert.equal(selectVisitorEvent([legacy, live], new Date(2026, 10, 22, 0, 45)), null);
    assert.equal(selectVisitorEvent([legacy, live], new Date(2026, 10, 23, 0, 15)), null);
});

test('visitor card retains legacy selection and does not advertise other dates or missing configuration', () => {
    const past = { id: 'past', time: '18:00' };
    const next = { id: 'next', time: '18:30' };
    const later = { id: 'later', time: '19:00', durationMinutes: 30 };
    const events = [later, next, past];
    assert.equal(selectVisitorEvent(events, new Date(2026, 10, 21, 18, 20)), next);
    assert.equal(selectVisitorEvent(events, new Date(2026, 10, 21, 18, 30)), next);
    assert.equal(selectVisitorEvent(events, new Date(2026, 10, 20, 18, 20)), null);
    assert.equal(selectVisitorEvent(events, new Date(2026, 10, 22, 18, 20)), null);
    assert.equal(selectVisitorEvent(events, new Date(2026, 10, 21, 18, 20), null), null);
    assert.equal(selectVisitorEvent([], new Date(2026, 10, 21, 18, 20)), null);
    assert.equal(selectVisitorEvent([{ time: 'invalid', durationMinutes: 60 }], new Date(2026, 10, 21, 18, 20)), null);
});
