import * as utils from './utils.js?v=1.4.190';

function eventWindowDate(dateKey, minutes, addDay = false) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (![year, month, day, minutes].every(Number.isFinite)) return null;
    const date = new Date(year, month - 1, day + (addDay ? 1 : 0), Math.floor(minutes / 60), minutes % 60, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatRemainingTime(milliseconds) {
    const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (totalMinutes > 2880) return `Noch ${Math.ceil(totalMinutes / 1440)} Tage bis zur Lichternacht`;
    if (days > 0) return `Noch ${days} Tag${days === 1 ? '' : 'e'} · ${hours} Std.`;
    if (hours > 0) return `Start in ${hours} Std. · ${minutes} Min.`;
    return `Start in ${Math.max(1, minutes)} Min.`;
}

export function updateHeaderCountdown(now = new Date()) {
    const element = document.getElementById('app-countdown');
    if (!element) return;
    const eventWindow = utils.getConfiguredEventWindow?.();
    if (!eventWindow?.dateKey) {
        element.classList.add('hidden');
        element.textContent = '';
        return;
    }

    const start = eventWindowDate(eventWindow.dateKey, eventWindow.startMin);
    const crossesMidnight = eventWindow.endMin < eventWindow.startMin;
    const end = eventWindowDate(eventWindow.dateKey, eventWindow.endMin, crossesMidnight);
    if (!start || !end) return;

    if (now < start) {
        element.textContent = formatRemainingTime(start.getTime() - now.getTime());
    } else if (now <= end) {
        element.textContent = `● Lichternacht läuft · bis ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')} Uhr`;
    } else {
        element.textContent = 'Lichternacht beendet · Danke fürs Mitmachen!';
    }
    element.classList.remove('hidden');
}
