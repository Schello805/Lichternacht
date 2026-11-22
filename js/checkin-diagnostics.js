import { state } from './state.js';
import { getCalendarEventWindow } from './event-calendar.js?v=1.4.341';
import { DIAGNOSTIC_LABELS } from './usage-analytics.js?v=1.4.341';

const CONSENT_KEY = 'checkin_diagnostics_consent_v1';
const RECORDS_KEY = 'checkin_diagnostics_queue_v1';
let busy = false;
let timer;

function records() {
    try {
        const value = JSON.parse(localStorage.getItem(RECORDS_KEY) || '{}');
        if (!value || Array.isArray(value) || typeof value !== 'object') return {};
        return Object.fromEntries(Object.entries(value).filter(([token, record]) => /^[a-f0-9]{64}$/.test(token) && record?.expiresAt > Date.now()));
    } catch { return {}; }
}

function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void flushCheckinDiagnostics(), 500);
}

export function recordCheckinDiagnostic(stage, stationId, token = null) {
    try {
        if (!state.localBackend || localStorage.getItem(CONSENT_KEY) !== 'granted' || !Object.hasOwn(DIAGNOSTIC_LABELS, stage)) return null;
        const window = getCalendarEventWindow(state.downloads?.icsDate);
        if (!window || Date.now() >= window.end + (3 * 3600000) + (30 * 86400000)) return null;
        const current = records();
        if (!token) {
            if (stage !== 'attempt' || Object.keys(current).length >= 250) return null;
            token = [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, '0')).join('');
            current[token] = { stationId: String(stationId), eventKey: `${window.start - 3600000}:${window.end + 10800000}`, stages: [], expiresAt: window.end + (3 * 3600000) + (30 * 86400000), revision: 0 };
        }
        const record = current[token];
        if (!record || record.forget || record.stationId !== String(stationId)) return null;
        if (record.stage === 'synced') return token;
        record.stages = [...new Set([...record.stages, stage])];
        record.stage = stage;
        record.pending = true;
        record.revision++;
        localStorage.setItem(RECORDS_KEY, JSON.stringify(current));
        schedule();
        return token;
    } catch { return null; }
}

export async function flushCheckinDiagnostics() {
    if (busy || !state.localBackend || !navigator.onLine || !state.auth?.currentUser) return;
    busy = true;
    try {
        for (const [token, record] of Object.entries(records())) {
            const forget = record.forget || localStorage.getItem(CONSENT_KEY) !== 'granted';
            if (!forget && !record.pending) continue;
            const payload = forget ? { token, forget: true } : { token, stationId: record.stationId, eventKey: record.eventKey, stage: record.stage, stages: record.stages };
            const authorization = await state.auth.currentUser.getIdToken();
            if (!forget && localStorage.getItem(CONSENT_KEY) !== 'granted') { schedule(); continue; }
            const response = await fetch('./api/local-data', {
                method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000),
                headers: { Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'checkinDiagnostic', ...payload })
            });
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                if (!forget && result.permanent === true) {
                    const current = records();
                    if (current[token]?.revision === record.revision) current[token].pending = false;
                    localStorage.setItem(RECORDS_KEY, JSON.stringify(current));
                    continue;
                }
                break;
            }
            const current = records();
            if (!current[token]) continue;
            if (forget) delete current[token];
            else if (current[token].revision === record.revision && !current[token].forget) current[token].pending = false;
            localStorage.setItem(RECORDS_KEY, JSON.stringify(current));
            if (!forget && localStorage.getItem(CONSENT_KEY) !== 'granted') schedule();
        }
    } catch { }
    finally { busy = false; }
}

export function setCheckinDiagnosticsConsent(granted) {
    localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied');
    if (!granted) {
        const current = records();
        Object.values(current).forEach(record => { record.forget = true; record.pending = false; });
        localStorage.setItem(RECORDS_KEY, JSON.stringify(current));
    }
    schedule();
}

export function initCheckinDiagnostics() {
    window.addEventListener('online', flushCheckinDiagnostics);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void flushCheckinDiagnostics(); });
    window.setInterval(flushCheckinDiagnostics, 30000);
    void flushCheckinDiagnostics();
}
