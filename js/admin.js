
import { state } from './state.js';
import { showToast } from './utils.js';
import { saveData, seedStations, seedEvents } from './data.js';

export function toggleAdminPanel() {
    const panel = document.getElementById('admin-panel');
    if (panel) panel.classList.toggle('hidden');
}

export async function uploadSeedData() {
    if (!confirm("ACHTUNG: Dies überschreibt/ergänzt die Datenbank mit den Demo-Daten. Fortfahren?")) return;
    
    try {
        let count = 0;
        for (const s of seedStations) {
            await saveData('station', s);
            count++;
        }
        for (const e of seedEvents) {
            await saveData('event', e);
            count++;
        }
        showToast(`${count} Datensätze hochgeladen!`, 'success');
        setTimeout(() => location.reload(), 1500);
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Upload", 'error');
    }
}

export function resetApp() {
    if (!confirm("Wirklich alles zurücksetzen? (Löscht lokale Einstellungen und Cache)")) return;
    localStorage.clear();
    location.reload();
}

export async function importData() {
    const json = document.getElementById('export-area').value;
    if (!json) {
        showToast("Kein JSON im Textfeld!", 'error');
        return;
    }

    try {
        const data = JSON.parse(json);
        if (!data.stations && !data.events) {
            throw new Error("Ungültiges Format (braucht 'stations' oder 'events' Array)");
        }

        if (confirm(`Importieren? ${data.stations?.length || 0} Stationen, ${data.events?.length || 0} Events.`)) {
            if (data.stations) {
                for (const s of data.stations) await saveData('station', s);
            }
            if (data.events) {
                for (const e of data.events) await saveData('event', e);
            }
            showToast("Import erfolgreich!", 'success');
            setTimeout(() => location.reload(), 1500);
        }
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Import: " + e.message, 'error');
    }
}

export function handleAdminAdd(type) {
    // Determine type based on where it's called or just generic
    // Actually the button calls handleAdminAdd() without args usually, 
    // but let's assume we want to add a Station by default if no type.
    
    // We can show a prompt or just create a new empty one and open modal.
    // Let's create a new Station at map center.
    
    const center = state.map.getCenter();
    const newId = Date.now(); // Simple ID
    
    const newStation = {
        id: newId,
        name: "Neue Station",
        desc: "Beschreibung hier...",
        lat: center.lat,
        lng: center.lng,
        tags: []
    };
    
    state.stations.push(newStation);
    
    // Refresh Map to show new pin immediately
    if (window.refreshMapMarkers) window.refreshMapMarkers();

    // Open Modal for this new station
    if (window.editStation) {
        // Add to local state first so find works
        window.editStation(newId);
        showToast("Neue Station erstellt (noch nicht gespeichert)", 'info');
    }
}

export function dumpData() {
    const data = {
        stations: state.stations,
        events: state.events
    };
    const json = JSON.stringify(data, null, 2);
    document.getElementById('export-area').value = json;
    showToast("Daten in Textfeld exportiert", 'success');
}

export function downloadDataJs() {
    const data = {
        stations: state.stations,
        events: state.events
    };
    
    const content = `import { state } from './state.js';
import { showToast } from './utils.js';
import { refreshMapMarkers } from './map.js';
import { renderList, renderTimeline } from './ui.js';

export const seedStations = ${JSON.stringify(data.stations, null, 4)};

export const seedEvents = ${JSON.stringify(data.events, null, 4)};

// ... keep the rest of data.js logic manually or just use this for seeding
// Note: This download is intended to update the seed data in data.js
`;

    const blob = new Blob([content], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.js';
    a.click();
    URL.revokeObjectURL(url);
    showToast("data.js heruntergeladen", 'success');
}

export function uploadFlyer(inputId, outputId) {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    
    if (input.files && input.files[0]) {
        // Since we don't have a backend for arbitrary file upload easily without auth/storage setup validation,
        // and we want to keep it simple:
        // Ideally we would upload to Firebase Storage here.
        // For now, let's show an alert that this requires Storage configuration.
        // OR: Read as Base64 (DataURL) but that's huge for PDFs.
        
        // Let's assume the user puts a URL manually for now if they don't have storage.
        // But if they selected a file, we can try to upload if `state.fb` has storage.
        
        showToast("Upload-Funktion benötigt Firebase Storage Konfiguration. Bitte URL manuell eingeben.", 'info');
        console.warn("File upload not fully implemented without Storage bucket config.");
    }
}

export async function saveDownloads() {
    const flyer1 = document.getElementById('admin-flyer1').value;
    const flyer2 = document.getElementById('admin-flyer2').value;
    const icsDate = document.getElementById('admin-ics-date').value;

    const config = {
        downloads: {
            flyer1,
            flyer2,
            icsDate
        }
    };
    
    try {
        if (state.useLocalStorage) {
            const old = JSON.parse(localStorage.getItem('app_config') || '{}');
            localStorage.setItem('app_config', JSON.stringify({...old, ...config}));
        } else {
            const { doc, setDoc } = state.fb;
            await setDoc(doc(state.db, 'artifacts', state.appId, 'public', 'config'), config, { merge: true });
        }
        showToast("Downloads gespeichert", 'success');
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
    }
}

export async function sendBroadcast() {
    const text = document.getElementById('admin-broadcast-text').value;
    if (!text) return;
    
    if (!confirm(`Nachricht senden an alle?\n"${text}"`)) return;

    // We use a 'broadcast' document or collection
    try {
        const { doc, setDoc, Timestamp } = state.fb;
        // Write to a 'signals' collection or just update a config doc
        // Let's use 'signals/broadcast'
        await setDoc(doc(state.db, 'artifacts', state.appId, 'signals', 'broadcast'), {
            msg: text,
            timestamp: Timestamp.now()
        });
        
        showToast("Nachricht gesendet!", 'success');
        document.getElementById('admin-broadcast-text').value = '';
    } catch (e) {
        console.error(e);
        showToast("Sendefehler (nur Online)", 'error');
    }
}

export async function saveAppConfig() {
    const title = document.getElementById('admin-app-title').value;
    const subtitle = document.getElementById('admin-app-subtitle').value;
    
    const config = { title, subtitle };
    
    try {
        if (state.useLocalStorage) {
            const old = JSON.parse(localStorage.getItem('app_config') || '{}');
            localStorage.setItem('app_config', JSON.stringify({...old, ...config}));
        } else {
            const { doc, setDoc } = state.fb;
            await setDoc(doc(state.db, 'artifacts', state.appId, 'public', 'config'), config, { merge: true });
        }
        showToast("Konfiguration gespeichert", 'success');
        
        // Update UI immediately
        if (title) document.getElementById('app-title').innerText = title;
        if (subtitle) document.getElementById('app-subtitle').innerText = subtitle;
        
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
    }
}
