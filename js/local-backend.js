import { state } from './state.js';
import { installLocalRecords } from './local-records.js?v=1.4.309';

export async function initializeLocalBackend() {
    let snapshot;
    let requiresLocalBackend = false;
    try { requiresLocalBackend = localStorage.getItem('local_backend_enabled') === 'true'; } catch {}
    try {
        const response = await fetch('./api/local-data', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (response.status === 404) {
            if (requiresLocalBackend) throw new Error('Die lokale Datenquelle ist nicht erreichbar. Automatischer Datenbankwechsel wurde verhindert.');
            try { localStorage.removeItem('local_backend_enabled'); } catch {}
            return false;
        }
        requiresLocalBackend = true;
        if (!response.ok) throw new Error('Lokale Datenbank nicht verfügbar');
        snapshot = await response.json();
        if (!snapshot.ok || !Array.isArray(snapshot.stations) || !Array.isArray(snapshot.events)) throw new Error('Ungültige Datenbankantwort');
    } catch (error) {
        throw error;
    }
    const original = { ...state.fb };
    let readPromise = null;
    const classify = reference => {
        const path = reference?.path || '';
        const base = `artifacts/${snapshot.appId}/public/`;
        if (path === base + 'config') return { collection: 'config', id: 'config' };
        for (const collection of ['stations', 'events']) {
            const prefix = base + 'data/' + collection;
            if (path === prefix) return { collection };
            if (path.startsWith(prefix + '/') && !path.slice(prefix.length + 1).includes('/')) return { collection, id: path.slice(prefix.length + 1) };
        }
        return null;
    };
    const read = () => {
        if (!readPromise) readPromise = fetch('./api/local-data', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
            .then(async response => {
                if (!response.ok) throw new Error('Lokale Datenbank nicht verfügbar');
                snapshot = await response.json();
                return snapshot;
            }).finally(() => { readPromise = null; });
        return readPromise;
    };
    const documentSnapshot = (reference, data) => ({ id: reference.id, ref: reference, exists: () => data !== undefined, data: () => data });
    for (const method of ['getDoc', 'getDocFromServer']) state.fb[method] = async reference => {
        const target = classify(reference);
        if (!target) return original[method](reference);
        const data = await read();
        const value = target.collection === 'config' ? data.config : data[target.collection].find(item => String(item.__docId ?? item.id) === target.id);
        return documentSnapshot(reference, value);
    };
    for (const method of ['getDocs', 'getDocsFromServer']) state.fb[method] = async reference => {
        const target = classify(reference);
        if (!target) return original[method](reference);
        const data = await read();
        const docs = data[target.collection].map(item => documentSnapshot(original.doc(reference, String(item.__docId ?? item.id)), item));
        return { docs, size: docs.length, empty: docs.length === 0, forEach: callback => docs.forEach(callback) };
    };
    state.localBackend = true;
    installLocalRecords(snapshot.appId);
    try { localStorage.setItem('local_backend_enabled', 'true'); } catch {}
    state.localBackendAppId = snapshot.appId;
    return true;
}
