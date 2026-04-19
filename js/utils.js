import { state } from './state.js';

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
    if (!windowConfig || !windowConfig.dateKey) return true;
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
