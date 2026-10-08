import { seedEvents, seedStations } from '../js/data.js';

const required = ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_EMAIL', 'FIREBASE_PASSWORD', 'FIREBASE_ADMIN_UID'];
for (const name of required) {
    if (!process.env[name]) throw new Error(`${name} fehlt`);
}

const apiKey = process.env.FIREBASE_API_KEY;
const projectId = process.env.FIREBASE_PROJECT_ID;
const appId = process.env.FIREBASE_APP_ID || 'lichternacht-2026';
const adminUid = process.env.FIREBASE_ADMIN_UID;
const adminEmail = process.env.FIREBASE_EMAIL.toLowerCase();

const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: process.env.FIREBASE_EMAIL,
        password: process.env.FIREBASE_PASSWORD,
        returnSecureToken: true
    })
});
if (!authResponse.ok) throw new Error(`Firebase-Anmeldung fehlgeschlagen: ${await authResponse.text()}`);
const { idToken, localId } = await authResponse.json();
if (localId !== adminUid) throw new Error('Die angemeldete UID stimmt nicht mit FIREBASE_ADMIN_UID überein');

function encodeValue(value) {
    if (value === null) return { nullValue: null };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') {
        return Number.isInteger(value)
            ? { integerValue: String(value) }
            : { doubleValue: value };
    }
    if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
    return { stringValue: String(value) };
}

function encodeFields(value) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
}

const documentName = path => `projects/${projectId}/databases/(default)/documents/${path}`;
const writes = [];
const put = (path, data) => writes.push({ update: { name: documentName(path), fields: encodeFields(data) } });

put('global/config', { activeYear: '2026' });
put('global/stats', { championsCount: 0, count_bronze: 0, count_silver: 0, count_gold: 0, count_diamond: 0 });
put(`artifacts/${appId}/public/config`, {
    title: 'LICHTERNACHT BECHHOFEN',
    subtitle: 'Samstag, 21. November 2026',
    planningMode: false,
    planningText: '',
    downloads: { flyer1: '', flyer2: '', icsDate: '21.11.2026 17:00-22:30' }
});
put(`artifacts/${appId}/public/data/users/${adminUid}`, { uid: adminUid, email: adminEmail });
for (const station of seedStations) put(`artifacts/${appId}/public/data/stations/${station.id}`, station);
for (const event of seedEvents) put(`artifacts/${appId}/public/data/events/${event.id}`, event);

const commitResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ writes })
});
if (!commitResponse.ok) throw new Error(`Firestore-Initialisierung fehlgeschlagen: ${await commitResponse.text()}`);
const result = await commitResponse.json();
console.log(`${result.writeResults?.length || writes.length} Dokumente erfolgreich angelegt.`);
