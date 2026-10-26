import { state } from './state.js';

export function installLocalRecords(appId) {
    const core = { ...state.fb };
    const classify = reference => {
        const path = reference?.path || '';
        const base = `artifacts/${appId}/public/`;
        if (path === 'global/config') return { collection: 'globalConfig', id: 'config' };
        if (path === 'global/stats') return { collection: 'stats', id: 'stats' };
        if (path.startsWith('globalAdmins/')) return { collection: 'globalAdmins', id: path.slice(13) };
        for (const name of ['config', 'broadcast']) if (path === base + name) return { collection: name, id: name };
        for (const name of ['stations', 'events', 'checkins', 'auditLogs', 'presence', 'users', 'reports']) {
            const prefix = base + (name === 'reports' ? '' : 'data/') + name;
            if (path === prefix) return { collection: name };
            if (path.startsWith(prefix + '/') && !path.slice(prefix.length + 1).includes('/')) return { collection: name, id: path.slice(prefix.length + 1) };
        }
        throw new Error('Nicht unterstützter lokaler Datenpfad: ' + path);
    };
    const request = async (payload, target) => {
        const headers = {};
        if (state.auth?.currentUser) headers.Authorization = `Bearer ${await state.auth.currentUser.getIdToken()}`;
        const options = { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) };
        let url = './api/local-data';
        if (payload) {
            options.method = 'POST';
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(payload);
        } else {
            const params = new URLSearchParams({ collection: target.collection });
            if (target.id !== undefined) params.set('id', target.id);
            if (target.count) params.set('count', 'true');
            if (target.since) params.set('since', target.since);
            url += '?' + params;
        }
        const response = await fetch(url, options);
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.error || 'Lokale Datenbank nicht verfügbar');
            error.code = response.status === 403 ? 'permission-denied' : 'unavailable';
            error.permanent = result.permanent === true;
            throw error;
        }
        return result;
    };
    const documentSnapshot = (reference, data) => ({ id: reference.id, ref: reference, exists: () => data !== undefined, data: () => data });
    const collectionSnapshot = docs => ({ docs, size: docs.length, empty: docs.length === 0, forEach: callback => docs.forEach(callback) });
    state.fb.getDoc = state.fb.getDocFromServer = async reference => {
        const target = classify(reference);
        if (['stations', 'events', 'config'].includes(target.collection)) return core.getDoc(reference);
        return documentSnapshot(reference, (await request(null, target)).records[0]?.data);
    };
    state.fb.where = (field, operator, value) => ({ kind: 'where', field, operator, value });
    state.fb.orderBy = (field, direction = 'asc') => ({ kind: 'order', field, direction });
    state.fb.limit = count => ({ kind: 'limit', count });
    state.fb.query = (reference, ...constraints) => ({ localQueryReference: reference, constraints, path: reference.path });
    state.fb.getDocs = state.fb.getDocsFromServer = async reference => {
        if (reference.localQueryReference) {
            let docs = [...(await state.fb.getDocs(reference.localQueryReference)).docs];
            for (const constraint of reference.constraints) {
                if (constraint.kind === 'where') docs = docs.filter(document => {
                    let value = document.data()[constraint.field];
                    const expected = constraint.value instanceof Date ? constraint.value.getTime() : constraint.value;
                    if (constraint.value instanceof Date) value = new Date(value).getTime();
                    if (constraint.operator === '>') return value > expected;
                    if (constraint.operator === '>=') return value >= expected;
                    if (constraint.operator === '<') return value < expected;
                    if (constraint.operator === '<=') return value <= expected;
                    if (constraint.operator === '==') return value === expected;
                    throw new Error('Nicht unterstützter Vergleich');
                });
                if (constraint.kind === 'order') docs.sort((first, second) => {
                    const left = first.data()[constraint.field];
                    const right = second.data()[constraint.field];
                    return (left < right ? -1 : left > right ? 1 : 0) * (constraint.direction === 'desc' ? -1 : 1);
                });
                if (constraint.kind === 'limit') docs = docs.slice(0, constraint.count);
            }
            return collectionSnapshot(docs);
        }
        const target = classify(reference);
        if (['stations', 'events'].includes(target.collection)) return core.getDocs(reference);
        const rows = (await request(null, target)).records;
        return collectionSnapshot(rows.map(row => documentSnapshot(core.doc(reference, row.id), row.data)));
    };
    state.fb.getCountFromServer = async reference => {
        const target = classify(reference);
        const constraints = reference.constraints || [];
        if (target.collection === 'presence' && constraints.length === 1 && constraints[0].field === 'lastSeen' && constraints[0].operator === '>' && constraints[0].value instanceof Date) {
            const result = await request(null, { ...target, count: true, since: constraints[0].value.toISOString() });
            return { data: () => ({ count: result.count }) };
        }
        const documents = await state.fb.getDocs(reference);
        return { data: () => ({ count: documents.size }) };
    };
    state.fb.serverTimestamp = () => ({ __localOperation: 'timestamp' });
    state.fb.increment = amount => ({ __localOperation: 'increment', amount });
    const operation = (reference, action, data, merge) => ({ ...classify(reference), action, data, merge });
    const write = (reference, action, data, merge) => {
        const target = classify(reference);
        if (target.collection === 'stats' && data && Object.values(data).some(value => value?.__localOperation === 'increment')) return Promise.resolve();
        if (target.collection === 'stations' && data && Object.keys(data).length === 1 && data.likes?.__localOperation === 'increment' && data.likes.amount === 1) return request({ ...target, action: 'like' });
        return request(operation(reference, action, data, merge));
    };
    state.fb.setDoc = (reference, data, options) => write(reference, 'set', data, options?.merge === true);
    state.fb.renameStation = (id, data) => request({ action: 'rename', collection: 'stations', id: String(id), data });
    state.fb.undoCheckin = id => request({ action: 'undo-checkin', collection: 'checkins', id: String(id) });
    state.fb.updateDoc = (reference, data) => write(reference, 'set', data, true);
    state.fb.deleteDoc = reference => write(reference, 'delete');
    state.fb.addDoc = async (reference, data) => {
        const document = core.doc(reference, crypto.randomUUID());
        await write(document, 'set', data, false);
        return document;
    };
    state.fb.writeBatch = () => {
        const operations = [];
        const batch = {
            set(reference, data, options) { operations.push(operation(reference, 'set', data, options?.merge === true)); return batch; },
            update(reference, data) { operations.push(operation(reference, 'set', data, true)); return batch; },
            delete(reference) { operations.push(operation(reference, 'delete')); return batch; },
            commit: () => operations.length ? request({ operations }) : Promise.resolve()
        };
        return batch;
    };
    state.fb.onSnapshot = (reference, callback, onError) => {
        let stopped = false;
        let reading = false;
        const refresh = async () => {
            if (stopped || reading || globalThis.document?.visibilityState === 'hidden') return;
            reading = true;
            try {
                const value = await state.fb.getDoc(reference);
                if (!stopped) callback(value);
            } catch (error) { if (!stopped) onError?.(error); }
            finally { reading = false; }
        };
        refresh();
        const interval = window.setInterval(refresh, 60000);
        return () => { stopped = true; window.clearInterval(interval); };
    };
}
