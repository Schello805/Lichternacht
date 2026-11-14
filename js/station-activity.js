import { state } from './state.js';
import { stationCoordinates, distanceMeters, STATION_ARRIVAL_RADIUS_METERS } from './round-trip.js?v=1.4.317';
import { getConfiguredEventWindow, isWithinPassCheckinWindowNow, getVisitedStationIdSet } from './utils.js?v=1.4.317';

const CONSENT_KEY = 'station_activity_consent_v1';
const TOKENS_KEY = 'station_activity_tokens_v1';
let candidate = null;
let busy = false;
let lastPoll = 0;
let levels = new Map();
let levelsAt = 0;

function tokens() {
    try {
        const records = JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}');
        if (!records || Array.isArray(records) || typeof records !== 'object') return {};
        return Object.fromEntries(Object.entries(records).filter(([, record]) => record && typeof record === 'object' && (!record.expiresAt || record.expiresAt > Date.now())));
    } catch { return {}; }
}

export function nearestActivityStation(stations, location, accuracy, fixAt, now = Date.now()) {
    const position = stationCoordinates(location);
    if (!position || !Number.isFinite(accuracy) || accuracy > 30 || accuracy < 0 || !Number.isFinite(fixAt) || now - fixAt > 15000 || fixAt > now) return null;
    return stations.map(station => ({ station, coordinates: stationCoordinates(station) })).filter(item => item.coordinates)
        .map(item => ({ station: item.station, distance: distanceMeters(position, item.coordinates) }))
        .filter(item => item.distance <= STATION_ARRIVAL_RADIUS_METERS).sort((first, second) => first.distance - second.distance)[0]?.station || null;
}

async function requestActivity(payload = null, report = false) {
    const headers = {};
    if (payload || report) {
        if (!state.auth?.currentUser) throw new Error('Anmeldung noch nicht bereit');
        headers.Authorization = `Bearer ${await state.auth.currentUser.getIdToken()}`;
    }
    const options = { headers, cache: 'no-store', signal: AbortSignal.timeout(10000) };
    if (payload) {
        headers['Content-Type'] = 'application/json';
        options.method = 'POST';
        options.body = JSON.stringify({ action: 'stationActivity', ...payload });
    }
    const response = await fetch(`./api/local-data${payload ? '' : `?collection=stationActivity${report ? '&report=true' : ''}`}`, options);
    if (!response.ok) throw new Error('Stationsstatistik nicht verfügbar');
    return response.json();
}

export async function loadStationActivityReport() {
    return (await requestActivity(null, true)).stations;
}

export function getStationActivityToken(stationId) {
    try {
        if (localStorage.getItem(CONSENT_KEY) !== 'granted') return null;
        const date = getConfiguredEventWindow()?.dateKey;
        const record = tokens()[`${date}:${String(stationId)}`];
        return record && !record.forget && /^[a-f0-9]{64}$/.test(record.token) ? record.token : null;
    } catch { return null; }
}

export function renderStationActivity(stationId) {
    const badge = document.getElementById('modal-activity-badge');
    if (!badge) return;
    const level = Date.now() - levelsAt < 60000 ? levels.get(String(stationId)) : null;
    const labels = { low: '🟢 Geringe Aktivität', medium: '🟡 Mittlere Aktivität', high: '🔴 Hohe Aktivität' };
    badge.textContent = labels[level] || '';
    badge.classList.toggle('hidden', !labels[level]);
}

export async function refreshStationActivity() {
    if (!state.localBackend) return;
    try {
        const result = await requestActivity();
        levels = new Map(result.stations.map(row => [String(row.stationId), row.level]));
        levelsAt = Date.now();
    } catch { levels.clear(); }
    renderStationActivity(state.activeStationId);
}

async function tick() {
    renderStationActivity(state.activeStationId);
    if (busy || !state.localBackend || !navigator.onLine || document.visibilityState !== 'visible') return;
    busy = true;
    try {
        const now = Date.now();
        const modal = document.getElementById('detail-modal');
        if (state.activeStationId != null && modal && !modal.classList.contains('hidden') && now - lastPoll >= 30000) {
            lastPoll = now;
            await refreshStationActivity();
        }
        const records = tokens();
        for (const [key, record] of Object.entries(records)) {
            if (record.forget) {
                await requestActivity({ token: record.token, forget: true });
                delete records[key];
            }
        }
        localStorage.setItem(TOKENS_KEY, JSON.stringify(records));
        if (localStorage.getItem(CONSENT_KEY) !== 'granted') { candidate = null; return; }
        const windowConfig = getConfiguredEventWindow();
        if (!isWithinPassCheckinWindowNow(windowConfig)) { candidate = null; return; }
        const station = nearestActivityStation(state.stations, state.userLocation, state.gpsAccuracy, state.gpsLastFixAt, now);
        const id = station ? String(station.id) : null;
        if (!id || candidate?.id !== id) candidate = id ? { id, since: now, fixAt: state.gpsLastFixAt } : null;
        const present = candidate && now - candidate.since >= 20000 && state.gpsLastFixAt > candidate.fixAt;
        const visited = getVisitedStationIdSet();
        if (present) {
            const key = `${windowConfig.dateKey}:${id}`;
            if (!records[key]) {
                const bytes = crypto.getRandomValues(new Uint8Array(32));
                const [year, month, day] = windowConfig.dateKey.split('-').map(Number);
                const end = new Date(year, month - 1, day + (windowConfig.endMin < windowConfig.startMin ? 1 : 0), 0, windowConfig.endMin);
                records[key] = { token: [...bytes].map(value => value.toString(16).padStart(2, '0')).join(''), stationId: id, event: windowConfig.dateKey, at: 0, expiresAt: end.getTime() + 3 * 3600000 + 30 * 86400000 };
                localStorage.setItem(TOKENS_KEY, JSON.stringify(records));
            }
        }
        for (const record of Object.values(records)) {
            if (record.event !== windowConfig.dateKey || record.forget || now - record.at < 60000) continue;
            const isPresent = Boolean(present && record.stationId === id);
            if (!isPresent && record.checked === visited.has(String(record.stationId))) continue;
            if (localStorage.getItem(CONSENT_KEY) !== 'granted') return;
            const result = await requestActivity({ token: record.token, stationId: record.stationId, present: isPresent });
            record.at = now;
            record.checked = result.checkedIn;
            if (localStorage.getItem(CONSENT_KEY) !== 'granted') {
                Object.values(records).forEach(item => { item.forget = true; });
                localStorage.setItem(TOKENS_KEY, JSON.stringify(records));
                return;
            }
            localStorage.setItem(TOKENS_KEY, JSON.stringify(records));
        }
    } catch { candidate = null; }
    finally { busy = false; }
}

export function setStationActivityConsent(granted) {
    localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
    if (!granted) {
        const records = tokens();
        Object.values(records).forEach(record => { record.forget = true; });
        localStorage.setItem(TOKENS_KEY, JSON.stringify(records));
    }
    candidate = null;
    void tick();
}

export function initStationActivity() {
    if (!localStorage.getItem('station_activity_notice_v1')) {
        localStorage.setItem('station_activity_notice_v1', 'shown');
        if (window.getTrackingConsentState?.() != null) window.openCookieBanner?.();
    }
    window.setInterval(tick, 15000);
    document.addEventListener('visibilitychange', () => { candidate = null; void tick(); });
    window.addEventListener('station-checkin-synced', () => {
        const records = tokens();
        Object.values(records).forEach(record => { record.at = 0; });
        localStorage.setItem(TOKENS_KEY, JSON.stringify(records));
        void tick();
    });
    void tick();
}
