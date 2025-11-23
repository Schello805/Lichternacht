import { state } from './state.js';
import { showToast, setLoading, esc } from './utils.js';
import { saveData, loadData, seedStations, seedEvents } from './data.js';
import { openEventModal, renderTagHelper, setupDragDrop } from './ui.js';

export async function uploadSeedData() {
    if (!confirm("Möchtest du alle Demo-Daten (Stationen & Events) in die Cloud hochladen? Bestehende Daten mit gleicher ID werden überschrieben.")) return;

    setLoading(true, "Lade Stationen hoch...");
    try {
        for (const s of seedStations) {
            await saveData('station', s);
        }
        setLoading(true, "Lade Events hoch...");
        for (const e of seedEvents) {
            await saveData('event', e);
        }
        setLoading(false);
        showToast('Alle Daten erfolgreich hochgeladen!', 'success');
        await loadData();
    } catch (err) {
        console.error(err);
        setLoading(false);
        showToast('Fehler beim Hochladen', 'error');
    }
}

export async function resetApp() {
    if (!confirm("ACHTUNG: Dies löscht alle lokalen Daten und den Cache! Die App wird neu geladen.")) return;
    localStorage.clear();
    if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
    }
    // Unregister SW
    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
            await registration.unregister();
        }
    }
    window.location.reload();
}

export function toggleAdminPanel() {
    const p = document.getElementById('admin-panel');
    if (p.classList.contains('hidden')) {
        p.classList.remove('hidden');

        // Header
        let tsv = "TYPE\tID\tNAME_TITLE\tDESC\tOFFER\tLAT\tLNG\tTAGS_COLOR\tTIME\tIMAGE_LOC\n";

        // Stations
        state.stations.forEach(s => {
            tsv += `station\t${s.id}\t${esc(s.name)}\t${esc(s.desc)}\t${esc(s.offer || '')}\t${s.lat}\t${s.lng}\t${esc(s.tags.join(','))}\t${esc(s.time || '')}\t${esc(s.image || '')}\n`;
        });

        // Events
        state.events.forEach(e => {
            tsv += `event\t${e.id}\t${esc(e.title)}\t${esc(e.desc)}\t\t${e.lat}\t${e.lng}\t${esc(e.color)}\t${esc(e.time)}\t${esc(e.loc)}\n`;
        });

        document.getElementById('export-area').value = tsv;
    } else p.classList.add('hidden');
}

export async function importData() {
    const tsvStr = document.getElementById('export-area').value;
    const lines = tsvStr.split('\n');

    const newStations = [];
    const newEvents = [];

    try {
        for (let i = 1; i < lines.length; i++) { // Skip header
            const line = lines[i].trim();
            if (!line) continue;

            const cols = line.split('\t');
            if (cols.length < 5) continue; // Skip invalid lines

            const type = cols[0].trim().toLowerCase();
            const id = cols[1].trim();
            const nameTitle = cols[2].trim();
            const desc = cols[3].trim().replace(/ \[br\] /g, "\n");
            const offer = cols[4] ? cols[4].trim().replace(/ \[br\] /g, "\n") : ""; // New Column
            const lat = Number(cols[5].replace(',', '.'));
            const lng = Number(cols[6].replace(',', '.'));
            const tagsColor = cols[7] ? cols[7].trim() : "";
            const time = cols[8] ? cols[8].trim() : "";
            const imgLoc = cols[9] ? cols[9].trim() : "";

            if (type === 'station') {
                newStations.push({
                    id: Number(id),
                    name: nameTitle,
                    desc: desc,
                    offer: offer,
                    lat: lat,
                    lng: lng,
                    tags: tagsColor.split(',').map(t => t.trim()).filter(t => t),
                    time: time || null,
                    image: imgLoc || null
                });
            } else if (type === 'event') {
                newEvents.push({
                    id: id,
                    title: nameTitle,
                    desc: desc,
                    lat: lat,
                    lng: lng,
                    color: tagsColor || 'gray',
                    time: time,
                    loc: imgLoc
                });
            }
        }

        if (!confirm(`Importieren?\n${newStations.length} Stationen\n${newEvents.length} Events\n\nDies überschreibt existierende Daten in der Cloud!`)) return;

        setLoading(true, "Importiere Stationen...");
        for (const s of newStations) {
            await saveData('station', s);
        }

        setLoading(true, "Importiere Events...");
        for (const e of newEvents) {
            await saveData('event', e);
        }

        setLoading(false);
        showToast('Import erfolgreich!', 'success');
        toggleAdminPanel();
        await loadData();

    } catch (e) {
        setLoading(false);
        alert("Fehler beim Import: " + e.message);
        console.error(e);
    }
}

export function handleAdminAdd() {
    if (state.activeTab === 'events') openEventModal();
    else addNewStation();
}

export function dumpData() {
    const data = {
        stations: state.stations,
        events: state.events
    };
    const json = JSON.stringify(data, null, 4);
    console.log("--- COPY BELOW THIS LINE ---");
    console.log(json);
    console.log("--- COPY ABOVE THIS LINE ---");

    // Try copy to clipboard
    try {
        navigator.clipboard.writeText(json);
        showToast('Daten als JSON in die Zwischenablage kopiert!', 'success');
    } catch (e) {
        showToast('Konnte nicht kopieren, siehe Konsole (F12)', 'info');
    }
}

export async function downloadDataJs() {
    const stationsJson = JSON.stringify(state.stations, null, 4);
    const eventsJson = JSON.stringify(state.events, null, 4);

    const fileContent = `import { state } from './state.js';
import { showToast } from './utils.js';
import { renderList, renderTimeline } from './ui.js';
import { refreshMapMarkers } from './map.js';

export const seedStations = ${stationsJson};

export const seedEvents = ${eventsJson};

export async function loadData() {
    if (state.useLocalStorage) {
        const sData = localStorage.getItem('stations_data');
        state.stations = sData ? JSON.parse(sData) : seedStations;
        const eData = localStorage.getItem('events_data');
        state.events = eData ? JSON.parse(eData) : seedEvents;
    } else {
        const { collection, getDocs } = state.fb;
        const sCol = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'stations');
        const sSnap = await getDocs(sCol);
        state.stations = sSnap.empty ? seedStations : [];
        // Clear array and push
        state.stations.length = 0;
        sSnap.forEach(doc => state.stations.push(doc.data()));

        const eCol = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'events');
        const eSnap = await getDocs(eCol);
        state.events = eSnap.empty ? seedEvents : [];
        state.events.length = 0;
        eSnap.forEach(doc => state.events.push(doc.data()));
    }
    refreshMapMarkers();
    renderList(state.stations);
    renderTimeline();
}

export async function saveData(type, item) {
    if (state.useLocalStorage) {
        if (type === 'station') localStorage.setItem('stations_data', JSON.stringify(state.stations));
        if (type === 'event') localStorage.setItem('events_data', JSON.stringify(state.events));
    } else {
        const { collection, doc, setDoc } = state.fb;
        const colName = type === 'station' ? 'stations' : 'events';
        const colRef = collection(state.db, 'artifacts', state.appId, 'public', 'data', colName);
        const data = JSON.parse(JSON.stringify(item));
        await setDoc(doc(colRef, item.id.toString()), data);
    }
}

export async function deleteData(type, id) {
    if (state.useLocalStorage) {
        if (type === 'station') {
            state.stations = state.stations.filter(x => x.id != id);
            localStorage.setItem('stations_data', JSON.stringify(state.stations));
        }
        if (type === 'event') {
            state.events = state.events.filter(x => x.id != id);
            localStorage.setItem('events_data', JSON.stringify(state.events));
        }
    } else {
        const { collection, doc, deleteDoc } = state.fb;
        const colName = type === 'station' ? 'stations' : 'events';
        const colRef = collection(state.db, 'artifacts', state.appId, 'public', 'data', colName);
        await deleteDoc(doc(colRef, id.toString()));
    }
}

export async function syncGlobalConfig() {
    try {
        const { doc, getDoc } = state.fb;
        const docRef = doc(state.db, 'global', 'config');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.activeYear) {
                state.appId = \`lichternacht-\${data.activeYear}\`;
                console.log("Configured Year:", data.activeYear);
                document.querySelectorAll('.year-display').forEach(el => el.innerText = data.activeYear);
            }
        } else {
            console.log("No global config found, using default:", state.appId);
        }
    } catch (e) {
        console.warn("Could not sync global config (offline?)", e);
    }
}

export async function changeYear() {
    const newYear = prompt("Neues Jahr eingeben (z.B. 2026).\\nACHTUNG: Dies wechselt die Datenbank für ALLE Nutzer sofort!");
    if (!newYear || newYear.length !== 4) return;

    try {
        const { doc, setDoc } = state.fb;
        await setDoc(doc(state.db, 'global', 'config'), { activeYear: newYear }, { merge: true });
        alert(\`Jahr auf \${newYear} geändert. Die Seite wird neu geladen.\`);
        location.reload();
    } catch (e) {
        console.error(e);
        alert("Fehler beim Ändern des Jahres.");
    }
}
`;

    // Try File System Access API (Chrome/Edge)
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'data.js',
                types: [{
                    description: 'JavaScript File',
                    accept: { 'text/javascript': ['.js'] },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(fileContent);
            await writable.close();
            showToast('Datei erfolgreich gespeichert!', 'success');
            return;
        } catch (err) {
            // User cancelled or error, fall back to download
            if (err.name !== 'AbortError') console.warn(err);
            else return; // Cancelled
        }
    }

    // Fallback: Blob Download
    const blob = new Blob([fileContent], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('data.js heruntergeladen!', 'success');
}

export function addNewStation() {
    state.activeStationId = Date.now(); // Temp ID
    document.getElementById('modal-view-mode').classList.add('hidden');
    document.getElementById('modal-edit-mode').classList.remove('hidden');

    // Clear fields
    document.getElementById('edit-name').value = '';
    document.getElementById('edit-desc').value = '';
    document.getElementById('edit-offer').value = '';
    document.getElementById('edit-tags').value = '';
    document.getElementById('edit-time').value = '';
    document.getElementById('edit-image').value = '';

    renderTagHelper([]);
    setupDragDrop();

    document.getElementById('detail-modal').classList.remove('hidden');
    requestAnimationFrame(() => document.getElementById('modal-content').classList.remove('translate-y-full'));
}
