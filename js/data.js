import { state } from './state.js';
import { showToast } from './utils.js?v=1.4.199';
import { validateStations, validateEvents } from './validate.js';
import { applyLikesResetToken } from './client-reset.js?v=1.4.199';

export const seedStations = [
    { id: 1, name: "Deutsches Pinsel- & Bürstenmuseum", desc: "Genussgalerie, Cocktails. Dinkelsbühler Str. 23", lat: 49.15714, lng: 10.5484, tags: ["drink", "food", "culture"], image: "https://images.unsplash.com/photo-1513883049090-d0b7439799bf?q=80&w=1000&auto=format&fit=crop" },
    { id: 2, name: "MSC Bechhofen", desc: "Kartoffelchips, Glühwein.", lat: 49.15724, lng: 10.54899, tags: ["food", "drink"] },
    { id: 3, name: "Bauernschänke", desc: "Wahrsagespiel. Schloßstr.", lat: 49.15706, lng: 10.54951, tags: ["drink", "culture"] },
    { id: 5, name: "Evang. Kirchengemeinde", desc: "Johanniskirche (Marktplatz).", lat: 49.15796, lng: 10.55103, tags: ["food", "drink"] },
    { id: 10, name: "La Piccola Romana", desc: "Eis-Stand am Marktplatz.", lat: 49.15799, lng: 10.54959, tags: ["food", "drink"] },
    { id: 11, name: "Kiga St. Martin", desc: "Ansbacher Str.", lat: 49.1579, lng: 10.54949, tags: ["food", "drink", "kids"] },
    { id: 12, name: "Der orange Beck", desc: "Ansbacher Str.", lat: 49.15797, lng: 10.54937, tags: ["food", "drink"] },
    { id: 13, name: "Kiga St. Johannis", desc: "Ansbacher Str.", lat: 49.15811, lng: 10.54935, tags: ["food", "drink", "kids"] },
    { id: 14, name: "Der Blumenladen", desc: "Ansbacher Str.", lat: 49.15843, lng: 10.54871, tags: ["drink", "shop"] },
    { id: 15, name: "RV Adler", desc: "Ansbacher Str.", lat: 49.15852, lng: 10.5488, tags: ["food"] },
    { id: 16, name: "Mörlacher Wildkammer", desc: "Ansbacher Str.", lat: 49.15859, lng: 10.54974, tags: ["food"] },
    { id: 17, name: "Wildobsthof Mitsch", desc: "Ansbacher Str.", lat: 49.15863, lng: 10.54985, tags: ["food", "drink"] },
    { id: 18, name: "La Vida Local", desc: "Ansbacher Str.", lat: 49.15876, lng: 10.55016, tags: ["food"] },
    { id: 19, name: "Metzgerei Weinmann", desc: "Bratwurst, Leberkäse. Am Kreisverkehr.", lat: 49.15866, lng: 10.55037, tags: ["food", "wc"] },
    { id: 20, name: "Imkerverein", desc: "Ansbacher Str.", lat: 49.15871, lng: 10.55064, tags: ["drink", "shop"] },
    { id: 21, name: "Pattra Thaimassage", desc: "Ansbacher Str.", lat: 49.15822, lng: 10.55167, tags: ["food"] },
    { id: 22, name: "Henkel Transporte", desc: "Gunzenhausener Str. 24", lat: 49.15811, lng: 10.55332, tags: ["food", "drink"] },
    { id: 23, name: "Gärtnerei Höhn", desc: "Friedhofstr. 6", lat: 49.15887, lng: 10.5536, tags: ["shop"] },
    { id: 24, name: "Die Pinselfabrik", desc: "Big Band. Nähe Friedhof.", lat: 49.16019, lng: 10.55299, tags: ["culture", "event"] },
    { id: 30, name: "EDEKA Däubler Stand", desc: "Ansbacher Str. / Inset", lat: 49.16093, lng: 10.55393, tags: ["food", "drink"] },
    { id: 28, name: "Schützenhaus", desc: "Griechisch. Ziegeleistr. 9", lat: 49.15934, lng: 10.55054, tags: ["food"] },
    { id: 29, name: "Accentra Outlet", desc: "Pestalozzistr. 11", lat: 49.16266, lng: 10.55194, tags: ["drink", "shop"] },
    { id: 6, name: "Grund- & Mittelschule", desc: "Pestalozzistr. 12", lat: 49.15784, lng: 10.55056, tags: ["food", "kids"] },
    { id: 8, name: "Pferdehof Hiemeyer", desc: "Pestalozzistr.", lat: 49.15791, lng: 10.54995, tags: ["kids", "drink", "food"] },
    { id: 34, name: "TSV 1898 Bechhofen", desc: "Sportheim. Party.", lat: 49.16455, lng: 10.56021, tags: ["party", "drink"] },
    { id: 31, name: "Fritz KUNDNER GmbH", desc: "Eisenbahnstr. 5A.", lat: 49.15833, lng: 10.54919, tags: ["shop", "food"] },
    { id: 32, name: "Regens Wagner", desc: "Freiherr-von-Drais-Str.", lat: 49.16213, lng: 10.55679, tags: ["food", "drink", "kids", "wc"] },
    { id: 33, name: "Behindertenarbeit e.V.", desc: "Freiherr-von-Drais-Str.", lat: 49.16465, lng: 10.55995, tags: ["food"] },
    { id: 25, name: "Slawa Markt", desc: "Schaschlik. Liebersdorfer Str.", lat: 49.15981, lng: 10.55253, tags: ["food", "drink"] },
    { id: 26, name: "Tanzschule SK-Danceworld", desc: "Innenhof. Party.", lat: 49.15913, lng: 10.55123, tags: ["food", "drink", "wc", "party"] },
    { id: 27, name: "La Piccola Romana (Str.)", desc: "Pizza. Seitenstr.", lat: 49.15906, lng: 10.55076, tags: ["food", "wc"] },
    { id: 7, name: "Lumis Hundesalon", desc: "Hot Dog.", lat: 49.15786, lng: 10.55016, tags: ["food", "drink"] },
    { id: 9, name: "RäucherNest", desc: "Pulledpork.", lat: 49.15794, lng: 10.54976, tags: ["food"] },
    { id: 4, name: "Rockabilly Ranch Saloon", desc: "Bar.", lat: 49.15712, lng: 10.55191, tags: ["food", "drink", "kids"] }
];

export const seedEvents = [
    { id: "e1", time: "17:00", title: "Eröffnung", desc: "Johanniskirche", loc: "Kirche", color: "yellow", lat: 49.15796, lng: 10.55103 },
    { id: "e2", time: "18:00", title: "Big Band", desc: "Pinselfabrik", loc: "Pinselfabrik", color: "gray", lat: 49.16019, lng: 10.55299 },
    { id: "e3", time: "19:30", title: "Tanzgruppe", desc: "Amaya Luna", loc: "Pinselfabrik", color: "gray", lat: 49.16019, lng: 10.55299 },
    { id: "e4", time: "20:00", title: "Feuershow", desc: "Kirchplatz", loc: "Kirche", color: "purple", lat: 49.15796, lng: 10.55103 },
    { id: "e5", time: "21:00", title: "Party", desc: "TSV Sportheim", loc: "Sportheim", color: "red", lat: 49.16455, lng: 10.56021 }
];

const VISITOR_DATA_CACHE_KEY = 'visitor_data_cache_v1';
const FIREBASE_READ_TIMEOUT_MS = 10000;
let lastRemoteLoadAt = 0;
let refreshPromise = null;

function withTimeout(promise, label, timeoutMs = FIREBASE_READ_TIMEOUT_MS) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} nach ${timeoutMs / 1000} Sekunden abgebrochen`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function renderLoadedData() {
    if (window.updatePassProgress) window.updatePassProgress();
    if (window.refreshMapMarkers) window.refreshMapMarkers();
    if (window.renderList) window.renderList(state.stations);
    if (window.renderTimeline) window.renderTimeline();
    if (window.renderFilterBar) window.renderFilterBar();
    if (window.checkPlanningMode) window.checkPlanningMode();
    if (window.updateVisitorStartCard) window.updateVisitorStartCard();
    if (window.updateHeaderCountdown) window.updateHeaderCountdown();
    const detailModal = document.getElementById('detail-modal');
    if (state.activeStationId != null && detailModal && !detailModal.classList.contains('hidden') && window.openStation) {
        window.openStation(state.activeStationId);
    }
}

export function hydrateVisitorDataCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(VISITOR_DATA_CACHE_KEY) || 'null');
        state.stations = Array.isArray(cached?.stations) && cached.stations.length
            ? cached.stations
            : [...seedStations];
        state.events = Array.isArray(cached?.events) ? cached.events : [...seedEvents];
        if (cached?.config && typeof cached.config === 'object') {
            state.config = { ...state.config, ...cached.config };
            if (cached.config.downloads) {
                state.downloads = { ...state.downloads, ...cached.config.downloads };
            }
        }
        state.visitorDataSavedAt = Number(cached?.savedAt) || 0;
    } catch (error) {
        console.warn('Lokaler Daten-Cache konnte nicht gelesen werden.', error);
        state.stations = [...seedStations];
        state.events = [...seedEvents];
    }
    renderLoadedData();
}

function persistVisitorDataCache() {
    try {
        const savedAt = Date.now();
        localStorage.setItem(VISITOR_DATA_CACHE_KEY, JSON.stringify({
            stations: state.stations,
            events: state.events,
            config: state.config,
            savedAt
        }));
        state.visitorDataSavedAt = savedAt;
        window.dispatchEvent(new CustomEvent('lichternacht:data-updated', { detail: { savedAt } }));
    } catch (error) {
        console.warn('Lokaler Daten-Cache konnte nicht gespeichert werden.', error);
    }
}

function preloadVisitorImages() {
    if (!navigator.onLine) return;
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)) return;
    const imageUrls = [...state.events, ...state.stations]
        .map(item => String(item?.image || '').trim())
        .filter(Boolean)
        .filter((url, index, all) => all.indexOf(url) === index)
        .filter(url => {
            try { return new URL(url, location.href).origin === location.origin; } catch { return false; }
        });
    const preload = async () => {
        for (let index = 0; index < imageUrls.length; index += 3) {
            await Promise.allSettled(imageUrls.slice(index, index + 3).map(url => fetch(url, { cache: 'force-cache' })));
        }
    };
    if ('requestIdleCallback' in window) window.requestIdleCallback(preload, { timeout: 5000 });
    else window.setTimeout(preload, 1200);
}

export async function loadData(options = {}) {
    const silent = options.silent === true;
    if (state.useLocalStorage) {
        const sData = localStorage.getItem('stations_data');
        state.stations = sData ? JSON.parse(sData) : seedStations;
        const eData = localStorage.getItem('events_data');
        state.events = eData ? JSON.parse(eData) : seedEvents;
        
        // Load Config from LocalStorage
        const cData = localStorage.getItem('app_config');
        if (cData) {
            const parsed = JSON.parse(cData);
            state.config = { ...state.config, ...parsed };
            if (parsed.downloads) state.downloads = parsed.downloads;
            
            // Apply Config to UI immediately
            if (state.config.title) {
                document.getElementById('app-title').innerText = state.config.title;
                document.title = state.config.title;
            }
            if (state.config.subtitle) document.getElementById('app-subtitle').innerText = state.config.subtitle;
        }
    } else {
        try {
            const { collection, getDocs, getDocsFromServer, doc, getDoc, getDocFromServer } = state.fb;
            const readDocument = navigator.onLine && getDocFromServer ? getDocFromServer : getDoc;
            const readCollection = navigator.onLine && getDocsFromServer ? getDocsFromServer : getDocs;

            const configRef = doc(state.db, 'artifacts', state.appId, 'public', 'config');
            const sCol = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'stations');
            const eCol = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'events');
            const [configSnap, sSnap, eSnap] = await withTimeout(
                Promise.all([readDocument(configRef), readCollection(sCol), readCollection(eCol)]),
                'Aktuelle Veranstaltungsdaten'
            );

            if (configSnap.exists()) {
                const data = configSnap.data();
                state.config = { ...state.config, ...data };
                if (data.downloads) state.downloads = data.downloads;
                if (state.config.title) {
                    document.getElementById('app-title').innerText = state.config.title;
                    document.title = state.config.title;
                }
                if (state.config.subtitle) document.getElementById('app-subtitle').innerText = state.config.subtitle;
            }

            if (sSnap.empty) {
                console.log("Firestore stations empty, using seed data");
                state.stations = [...seedStations];
            } else {
                state.stations = [];
                sSnap.forEach(doc => state.stations.push(doc.data()));
            }

            if (eSnap.empty) {
                console.log("Firestore events empty, using seed data");
                state.events = [...seedEvents];
            } else {
                state.events = [];
                eSnap.forEach(doc => state.events.push(doc.data()));
            }
            persistVisitorDataCache();
            lastRemoteLoadAt = Date.now();
            preloadVisitorImages();
        } catch (e) {
            console.warn("Firestore load failed (CORS/Offline?), keeping cached data.", e);
            if (!silent) showToast('Verbindungsproblem: Zeige lokale Daten.', 'info');
            if (!Array.isArray(state.stations) || !state.stations.length) state.stations = [...seedStations];
            if (!Array.isArray(state.events) || !state.events.length) state.events = [...seedEvents];
        }
    }
    renderLoadedData();

    // Deep link: open a station via ?station=28
    // Runs after data + UI are ready.
    try {
        const params = new URLSearchParams(window.location.search || '');
        const stationParam = params.get('station');
        if (stationParam) {
            const key = 'deep_link_station_handled';
            if (sessionStorage.getItem(key) !== String(stationParam)) {
                const station = Array.isArray(state.stations)
                    ? state.stations.find(x => String(x.id) === String(stationParam))
                    : null;

                if (!station) {
                    showToast('Station nicht gefunden', 'error');
                } else {
                    if (typeof window.flyToStation === 'function') {
                        window.flyToStation(Number(station.lat), Number(station.lng), station.id);
                    }
                    setTimeout(() => {
                        if (typeof window.openStation === 'function') window.openStation(stationParam);
                    }, 450);
                }

                sessionStorage.setItem(key, String(stationParam));
            }

            // Clean URL so refresh/back doesn't re-trigger.
            params.delete('station');
            const newQuery = params.toString();
            const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '') + window.location.hash;
            history.replaceState(null, '', newUrl);
        }
    } catch (e) { }

    // Lightweight auto-validation for stability (does not spam normal visitors)
    try {
        const stationIssues = validateStations(state.stations);
        const eventIssues = validateEvents(state.events, state.stations);
        state.validation = { stations: stationIssues, events: eventIssues };

        const totalIssues = stationIssues.length + eventIssues.length;
        const totalErrors = stationIssues.filter(i => i.severity === 'error').length + eventIssues.filter(i => i.severity === 'error').length;
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (isLocal && totalIssues > 0) {
            showToast(`Datencheck: ${totalIssues} Problem(e) (${totalErrors} Errors)`, totalErrors > 0 ? 'error' : 'info');
        }
    } catch (e) { }
}

export function refreshVisitorDataIfStale(maxAgeMs = 45000) {
    if (!navigator.onLine || state.useLocalStorage || !state.db) return Promise.resolve(false);
    if (refreshPromise) return refreshPromise;
    if (Date.now() - lastRemoteLoadAt < maxAgeMs) return Promise.resolve(false);
    refreshPromise = loadData({ silent: true })
        .then(() => true)
        .finally(() => { refreshPromise = null; });
    return refreshPromise;
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
        const { doc, getDoc, getDocFromServer } = state.fb;
        const docRef = doc(state.db, 'global', 'config');
        const readDocument = navigator.onLine && getDocFromServer ? getDocFromServer : getDoc;
        const docSnap = await withTimeout(readDocument(docRef), 'Jahreskonfiguration', 6000);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.activeYear) {
                state.appId = `lichternacht-${data.activeYear}`;
                console.log("Configured Year:", data.activeYear);
                document.querySelectorAll('.year-display').forEach(el => el.innerText = data.activeYear);
            }

            // Check for Reset Token (Client Wipe)
            if (data.resetToken) {
                const lastToken = localStorage.getItem('last_reset_token');
                if (!lastToken || Number(data.resetToken) > Number(lastToken)) {
                    console.log("Reset Token triggered! Wiping client data...");
                    
                    // Wipe specific keys
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key.startsWith('liked_') || key.startsWith('reached_')) {
                            keysToRemove.push(key);
                        }
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));
                    
                    localStorage.removeItem('visited_stations');
                    localStorage.removeItem('visited_station_log');
                    localStorage.removeItem('favorites');
                    localStorage.removeItem('last_broadcast_seen');
                    
                    // Save new token
                    localStorage.setItem('last_reset_token', data.resetToken);
                    
                    showToast("🎉 Neues Jahr! Deine Liste wurde zurückgesetzt.", 'info');
                    
                    // Refresh if needed (though usually this runs on startup)
                    if (window.refreshStationList) window.refreshStationList();
                }
            }

            if (applyLikesResetToken(localStorage, data.likesResetToken)) {
                console.log("Likes reset token triggered! Clearing local vote locks...");
                showToast("Likes wurden zurückgesetzt. Du kannst wieder abstimmen.", 'info');
                if (window.refreshStationList) window.refreshStationList();
            }
        } else {
            console.log("No global config found, using default:", state.appId);
        }
    } catch (e) {
        console.warn("Could not sync global config (offline?)", e);
    }
}

export function changeYear() {
    console.warn("changeYear is deprecated");
}
