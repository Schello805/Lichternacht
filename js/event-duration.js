export function parseEventDurationMinutes(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const minutes = Number(value);
    return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : null;
}

export function isValidEventDurationMinutes(value) {
    return value === undefined || value === null || (typeof value === 'string' && !value.trim())
        || parseEventDurationMinutes(value) !== null;
}

export function getProgramLiveEndMinutes(event, events = []) {
    const [hour, minute] = String(event.time || '00:00').split(':').map(Number);
    const start = (Number(hour) || 0) * 60 + (Number(minute) || 0);
    const duration = parseEventDurationMinutes(event.durationMinutes);
    if (duration !== null) return { end: start + duration, inclusive: false };
    const nextSlot = events.reduce((next, item) => {
        const [nextHour, nextMinute] = String(item.time || '').split(':').map(Number);
        const nextStart = nextHour * 60 + nextMinute;
        return nextStart > start ? Math.min(next, nextStart) : next;
    }, Infinity);
    return Number.isFinite(nextSlot) ? { end: nextSlot, inclusive: false } : { end: start + 45, inclusive: true };
}

export function getExplicitProgramPhase(event, dateKey, now) {
    const duration = parseEventDurationMinutes(event.durationMinutes);
    if (duration === null || !dateKey || !(now instanceof Date)) return null;
    const [year, month, day] = dateKey.split('-').map(Number);
    const [hour, minute] = String(event.time).split(':').map(Number);
    const start = new Date(year, month - 1, day, hour, minute).getTime();
    const elapsed = now.getTime() - start;
    if (!Number.isFinite(elapsed) || elapsed < 0) return null;
    return elapsed < duration * 60000 ? 'live' : 'past';
}

export function formatProgramTime(event) {
    const duration = parseEventDurationMinutes(event.durationMinutes);
    if (duration === null) return `${event.time} Uhr`;
    const [hour, minute] = String(event.time).split(':').map(Number);
    const end = hour * 60 + minute + duration;
    const endTime = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
    return `${event.time}–${endTime} Uhr${end >= 1440 ? ' (+1 Tag)' : ''}`;
}
