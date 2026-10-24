import { state } from './state.js';

export async function initializeLocalBackend() {
    let snapshot;
    let requiresLocalBackend = false;
    try { requiresLocalBackend = localStorage.getItem('local_backend_enabled') === 'true'; } catch {}
    try {
        const response = await fetch('./api/local-data', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (response.status === 404) {
            try { localStorage.removeItem('local_backend_enabled'); } catch {}
            return false;
        }
        requiresLocalBackend = true;
        if (!response.ok) throw new Error('Lokale Datenbank nicht verfügbar');
        snapshot = await response.json();
        if (!snapshot.ok || !Array.isArray(snapshot.stations) || !Array.isArray(snapshot.events)) throw new Error('Ungültige Datenbankantwort');
    } catch (error) {
        if (requiresLocalBackend) throw error;
        console.warn('Lokale Datenbank wurde nicht aktiviert.', error);
        return false;
    }
    const original = { ...state.fb };
    const increments = new WeakMap();
    state.fb.increment = amount => {
        const value = original.increment(amount);
        increments.set(value, amount);
        return value;
    };
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
    const submit = async payload => {
        const user = state.auth?.currentUser;
        if (!user) throw new Error('Admin-Anmeldung fehlt');
        const response = await fetch('./api/local-data', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Speichern fehlgeschlagen');
    };
    const write = (reference, action, data, merge) => {
        const target = classify(reference);
        if (target.collection === 'stations' && data && Object.keys(data).length === 1 && increments.get(data.likes) === 1) return submit({ ...target, action: 'like' });
        return submit({ ...target, action, data, merge });
    };
    state.fb.setDoc = (reference, data, options) => classify(reference) ? write(reference, 'set', data, options?.merge === true) : original.setDoc(reference, data, options);
    state.fb.updateDoc = (reference, data) => classify(reference) ? write(reference, 'set', data, true) : original.updateDoc(reference, data);
    state.fb.deleteDoc = reference => classify(reference) ? write(reference, 'delete') : original.deleteDoc(reference);
    state.fb.writeBatch = database => {
        const operations = [];
        const add = (action, reference, data, options) => { operations.push({ action, reference, data, options }); return batch; };
        const batch = {
            set: (reference, data, options) => add('set', reference, data, options),
            update: (reference, data) => add('set', reference, data, { merge: true }),
            delete: reference => add('delete', reference),
            commit: async () => {
                const local = operations.filter(operation => classify(operation.reference));
                if (local.length && local.length !== operations.length) throw new Error('Gemischte Datenbank-Transaktionen werden nicht unterstützt.');
                if (local.length) return submit({ operations: local.map(operation => ({ ...classify(operation.reference), action: operation.action, data: operation.data, merge: operation.options?.merge === true })) });
                const remote = original.writeBatch(database);
                for (const operation of operations) {
                    if (operation.action === 'delete') remote.delete(operation.reference);
                    else remote.set(operation.reference, operation.data, operation.options || {});
                }
                return remote.commit();
            }
        };
        return batch;
    };
    state.localBackend = true;
    try { localStorage.setItem('local_backend_enabled', 'true'); } catch {}
    state.localBackendAppId = snapshot.appId;
    return true;
}
