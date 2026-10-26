import { state } from './state.js';
import { canUseFirestore, noteFirestoreError } from './firebase-quota.js?v=1.4.301';

const QUEUE_KEY = 'offline_action_queue_v1';
let flushing = false;
const STATUS_KEY = 'checkin_sync_status_v1';

export function getCheckinSyncStatus(stationId) {
    try { return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}')[String(stationId)] || null; }
    catch { return null; }
}

function updateCheckinStatus(action, status, message = '') {
    if (!['checkin', 'undo-checkin'].includes(action.type)) return;
    const queue = readQueue();
    const index = queue.findIndex(item => item.id === action.id);
    const newer = queue.slice(index + 1).some(item => ['checkin', 'undo-checkin'].includes(item.type) && item.payload?.stationId == action.payload.stationId);
    if (status !== 'pending' && newer) return;
    let statuses;
    try { statuses = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}'); } catch { statuses = {}; }
    statuses[String(action.payload.stationId)] = { status, action: action.type, message };
    localStorage.setItem(STATUS_KEY, JSON.stringify(statuses));
    window.dispatchEvent(new CustomEvent('lichternacht:checkin-sync'));
}

export function getCheckinSyncSummary() {
    let statuses;
    try { statuses = Object.values(JSON.parse(localStorage.getItem(STATUS_KEY) || '{}')); } catch { statuses = []; }
    const pending = statuses.filter(item => item.status === 'pending').length;
    const rejected = statuses.filter(item => item.status === 'rejected').length;
    return `${pending ? `${pending} Änderung(en) warten auf Übertragung. ` : ''}${rejected ? `${rejected} Änderung(en) wurden nicht vom Server übernommen. ` : ''}Offline-Besuche bleiben auf diesem Gerät. Die Übertragung muss innerhalb des Check-in-Zeitfensters erfolgen.`;
}

function readQueue() {
    try {
        const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function writeQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-250)));
    window.dispatchEvent(new CustomEvent('lichternacht:sync-queue', { detail: { count: queue.length } }));
}

export function queueOfflineAction(type, payload) {
    const queue = readQueue();
    const action = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        payload,
        ownerUid: state.auth?.currentUser?.uid || null,
        queuedAt: new Date().toISOString()
    };
    queue.push(action);
    writeQueue(queue);
    updateCheckinStatus(action, 'pending');
}

async function executeAction(action) {
    const { collection, addDoc, doc, updateDoc, increment } = state.fb || {};
    if (!state.db || !collection || !addDoc) throw new Error('Firebase ist noch nicht bereit');
    if (action.ownerUid && action.ownerUid !== state.auth?.currentUser?.uid) throw new Error('Diese Aktion wartet auf die ursprüngliche Anmeldung.');

    if (action.type === 'undo-checkin') {
        if (!state.fb.undoCheckin) throw new Error('Rücknahme wartet auf die lokale Datenbank.');
        await state.fb.undoCheckin(action.payload.stationId);
        return;
    }

    if (action.type === 'audit') {
        const reference = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'auditLogs');
        await addDoc(reference, action.payload);
        return;
    }
    if (action.type === 'checkin') {
        const user = state.auth?.currentUser;
        if (!user) throw new Error('Firebase-Anmeldung fehlt');
        const reference = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'checkins', `${user.uid}_${action.payload.stationId}`);
        try {
            await state.fb.setDoc(reference, { ...action.payload, ownerUid: user.uid, receivedAt: state.fb.serverTimestamp() });
        } catch (error) {
            if (error.permanent || error.code !== 'permission-denied') throw error;
            const existing = await state.fb.getDoc(reference);
            if (!existing.exists()) throw error;
        }
        return;
    }
    if (action.type === 'like') {
        if (!doc || !updateDoc || !increment) throw new Error('Firebase-Schreibfunktionen fehlen');
        const reference = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'stations', String(action.payload.stationId));
        await updateDoc(reference, { likes: increment(1) });
        return;
    }
    throw new Error(`Unbekannte Offline-Aktion: ${action.type}`);
}

export async function flushOfflineActions() {
    if (flushing || !navigator.onLine || state.useLocalStorage || !state.db) return;
    if ((!state.localBackend && !canUseFirestore()) || globalThis.document?.visibilityState === 'hidden') return;
    flushing = true;
    try {
        const queue = readQueue();
        const completedIds = new Set();
        const blockedStations = new Set();
        for (const action of queue) {
            const stationId = String(action.payload?.stationId || '');
            if (blockedStations.has(stationId)) continue;
            try {
                await executeAction(action);
                completedIds.add(action.id);
                updateCheckinStatus(action, 'synced');
            } catch (error) {
                if (error.permanent) {
                    completedIds.add(action.id);
                    updateCheckinStatus(action, 'rejected', error.message);
                    continue;
                }
                blockedStations.add(stationId);
                if (noteFirestoreError(error)) break;
                console.warn('Offline-Aktion konnte noch nicht synchronisiert werden.', error);
            }
        }
        writeQueue(readQueue().filter(action => !completedIds.has(action.id)));
    } finally {
        flushing = false;
    }
}

export function initOfflineSync() {
    window.addEventListener('online', flushOfflineActions);
    window.setInterval(flushOfflineActions, 30000);
    flushOfflineActions();
}
