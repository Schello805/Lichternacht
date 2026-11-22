import { isStationCancelled } from './station-status.js?v=1.4.342';
import { getStationNumber, compareStationNumbers } from './station-number.js?v=1.4.342';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const number = value => Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 });
const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const berlin = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const DIAGNOSTIC_LABELS = {
    attempt: 'Versuch gestartet', gps_missing: 'GPS fehlt', gps_stale: 'GPS veraltet', gps_inaccurate: 'GPS zu ungenau',
    gps_ready: 'GPS im Check-in nutzbar', station_detected: 'Station im Radius', outside_window: 'Außerhalb des Zeitfensters',
    too_far: 'Zu weit entfernt', cancelled: 'Station abgesagt', local_saved: 'Lokal gespeichert',
    synced: 'Server bestätigt', sync_retry: 'Übertragung ausstehend', sync_rejected: 'Server hat abgelehnt'
};

function recordTime(record) {
    const parsed = Date.parse(record.checkedAt || record.createdAt || '');
    if (Number.isFinite(parsed)) {
        const parts = Object.fromEntries(berlin.formatToParts(parsed).map(part => [part.type, part.value]));
        return { timestamp: parsed, date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
    }
    return { timestamp: null, date: /^\d{4}-\d{2}-\d{2}$/.test(record.dateKey || '') ? record.dateKey : null, hour: Number.isInteger(record.hour) && record.hour >= 0 && record.hour <= 23 ? record.hour : null, minute: 0 };
}

export function formatSample(checked, visits) {
    if (!visits) return 'Keine erfassten Besuche';
    return `${checked} von ${visits}${visits < 10 ? ' · geringe Datenbasis' : ` · ${number(100 * checked / visits)} %`}`;
}

export function buildUsageSummary(stations, checkins = [], activity = [], diagnostics = [], options = {}) {
    const available = (stations || []).filter(station => !isStationCancelled(station));
    const lookup = new Map(available.map(station => [String(station.id), station]));
    const rows = new Map(available.map(station => [String(station.id), { stationId: String(station.id), stationNumber: getStationNumber(station), stationName: station.name || `Station ${getStationNumber(station)}`, count: 0, devices: new Set(), first: '', last: '', visits: 0, checkedInVisits: 0, checkinPercent: null }]));
    const devices = new Set();
    const seen = new Set();
    const medalDevices = { bronze: new Set(), silver: new Set(), gold: new Set(), diamond: new Set() };
    const hours = new Map();
    const dates = new Map();
    const buckets = new Map();
    let excludedCheckins = 0, duplicateCheckins = 0, unknownDevices = 0, unknownTimes = 0, includedCheckins = 0, invalidActivity = 0;
    for (const record of checkins) {
        const row = rows.get(String(record.stationId));
        const time = recordTime(record);
        const dateAt = timestamp => berlin.format(timestamp).slice(0, 10);
        const outside = options.startMs != null && (time.timestamp != null
            ? time.timestamp < options.startMs || time.timestamp > options.endMs
            : time.date && (time.date < dateAt(options.startMs) || time.date > dateAt(options.endMs)));
        if (!row || outside) { excludedCheckins++; continue; }
        const device = record.ownerUid || record.anonymousId || '';
        const identity = device ? JSON.stringify([device, row.stationId, options.eventKey || time.date || 'unknown']) : null;
        if (identity && seen.has(identity)) { duplicateCheckins++; continue; }
        if (identity) seen.add(identity);
        row.count++; includedCheckins++;
        if (device) { devices.add(device); row.devices.add(device); } else unknownDevices++;
        if (record.checkedAt && (!row.first || record.checkedAt < row.first)) row.first = record.checkedAt;
        if (record.checkedAt && (!row.last || record.checkedAt > row.last)) row.last = record.checkedAt;
        if (device && Object.hasOwn(medalDevices, record.reachedLevel)) medalDevices[record.reachedLevel].add(device);
        const hour = time.hour == null ? 'unbekannt' : `${String(time.hour).padStart(2, '0')}:00`;
        hours.set(hour, (hours.get(hour) || 0) + 1);
        dates.set(time.date || 'unbekannt', (dates.get(time.date || 'unbekannt') || 0) + 1);
        if (time.timestamp == null || time.hour == null || !time.date) { unknownTimes++; continue; }
        const minute = time.hour * 60 + (time.minute >= 30 ? 30 : 0);
        const key = `${time.date}:${minute}`;
        buckets.set(key, { date: time.date, minute, count: (buckets.get(key)?.count || 0) + 1 });
    }
    for (const record of activity) {
        const row = rows.get(String(record.stationId));
        if (!row) continue;
        const visits = count(record.visits), checked = count(record.checkedIn);
        if (checked > visits || !Number.isFinite(Number(record.visits)) || !Number.isFinite(Number(record.checkedIn ?? 0)) || Number(record.visits) < 0 || Number(record.checkedIn) < 0) invalidActivity++;
        row.visits += visits;
        row.checkedInVisits += Math.min(visits, checked);
    }
    const stationRows = [...rows.values()].map(row => ({ ...row, devices: undefined, uniqueVisitors: row.devices.size, checkinPercent: row.visits ? Math.round(row.checkedInVisits / row.visits * 1000) / 10 : null })).sort((first, second) => compareStationNumbers({ id: first.stationId, number: first.stationNumber }, { id: second.stationId, number: second.stationNumber }));
    const timelineRows = [];
    for (const date of [...new Set([...buckets.values()].map(bucket => bucket.date))].sort()) {
        const day = [...buckets.values()].filter(bucket => bucket.date === date);
        const minimum = Math.min(...day.map(bucket => bucket.minute)), maximum = Math.max(...day.map(bucket => bucket.minute));
        for (let minute = minimum; minute <= maximum; minute += 30) timelineRows.push({ date, time: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, count: buckets.get(`${date}:${minute}`)?.count || 0 });
    }
    const diagnosticsInScope = diagnostics.filter(record => lookup.has(String(record.stationId)) && (!options.eventKey || record.eventKey === options.eventKey));
    const diagnosticStages = Object.fromEntries(Object.keys(DIAGNOSTIC_LABELS).map(stage => [stage, 0]));
    const diagnosticOutcomes = {};
    for (const record of diagnosticsInScope) {
        for (const stage of new Set(Array.isArray(record.stages) ? record.stages : [record.stage])) if (Object.hasOwn(diagnosticStages, stage)) diagnosticStages[stage]++;
        if (Object.hasOwn(DIAGNOSTIC_LABELS, record.stage)) diagnosticOutcomes[record.stage] = (diagnosticOutcomes[record.stage] || 0) + 1;
    }
    const stationsWithoutCheckins = stationRows.filter(row => !row.count).map(({ stationId, stationNumber, stationName }) => ({ stationId, stationNumber, stationName }));
    const visits = stationRows.reduce((sum, row) => sum + row.visits, 0), checked = stationRows.reduce((sum, row) => sum + row.checkedInVisits, 0);
    const lessons = [
        `${devices.size} Geräte haben Check-ins erfasst. Das ist weder die gesamte App-Nutzung noch die Besucherzahl der Veranstaltung.`,
        `${stationRows.filter(row => row.count > 0).length} von ${available.length} teilnehmenden Stationen haben Check-ins. Abgesagte Stationen sind ausgeschlossen.`,
        `${stationsWithoutCheckins.length} Stationen ohne Check-in: Daraus lässt sich keine Aussage über Attraktivität, tatsächlichen Besuch oder Beschilderung ableiten.`,
        'Freiwillige Standorterfassung und sämtliche Check-ins sind getrennte Datengruppen. Fehlende Standortsignale können durch Nichtteilnahme, GPS oder Zuordnung entstehen.',
        'Quoten unter zehn erfassten Browser-Stationsbesuchen werden nur als Bruch gezeigt. Auch größere freiwillige Stichproben sind nicht repräsentativ.'
    ];
    if (unknownDevices) lessons.push(`${unknownDevices} Check-ins haben keine Gerätezuordnung; sie fließen nicht in Gerätemittelwert oder Medaillenzählung ein.`);
    return {
        generatedAt: new Date().toISOString(), scopeLabel: options.scopeLabel || 'Geladener Datenbestand',
        totalCheckins: includedCheckins, uniqueVisitors: devices.size, totalStations: available.length,
        stationsWithCheckins: stationRows.filter(row => row.count > 0).length,
        averageCheckins: devices.size ? (includedCheckins - unknownDevices) / devices.size : null,
        stationRows, timelineRows, hourlyRows: [...hours].map(([hour, count]) => ({ hour, count })).sort((first, second) => first.hour.localeCompare(second.hour)),
        dateRows: [...dates].map(([date, count]) => ({ date, count })), stationsWithoutCheckins,
        levels: Object.fromEntries(Object.entries(medalDevices).map(([level, values]) => [level, values.size])),
        cohort: { visits, checkedIn: checked, percent: visits ? checked / visits * 100 : null, available: options.activityAvailable !== false },
        diagnostics: { attempts: diagnosticsInScope.length, stages: diagnosticStages, outcomes: diagnosticOutcomes, available: options.diagnosticsAvailable !== false },
        quality: { excludedCheckins, duplicateCheckins, unknownDevices, unknownTimes, invalidActivity }, lessons
    };
}

export function stationSummaryLine(row, activityAvailable = true) {
    return `#${row.stationNumber ?? row.stationId} ${row.stationName}: ${row.count} Check-ins (${row.uniqueVisitors} Geräte); freiwillige Standorterfassung: ${activityAvailable ? formatSample(row.checkedInVisits, row.visits) : 'Quelle nicht verfügbar'}`;
}

export function usageSummaryToText(summary) {
    return [
        'Lichternacht – Nutzungsanalyse', `Zeitraum: ${summary.scopeLabel}`, `Erstellt: ${new Date(summary.generatedAt).toLocaleString('de-DE')}`,
        '', `Bestätigte Check-ins: ${summary.totalCheckins}`, `Geräte mit Check-in: ${summary.uniqueVisitors} (keine Besucherzählung)`,
        `Stationen mit Check-ins: ${summary.stationsWithCheckins}/${summary.totalStations}`, `Ø zugeordnete Check-ins pro Gerät: ${summary.averageCheckins == null ? '–' : number(summary.averageCheckins)}`,
        `Medaillenmeldungen (je Gerät/Stufe): Bronze ${summary.levels.bronze}, Silber ${summary.levels.silver}, Gold ${summary.levels.gold}, Diamant ${summary.levels.diamond}`,
        '', 'Freiwillige Standorterfassung – getrennte Datengruppe', summary.cohort.available ? `${summary.cohort.visits} Browser-Stationsbesuche; davon eingecheckt: ${formatSample(summary.cohort.checkedIn, summary.cohort.visits)}` : 'Quelle derzeit nicht verfügbar.',
        'Ein Browser kann an mehreren Stationen vorkommen; keine Anzahl unterschiedlicher Personen. Nicht mit allen Check-ins verrechnen.',
        '', 'Check-ins in 30-Minuten-Blöcken (Europe/Berlin)', ...summary.timelineRows.map(row => `${row.date} ${row.time}: ${row.count}`),
        '', 'Stationen – vollständige Tabelle im CSV-Export', ...summary.stationRows.map(row => stationSummaryLine(row, summary.cohort.available)),
        '', 'Freiwillige Check-in-Diagnose', summary.diagnostics.available ? `${summary.diagnostics.attempts} erfasste Versuche; nur Daten ab Aktivierung, keine rückwirkende Diagnose.` : 'Diagnosequelle derzeit nicht verfügbar.',
        ...Object.entries(summary.diagnostics.outcomes).map(([stage, amount]) => `${DIAGNOSTIC_LABELS[stage]}: ${amount}`),
        'Diagnosen betreffen nur freiwillig erfasste Versuche; kein Funnel aller App-Nutzer.',
        '', 'Einordnung', ...summary.lessons.map(lesson => `- ${lesson}`),
        `Datenprüfung: ${summary.quality.excludedCheckins} ausgeschlossen, ${summary.quality.duplicateCheckins} Duplikate, ${summary.quality.unknownTimes} ohne auswertbare Uhrzeit.`,
        'Keine Namen, Kontaktdaten oder GPS-Koordinaten in dieser Auswertung.'
    ].join('\n');
}

export function renderUsageDashboard(summary) {
    const coverage = summary.totalStations ? Math.round(summary.stationsWithCheckins / summary.totalStations * 100) : 0;
    const card = (label, value, detail) => `<article class="usage-kpi"><div class="usage-label">${escapeHtml(label)}</div><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p></article>`;
    const maximum = Math.max(1, ...summary.timelineRows.map(row => row.count));
    const chart = summary.timelineRows.map(row => `<div class="usage-chart-row" role="listitem"><span>${escapeHtml(row.date.slice(5).split('-').reverse().join('.'))} · ${escapeHtml(row.time)}</span><div class="usage-track" aria-hidden="true"><span style="width:${row.count / maximum * 100}%"></span></div><b>${row.count}</b></div>`).join('');
    const rows = summary.stationRows.map(row => `<tr data-usage-station data-search="${escapeHtml(`${row.stationNumber} ${row.stationName}`.toLocaleLowerCase('de'))}"><th scope="row">#${escapeHtml(row.stationNumber)} ${escapeHtml(row.stationName)}</th><td>${row.count}</td><td>${row.uniqueVisitors}</td><td>${summary.cohort.available ? escapeHtml(formatSample(row.checkedInVisits, row.visits)) : 'Quelle fehlt'}</td></tr>`).join('');
    const stages = ['attempt', 'gps_ready', 'station_detected', 'local_saved', 'synced'];
    const flow = stages.map(stage => `<li><span>${escapeHtml(DIAGNOSTIC_LABELS[stage])}</span><b>${summary.diagnostics.stages[stage]}</b></li>`).join('');
    const outcomes = Object.entries(summary.diagnostics.outcomes).map(([stage, amount]) => `<li><span>${escapeHtml(DIAGNOSTIC_LABELS[stage])}</span><b>${amount}</b></li>`).join('');
    return `<div class="usage-dashboard" data-usage-dashboard>
        <header class="usage-heading"><div><p class="usage-label">Veranstaltungsrückblick</p><h3>Nutzung im Überblick</h3><p>${escapeHtml(summary.scopeLabel)} · Stand ${escapeHtml(new Date(summary.generatedAt).toLocaleString('de-DE'))}</p></div><span class="usage-badge">Ohne abgesagte Stationen</span></header>
        <div class="usage-kpis">${card('Bestätigte Check-ins', summary.totalCheckins, 'Serverseitig erfasste Besuche')}${card('Geräte mit Check-in', summary.uniqueVisitors, 'Nicht alle App-Nutzer oder Personen')}${card('Stationsabdeckung', `${summary.stationsWithCheckins}/${summary.totalStations}`, `${coverage} % der teilnehmenden Stationen`)}${card('Ø pro Gerät', summary.averageCheckins == null ? '–' : number(summary.averageCheckins), 'Nur Check-ins mit Gerätezuordnung')}</div>
        <section class="usage-panel"><h4>Check-ins im Zeitverlauf</h4><p>30-Minuten-Blöcke · Europe/Berlin · ${summary.quality.unknownTimes} ohne auswertbare Zeit</p><div class="usage-chart" role="list" aria-label="Check-ins pro halber Stunde">${chart || '<p>Noch keine zeitlich zuordenbaren Check-ins.</p>'}</div></section>
        <div class="usage-columns"><section class="usage-panel"><span class="usage-badge">Freiwillige Standorterfassung</span><h4>Besuche und Check-ins</h4><strong class="usage-cohort-value">${summary.cohort.available ? escapeHtml(formatSample(summary.cohort.checkedIn, summary.cohort.visits)) : 'Quelle nicht verfügbar'}</strong><p>Browser-Stationsbesuche dieser Datengruppe mit Check-in. Ein Browser kann an mehreren Stationen vorkommen.</p><p>Nicht mit den ${summary.totalCheckins} gesamten Check-ins oder der Anzahl anwesender Personen gleichsetzen.</p></section>
        <section class="usage-panel"><h4>Medaillenmeldungen</h4><p>Je Gerät und übermittelter Stufe höchstens einmal; historische Meldungen, keine Neuberechnung von Preisansprüchen.</p><div class="usage-medals">🥉 ${summary.levels.bronze} · 🥈 ${summary.levels.silver} · 🥇 ${summary.levels.gold} · 💎 ${summary.levels.diamond}</div></section></div>
        <section class="usage-panel"><h4>Wo hakt der Check-in?</h4><p>Nur freiwillig diagnostizierte Versuche, nicht alle App-Nutzer. Diese Daten entstehen erst ab dem Update; für frühere Besuche lassen sich keine Fehlergründe rekonstruieren.</p>${!summary.diagnostics.available ? '<p>Diagnosequelle derzeit nicht verfügbar.</p>' : !summary.diagnostics.attempts ? '<p class="usage-empty">Noch keine freiwilligen Diagnosedaten vorhanden.</p>' : `<div class="usage-columns"><div><h5>Beobachtete Schritte</h5><ul class="usage-flow">${flow}</ul><p>Ein Versuch kann mehrere Schritte durchlaufen.</p></div><div><h5>Letzter Status je Versuch</h5><ul class="usage-flow">${outcomes}</ul></div></div>`}</section>
        <details class="usage-panel" ${summary.stationRows.length <= 12 ? 'open' : ''}><summary>Alle ${summary.totalStations} teilnehmenden Stationen</summary><label class="usage-search">Station suchen<input type="search" data-usage-search placeholder="Name oder Nummer"></label><p class="usage-table-hint">↔ Für alle Spalten seitlich wischen.</p><div class="usage-table-wrap"><table><thead><tr><th>Station</th><th>Check-ins</th><th>Geräte</th><th>Freiwillige Standorterfassung: eingecheckt / erfasst</th></tr></thead><tbody>${rows}</tbody></table></div><p data-usage-search-empty hidden>Keine passende Station.</p><p>Nach Stationsnummer, nicht als Rangliste. Unter zehn erfassten Besuchen nur Bruch statt Prozentzahl. Null Check-ins bedeutet nicht null Besucher.</p></details>
        <section class="usage-panel"><h4>Was wir daraus ableiten können</h4><ul class="usage-lessons">${summary.lessons.map(lesson => `<li>${escapeHtml(lesson)}</li>`).join('')}</ul><p>Datenprüfung: ${summary.quality.excludedCheckins} ausgeschlossen · ${summary.quality.duplicateCheckins} Duplikate · ${summary.quality.invalidActivity} widersprüchliche Standort-Datensätze. Rohdaten bleiben erhalten.</p></section>
    </div>`;
}
