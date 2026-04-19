import { state } from './state.js';

export function parseEventDateKey(input) {
    const s = String(input || '').trim();
    if (!s) return null;

    // DD.MM.YYYY
    const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (de) {
        const day = String(de[1]).padStart(2, '0');
        const month = String(de[2]).padStart(2, '0');
        const year = de[3];
        return `${year}-${month}-${day}`;
    }

    // YYYYMMDD
    const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) {
        return `${compact[1]}-${compact[2]}-${compact[3]}`;
    }

    // YYYY-MM-DD
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    return null;
}

export function formatEventDateDe(dateKey) {
    const k = String(dateKey || '').trim();
    const m = k.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return `${m[3]}.${m[2]}.${m[1]}`;
}

export function getConfiguredEventDateKey() {
    return parseEventDateKey(state.downloads?.icsDate);
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

    const url = `${window.location.origin}/?station=${s.id}`;
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
