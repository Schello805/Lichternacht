import { parseEventWindowConfig } from './utils.js?v=1.4.304';

const berlin = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function berlinInstant(dateKey, minutes) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const target = Date.UTC(year, month - 1, day, 0, minutes);
    let instant = target;
    for (let attempt = 0; attempt < 4; attempt++) {
        const parts = Object.fromEntries(berlin.formatToParts(instant).map(part => [part.type, part.value]));
        const rendered = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
        if (rendered === target) return instant;
        instant += target - rendered;
    }
    return null;
}

export function getCalendarEventWindow(value) {
    const raw = String(value || '').trim();
    const config = parseEventWindowConfig(raw);
    if (!config) return null;
    const allDay = !/\s/.test(raw);
    if (!allDay && !/^\S+\s+(?:[01]?\d|2[0-3]):[0-5]\d\s*-\s*(?:[01]?\d|2[0-3]):[0-5]\d$/.test(raw)) return null;
    const start = berlinInstant(config.dateKey, config.startMin);
    const endMinutes = allDay ? 1440 : config.endMin + (config.endMin < config.startMin ? 1440 : 0);
    const end = berlinInstant(config.dateKey, endMinutes);
    if (start === null || end === null || end <= start) return null;
    const [year, month, day] = config.dateKey.split('-').map(Number);
    const endDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    return { start, end, dateKey: config.dateKey, endDate, allDay, cutoff: start - 3600000 };
}

export function canDownloadEventCalendar(value, now = Date.now()) {
    const event = getCalendarEventWindow(value);
    return Boolean(event && Number(now) < event.cutoff);
}

function escapeText(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function foldLine(value) {
    const encoder = new TextEncoder();
    let result = '', length = 0;
    for (const character of value) {
        const bytes = encoder.encode(character).length;
        if (length + bytes > 75) { result += '\r\n '; length = 1; }
        result += character;
        length += bytes;
    }
    return result;
}

export function buildEventCalendar(value, title = 'Lichternacht Bechhofen', now = Date.now()) {
    const event = getCalendarEventWindow(value);
    if (!event || !canDownloadEventCalendar(value, now)) return null;
    const stamp = instant => new Date(instant).toISOString().replace(/[-:]|\.\d{3}/g, '');
    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lichternacht Bechhofen//Kalender//DE',
        'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
        `UID:lichternacht-${event.dateKey}@lichternacht-bechhofen.de`,
        `DTSTAMP:${stamp(now)}`, `SUMMARY:${escapeText(title)}`, 'LOCATION:Bechhofen',
        'DESCRIPTION:Lichternacht in Bechhofen. Programm und Stationen: https://lichternacht-bechhofen.de/',
        'URL:https://lichternacht-bechhofen.de/',
        event.allDay ? `DTSTART;VALUE=DATE:${event.dateKey.replaceAll('-', '')}` : `DTSTART:${stamp(event.start)}`,
        event.allDay ? `DTEND;VALUE=DATE:${event.endDate.replaceAll('-', '')}` : `DTEND:${stamp(event.end)}`,
        'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.map(foldLine).join('\r\n') + '\r\n';
}
