import { state } from './state.js';

const QUEUE_KEY = 'offline_action_queue_v1';
let flushing = false;

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
    queue.push({
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        payload,
        queuedAt: new Date().toISOString()
    });
    writeQueue(queue);
}

async function executeAction(action) {
    const { collection, addDoc, doc, updateDoc, increment } = state.fb || {};
    if (!state.db || !collection || !addDoc) throw new Error('Firebase ist noch nicht bereit');

    if (action.type === 'audit') {
        const reference = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'auditLogs');
        await addDoc(reference, action.payload);
        return;
    }
    if (action.type === 'checkin') {
        const reference = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'checkins');
        await addDoc(reference, action.payload);
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
    flushing = true;
    try {
        const queue = readQueue();
        const completedIds = new Set();
        for (const action of queue) {
            try {
                await executeAction(action);
                completedIds.add(action.id);
            } catch (error) {
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
