import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function decodeFirestoreValue(value) {
    if ('nullValue' in value) return null;
    for (const key of ['stringValue', 'booleanValue', 'timestampValue']) if (key in value) return value[key];
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
    if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decodeFirestoreValue(item)]));
    throw new Error('Nicht unterstützter Firestore-Datentyp');
}

export async function exportFirestore({ token, project, appId, origin, output }) {
    const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/`;
    const read = async path => {
        const response = await fetch(root + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Firestore-Export fehlgeschlagen: HTTP ${response.status}`);
        return response.json();
    };
    const documentData = document => Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]));
    const list = async path => {
        const records = [];
        let next = '';
        do {
            const result = await read(path + '?pageSize=300' + (next ? '&pageToken=' + encodeURIComponent(next) : ''));
            for (const document of result?.documents || []) records.push({ id: document.name.split('/').pop(), data: documentData(document) });
            next = result?.nextPageToken || '';
        } while (next);
        return records;
    };
    const base = `artifacts/${encodeURIComponent(appId)}/public/`;
    const stations = await list(base + 'data/stations');
    const events = await list(base + 'data/events');
    if (!stations.length) throw new Error('Export ohne Stationen wird nicht als Migration freigegeben.');
    const configDocument = await read(base + 'config');
    if (!configDocument) throw new Error('Veranstaltungskonfiguration fehlt.');
    const config = documentData(configDocument);
    const localDocuments = {};
    for (const collection of ['checkins', 'auditLogs', 'presence', 'users', 'reports']) localDocuments[collection] = await list(base + (collection === 'reports' ? '' : 'data/') + collection);
    for (const [collection, path, id] of [['globalConfig', 'global/config', 'config'], ['stats', 'global/stats', 'stats'], ['broadcast', base + 'broadcast', 'broadcast']]) {
        const document = await read(path);
        localDocuments[collection] = document ? [{ id, data: documentData(document) }] : [];
    }
    const backup = { format: 'lichternacht-full-backup', version: 3, appId, createdAt: new Date().toISOString(), stations: stations.map(record => ({ ...record.data, __docId: record.id })), events: events.map(record => ({ ...record.data, __docId: record.id })), config, downloads: config.downloads || {}, localDocuments, assets: [] };
    const sources = [...backup.stations, ...backup.events].map(record => record.image).filter(Boolean);
    sources.push(...['flyer1', 'flyer2'].map(slot => backup.downloads[slot]).filter(Boolean));
    const seen = new Set();
    for (const sourceUrl of sources) {
        const url = new URL(sourceUrl, origin);
        if (url.origin !== new URL(origin).origin || !/^\/downloads\/(stations|events|flyers)\/[a-zA-Z0-9_-]+\.(webp|pdf)$/.test(url.pathname) || seen.has(sourceUrl)) continue;
        seen.add(sourceUrl);
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error('Eine gespeicherte Datei konnte nicht gesichert werden.');
        const content = Buffer.from(await response.arrayBuffer());
        if (!content.length) throw new Error('Eine gespeicherte Datei ist leer.');
        backup.assets.push({ sourceUrl, contentType: response.headers.get('content-type'), base64: content.toString('base64') });
    }
    await writeFile(output, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' });
    return { stations: stations.length, events: events.length, files: backup.assets.length, documents: Object.values(localDocuments).reduce((sum, records) => sum + records.length, 0) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    if (!process.env.FIREBASE_ACCESS_TOKEN || process.argv.length !== 6) throw new Error('FIREBASE_ACCESS_TOKEN setzen. Aufruf: node scripts/export-firestore.mjs PROJECT APP_ID ORIGIN AUSGABE.json');
    console.log(await exportFirestore({ token: process.env.FIREBASE_ACCESS_TOKEN, project: process.argv[2], appId: process.argv[3], origin: process.argv[4], output: process.argv[5] }));
}
