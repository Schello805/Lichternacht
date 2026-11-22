import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUsageSummary, formatSample, renderUsageDashboard, usageSummaryToText } from '../js/usage-analytics.js';
import { buildUsageSummaryEmailHtml } from '../js/email.js';

const stations = [{ id: 1, number: '1A', name: 'Museum' }, { id: 2, name: 'Kirche' }, { id: 3, name: 'Abgesagt', cancelled: true }];

test('analysis separates all checkins from the opt-in cohort and excludes cancellations', () => {
    const records = Array.from({ length: 105 }, (_, index) => ({ stationId: '1', ownerUid: `browser-${index}`, checkedAt: '2026-11-21T16:10:00Z' }));
    records.push({ stationId: '3', ownerUid: 'cancelled' });
    const summary = buildUsageSummary(stations, records, [{ stationId: '1', visits: 41, checkedIn: 16 }, { stationId: '3', visits: 500, checkedIn: 100 }]);
    assert.equal(summary.totalCheckins, 105);
    assert.equal(summary.cohort.visits, 41);
    assert.equal(summary.cohort.checkedIn, 16);
    assert.equal(summary.cohort.percent.toFixed(1), '39.0');
    assert.equal(summary.stationsWithCheckins, 1);
    assert.equal(summary.totalStations, 2);
    assert.equal(summary.quality.excludedCheckins, 1);
    assert.equal(records.length, 106);
});

test('small samples use fractions; unavailable data never pretends to be a zero sample', () => {
    assert.equal(formatSample(1, 2), '1 von 2 · geringe Datenbasis');
    assert.equal(formatSample(0, 0), 'Keine erfassten Besuche');
    assert.equal(formatSample(2, 10), '2 von 10 · 20 %');
    const summary = buildUsageSummary(stations, [], [], [], { activityAvailable: false, diagnosticsAvailable: false });
    assert.match(renderUsageDashboard(summary), /Quelle nicht verfügbar/);
    assert.match(usageSummaryToText(summary), /Standorterfassung: Quelle nicht verfügbar/);
    assert.doesNotMatch(usageSummaryToText(summary), /Standorterfassung: Keine erfassten Besuche/);
});

test('station table follows official numbering rather than ranking small samples', () => {
    const summary = buildUsageSummary([{ id: 1, number: '1A' }, { id: 2, number: 10 }, { id: 3, number: 2 }], [{ stationId: '2', ownerUid: 'one' }]);
    assert.deepEqual(summary.stationRows.map(row => row.stationNumber), ['1A', 2, 10]);
});

test('deduplication, missing identities and medals do not inflate device averages', () => {
    const summary = buildUsageSummary(stations, [
        { stationId: '1', ownerUid: 'same', reachedLevel: 'bronze' },
        { stationId: '1', ownerUid: 'same', reachedLevel: 'bronze' },
        { stationId: '2', ownerUid: 'same', reachedLevel: 'bronze' },
        { stationId: '2', reachedLevel: 'gold' }
    ]);
    assert.equal(summary.totalCheckins, 3);
    assert.equal(summary.uniqueVisitors, 1);
    assert.equal(summary.averageCheckins, 2);
    assert.equal(summary.levels.bronze, 1);
    assert.equal(summary.levels.gold, 0);
    assert.equal(summary.quality.duplicateCheckins, 1);
    assert.equal(summary.quality.unknownDevices, 1);
});

test('Berlin half-hour chart fills gaps and does not invent times for legacy records', () => {
    const summary = buildUsageSummary(stations, [
        { stationId: '1', ownerUid: 'one', checkedAt: '2026-11-21T16:10:00Z' },
        { stationId: '1', ownerUid: 'two', checkedAt: '2026-11-21T17:10:00Z' },
        { stationId: '2', ownerUid: 'legacy', dateKey: '2026-11-21', hour: 18 }
    ]);
    assert.deepEqual(summary.timelineRows, [
        { date: '2026-11-21', time: '17:00', count: 1 },
        { date: '2026-11-21', time: '17:30', count: 0 },
        { date: '2026-11-21', time: '18:00', count: 1 }
    ]);
    assert.equal(summary.quality.unknownTimes, 1);
});

test('event scope rejects other dates, diagnostics and stations without checkins do not inflate coverage', () => {
    const summary = buildUsageSummary(stations, [
        { stationId: '1', ownerUid: 'current', checkedAt: '2026-11-21T17:00:00Z' },
        { stationId: '1', ownerUid: 'old', checkedAt: '2025-11-21T17:00:00Z' },
        { stationId: '2', ownerUid: 'legacy-old', dateKey: '2025-11-21' }
    ], [{ stationId: '2', visits: 2, checkedIn: 1 }], [
        { stationId: '1', eventKey: 'current', stages: ['attempt', 'gps_missing', 'gps_ready'], stage: 'gps_ready' },
        { stationId: '3', eventKey: 'current', stages: ['attempt'], stage: 'attempt' },
        { stationId: '1', eventKey: 'old', stages: ['attempt'], stage: 'attempt' }
    ], { startMs: Date.parse('2026-11-21T15:00:00Z'), endMs: Date.parse('2026-11-21T23:00:00Z'), eventKey: 'current' });
    assert.equal(summary.totalCheckins, 1);
    assert.equal(summary.stationsWithCheckins, 1);
    assert.equal(summary.diagnostics.attempts, 1);
    assert.equal(summary.diagnostics.stages.gps_missing, 1);
    assert.equal(summary.diagnostics.stages.gps_ready, 1);
    assert.deepEqual(summary.diagnostics.outcomes, { gps_ready: 1 });
});

test('invalid activity counts are flagged and cannot produce rates over 100 percent', () => {
    const summary = buildUsageSummary(stations, [], [{ stationId: '1', visits: 2, checkedIn: 20 }, { stationId: '2', visits: -1, checkedIn: 0 }]);
    assert.equal(summary.quality.invalidActivity, 2);
    assert.equal(summary.cohort.percent, 100);
});

test('dashboard and email escape station data and contain only one station report', () => {
    const summary = buildUsageSummary([{ id: 1, name: '<img src=x onerror=alert(1)>' }], [{ stationId: '1', ownerUid: 'browser' }]);
    const html = renderUsageDashboard(summary);
    const email = buildUsageSummaryEmailHtml(summary);
    assert.doesNotMatch(html + email, /<img src=x/);
    assert.match(html + email, /&lt;img/);
    assert.equal((email.match(/&lt;img/g) || []).length, 1);
    assert.match(email, /1\/1/);
    assert.match(html, /keine Fehlergründe rekonstruieren/);
    assert.match(usageSummaryToText(summary), /keine rückwirkende Diagnose/);
});
