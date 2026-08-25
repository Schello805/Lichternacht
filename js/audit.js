import { state } from './state.js';

const VISITOR_ID_KEY = 'anonymous_audit_id_v1';
const ALLOWED_DETAIL_KEYS = new Set(['stationId', 'stationName', 'eventId', 'eventTitle', 'action', 'count', 'level', 'itemType']);

export function getAnonymousAuditId() {
    try {
        let id = localStorage.getItem(VISITOR_ID_KEY);
        if (!id) {
            id = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            id = String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
            localStorage.setItem(VISITOR_ID_KEY, id);
        }
        return id;
    } catch {
        return `session-${Math.random().toString(36).slice(2, 14)}`;
    }
}

export async function recordAuditEvent(eventType, details = {}, options = {}) {
    if (state.useLocalStorage || !state.db || !state.fb?.addDoc || !state.fb?.collection) return;
    const role = options.role === 'admin' || state.isAdmin ? 'admin' : 'visitor';
    const safeDetails = {};
    for (const [key, value] of Object.entries(details || {})) {
        if (!ALLOWED_DETAIL_KEYS.has(key) || value === undefined || value === null) continue;
        safeDetails[key] = typeof value === 'number' ? value : String(value).slice(0, 120);
    }
    const user = state.auth?.currentUser;
    const actorId = role === 'admin' && user?.uid
        ? `admin-${String(user.uid).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)}`
        : getAnonymousAuditId();
    try {
        const collectionRef = state.fb.collection(state.db, 'artifacts', state.appId, 'public', 'data', 'auditLogs');
        await state.fb.addDoc(collectionRef, {
            eventType: String(eventType || 'unknown').replace(/[^a-z0-9_-]/gi, '').slice(0, 48),
            actorId,
            actorRole: role,
            createdAt: new Date().toISOString(),
            details: safeDetails,
            appId: state.appId || 'unknown'
        });
    } catch (error) {
        console.warn('Audit event could not be recorded', error);
    }
}
