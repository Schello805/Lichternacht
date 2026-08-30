import { state } from './state.js';

const VISITED_KEY = 'visited_stations';
const VISITED_LOG_KEY = 'visited_station_log';

function stationKey(id) {
    return String(id);
}

export function formatDateTimeDe(value) {
    if (!value) return 'Zeitpunkt unbekannt';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Zeitpunkt unbekannt';
    return d.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function readLegacyVisitedIds() {
    try {
        const saved = localStorage.getItem(VISITED_KEY);
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.map(stationKey) : [];
    } catch (e) {
        return [];
    }
}

function readVisitedLog() {
    try {
        const saved = localStorage.getItem(VISITED_LOG_KEY);
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(item => item && item.id !== undefined && item.id !== null)
            .map(item => ({
                id: stationKey(item.id),
                checkedAt: item.checkedAt || null
            }));
    } catch (e) {
        return [];
    }
}

function writeVisitedRecords(records) {
    const normalized = records
        .filter(item => item && item.id !== undefined && item.id !== null)
        .map(item => ({
            id: stationKey(item.id),
            checkedAt: item.checkedAt || null
        }));
    localStorage.setItem(VISITED_LOG_KEY, JSON.stringify(normalized));
    localStorage.setItem(VISITED_KEY, JSON.stringify(normalized.map(item => item.id)));
}

export function getVisitedStationRecords(stations = state.stations) {
    const byId = new Map();
    readVisitedLog().forEach(item => byId.set(stationKey(item.id), item));
    readLegacyVisitedIds().forEach(id => {
        if (!byId.has(stationKey(id))) {
            byId.set(stationKey(id), { id: stationKey(id), checkedAt: null });
        }
    });

    const stationIndex = new Map();
    if (Array.isArray(stations)) {
        stations.forEach((station, index) => {
            stationIndex.set(stationKey(station.id), { station, index });
        });
    }

    return [...byId.values()]
        .map(item => {
            const entry = stationIndex.get(stationKey(item.id));
            return {
                id: stationKey(item.id),
                checkedAt: item.checkedAt || null,
                checkedAtLabel: formatDateTimeDe(item.checkedAt),
                station: entry?.station || null,
                stationName: entry?.station?.name || `Station ${item.id}`,
                stationNumber: entry?.station?.id ?? item.id,
                order: entry?.index ?? 99999
            };
        })
        .sort((a, b) => {
            if (a.checkedAt && b.checkedAt) return new Date(a.checkedAt) - new Date(b.checkedAt);
            if (a.checkedAt && !b.checkedAt) return 1;
            if (!a.checkedAt && b.checkedAt) return -1;
            return a.order - b.order;
        });
}

export function getVisitedStationIdSet() {
    return new Set(getVisitedStationRecords().map(item => stationKey(item.id)));
}

export function isStationVisited(id) {
    return getVisitedStationIdSet().has(stationKey(id));
}

export function markStationVisited(id, checkedAt = new Date().toISOString()) {
    const records = getVisitedStationRecords().map(item => ({
        id: stationKey(item.id),
        checkedAt: item.checkedAt || null
    }));
    const key = stationKey(id);
    const existing = records.find(item => stationKey(item.id) === key);
    if (existing) {
        if (!existing.checkedAt) existing.checkedAt = checkedAt;
    } else {
        records.push({ id: key, checkedAt });
    }
    writeVisitedRecords(records);
}

export function removeStationVisited(id) {
    const key = stationKey(id);
    const records = getVisitedStationRecords()
        .filter(item => stationKey(item.id) !== key)
        .map(item => ({ id: stationKey(item.id), checkedAt: item.checkedAt || null }));
    writeVisitedRecords(records);
}

export function toCsvValue(value) {
    const s = String(value ?? '');
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function parseEventDateKey(input) {
    const s = String(input || '').trim();
    if (!s) return null;

    // Allow "DATE ..." (e.g. "22.11.2026 17:00-23:00")
    const datePart = s.split(/\s+/)[0];

    // DD.MM.YYYY
    const de = datePart.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (de) {
        const day = String(de[1]).padStart(2, '0');
        const month = String(de[2]).padStart(2, '0');
        const year = de[3];
        return `${year}-${month}-${day}`;
    }

    // YYYYMMDD
    const compact = datePart.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) {
        return `${compact[1]}-${compact[2]}-${compact[3]}`;
    }

    // YYYY-MM-DD
    const iso = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    return null;
}

export function formatEventDateDe(dateKey) {
    const k = String(dateKey || '').trim();
    const m = k.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return `${m[3]}.${m[2]}.${m[1]}`;
}

function parseTimeToMinutes(input) {
    const s = String(input || '').trim();
    const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

export function parseEventWindowConfig(input) {
    const raw = String(input || '').trim();
    const dateKey = parseEventDateKey(raw);
    if (!dateKey) return null;

    // Defaults: full day
    let startMin = 0;
    let endMin = 24 * 60 - 1;

    // Allow optional time window after the date:
    // "DD.MM.YYYY 17:00-23:00" or "YYYYMMDD 17:00-23:00" or "YYYY-MM-DD 17:00-23:00"
    const parts = raw.split(/\s+/).slice(1);
    if (parts.length > 0) {
        const rest = parts.join(' ').trim();
        const windowMatch = rest.match(/^([0-2]?\d:[0-5]\d)\s*-\s*([0-2]?\d:[0-5]\d)$/);
        if (windowMatch) {
            const sMin = parseTimeToMinutes(windowMatch[1]);
            const eMin = parseTimeToMinutes(windowMatch[2]);
            if (sMin !== null && eMin !== null) {
                startMin = sMin;
                endMin = eMin;
            }
        }
    }

    return { dateKey, startMin, endMin };
}

export function formatEventWindowDe(windowConfig) {
    if (!windowConfig || !windowConfig.dateKey) return '';
    const date = formatEventDateDe(windowConfig.dateKey);
    const pad = (n) => String(n).padStart(2, '0');
    const sH = Math.floor(windowConfig.startMin / 60);
    const sM = windowConfig.startMin % 60;
    const eH = Math.floor(windowConfig.endMin / 60);
    const eM = windowConfig.endMin % 60;
    if (windowConfig.startMin === 0 && windowConfig.endMin === 24 * 60 - 1) return date;
    return `${date} ${pad(sH)}:${pad(sM)}–${pad(eH)}:${pad(eM)}`;
}

export function isWithinEventWindowNow(windowConfig, now = new Date()) {
    if (!windowConfig || !windowConfig.dateKey) return false;
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (todayKey !== windowConfig.dateKey) return false;
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const { startMin, endMin } = windowConfig;
    if (startMin <= endMin) {
        return currentMin >= startMin && currentMin <= endMin;
    }
    // Window crosses midnight (e.g. 18:00-01:00)
    return currentMin >= startMin || currentMin <= endMin;
}

export function getConfiguredEventDateKey() {
    const w = parseEventWindowConfig(state.downloads?.icsDate);
    return w ? w.dateKey : null;
}

export function getConfiguredEventWindow() {
    return parseEventWindowConfig(state.downloads?.icsDate);
}

export function formatPlanningCountdown(windowConfig, now = new Date()) {
    if (!windowConfig?.dateKey || !Number.isFinite(windowConfig.startMin)) return '';
    const [year, month, day] = windowConfig.dateKey.split('-').map(Number);
    const startHour = Math.floor(windowConfig.startMin / 60);
    const startMinute = windowConfig.startMin % 60;
    const start = new Date(year, month - 1, day, startHour, startMinute, 0, 0);
    const remainingMs = start.getTime() - now.getTime();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '';

    const totalMinutes = Math.floor(remainingMs / 60000);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `Noch ${days} ${days === 1 ? 'Tag' : 'Tage'}, ${hours} Std.`;
    if (hours > 0) return `Noch ${hours} Std., ${minutes} Min.`;
    return `Noch ${Math.max(1, minutes)} Min.`;
}

export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `p-4 mb-2 rounded shadow-lg text-white transition-opacity duration-300 ${
        type === 'success' ? 'bg-green-600' : 
        type === 'error' ? 'bg-red-600' : 
        'bg-blue-600'
    }`;
    toast.textContent = message;

    container.appendChild(toast);

    // Fade in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

export function vibrateFeedback(pattern = 20) {
    try {
        if (typeof navigator.vibrate !== 'function') return false;
        return navigator.vibrate(pattern);
    } catch (e) { }
    return false;
}

export function attachSwipeToDismiss(content, onDismiss, threshold = 70) {
    if (!content || typeof onDismiss !== 'function' || content.dataset.swipeReady === 'true') return;
    content.dataset.swipeReady = 'true';
    let startY = null;
    let startX = null;
    let dragging = false;
    const isInteractive = target => Boolean(target?.closest?.('button, a, input, textarea, select, label, [contenteditable="true"]'));

    const beginSwipe = (target, clientX, clientY) => {
        if (isInteractive(target) || content.scrollTop > 0) return;
        startY = clientY;
        startX = clientX;
        dragging = false;
        content.style.transition = 'none';
    };
    const moveSwipe = (clientX, clientY, event) => {
        if (startY == null) return;
        const distance = Math.max(0, clientY - startY);
        const horizontalDistance = Math.abs(clientX - startX);
        if (!dragging && (distance < 8 || horizontalDistance > distance)) return;
        dragging = true;
        if (event.cancelable) event.preventDefault();
        content.style.transform = `translateY(${distance}px)`;
    };
    const finishSwipe = clientY => {
        if (startY == null) return;
        const distance = Math.max(0, clientY - startY);
        startY = null;
        startX = null;
        content.style.transition = 'transform 180ms ease';
        if (dragging && distance >= threshold) {
            content.style.transform = 'translateY(100%)';
            setTimeout(onDismiss, 180);
        } else {
            content.style.transform = 'translateY(0)';
            setTimeout(() => {
                content.style.transform = '';
                content.style.transition = '';
            }, 180);
        }
        dragging = false;
    };

    content.addEventListener('pointerdown', event => beginSwipe(event.target, event.clientX, event.clientY));
    window.addEventListener('pointermove', event => moveSwipe(event.clientX, event.clientY, event));
    window.addEventListener('pointerup', event => finishSwipe(event.clientY));
    window.addEventListener('pointercancel', event => finishSwipe(event.clientY));
    content.addEventListener('touchstart', event => {
        const touch = event.touches[0];
        if (touch) beginSwipe(event.target, touch.clientX, touch.clientY);
    }, { passive: true });
    content.addEventListener('touchmove', event => {
        const touch = event.touches[0];
        if (touch) moveSwipe(touch.clientX, touch.clientY, event);
    }, { passive: false });
    content.addEventListener('touchend', event => finishSwipe(event.changedTouches[0]?.clientY ?? startY));
    content.addEventListener('touchcancel', event => finishSwipe(event.changedTouches[0]?.clientY ?? startY));
}

export function setLoading(active, text = "Lade...") {
    const overlay = document.getElementById('loading-overlay');
    const textEl = document.getElementById('loading-text');
    if (!overlay) return;

    if (active) {
        if (textEl) textEl.innerText = text;
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

export function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
}

export function shareStation(id) {
    const s = state.stations.find(x => x.id == id);
    if (!s) return;

    // Keep current path (/, /index.html, etc.) so the deep link works on all hosting setups.
    const urlObj = new URL(window.location.origin + window.location.pathname);
    urlObj.searchParams.set('station', s.id);
    const url = urlObj.toString();
    const text = `Schau dir ${s.name} bei der Lichternacht an!`;

    if (navigator.share) {
        navigator.share({
            title: s.name,
            text: text,
            url: url
        }).catch(console.error);
    } else {
        navigator.clipboard.writeText(`${text} ${url}`);
        showToast("Link kopiert!", "success");
    }
}
