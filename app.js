// --- VARIABLES ---
let map, userMarker, userLocation, routingControl;
let stations = [];
let events = [];
let markers = [];
let isAdmin = false;
window.activeStationId = null;
let activeEventId = null;
let activeTab = "map"; // Default tab
let favorites = new Set(); // IDs of favorite stations
let useLocalStorage = false;
let db, auth, appId;
let initializeApp, getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged, getFirestore, collection, doc, getDocs, setDoc, deleteDoc;
let serverTimestamp, query, where, getCountFromServer;

// --- SEED DATA ---
const seedStations = [
    // Example with image
    { id: 1, name: "Deutsches Pinsel- & Bürstenmuseum", desc: "Genussgalerie, Cocktails. Dinkelsbühler Str. 23", lat: 49.15714, lng: 10.5484, tags: ["drink", "food", "culture"], image: "https://images.unsplash.com/photo-1513883049090-d0b7439799bf?q=80&w=1000&auto=format&fit=crop" },
    { id: 2, name: "MSC Bechhofen", desc: "Kartoffelchips, Glühwein.", lat: 49.15724, lng: 10.54899, tags: ["food", "drink"] },
    { id: 3, name: "Bauernschänke", desc: "Wahrsagespiel. Schloßstr.", lat: 49.15706, lng: 10.54951, tags: ["drink", "culture"], time: "ab 18:00" },
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
    { id: 24, name: "Die Pinselfabrik", desc: "Big Band. Nähe Friedhof.", lat: 49.16019, lng: 10.55299, tags: ["culture", "event"], time: "18:00" },
    { id: 30, name: "EDEKA Däubler Stand", desc: "Ansbacher Str. / Inset", lat: 49.16093, lng: 10.55393, tags: ["food", "drink"] },
    { id: 28, name: "Schützenhaus", desc: "Griechisch. Ziegeleistr. 9", lat: 49.15934, lng: 10.55054, tags: ["food"] },
    { id: 29, name: "Accentra Outlet", desc: "Pestalozzistr. 11", lat: 49.16266, lng: 10.55194, tags: ["drink", "shop"] },
    { id: 6, name: "Grund- & Mittelschule", desc: "Pestalozzistr. 12", lat: 49.15784, lng: 10.55056, tags: ["food", "kids"] },
    { id: 8, name: "Pferdehof Hiemeyer", desc: "Pestalozzistr.", lat: 49.15791, lng: 10.54995, tags: ["kids", "drink", "food"] },
    { id: 34, name: "TSV 1898 Bechhofen", desc: "Sportheim. Party.", lat: 49.16455, lng: 10.56021, tags: ["party", "drink"], time: "ab 21:00" },
    { id: 31, name: "Fritz KUNDNER GmbH", desc: "Eisenbahnstr. 5A.", lat: 49.15833, lng: 10.54919, tags: ["shop", "food"] },
    { id: 32, name: "Regens Wagner", desc: "Freiherr-von-Drais-Str.", lat: 49.16213, lng: 10.55679, tags: ["food", "drink", "kids", "wc"] },
    { id: 33, name: "Behindertenarbeit e.V.", desc: "Freiherr-von-Drais-Str.", lat: 49.16465, lng: 10.55995, tags: ["food"] },
    { id: 25, name: "Slawa Markt", desc: "Schaschlik. Liebersdorfer Str.", lat: 49.15981, lng: 10.55253, tags: ["food", "drink"] },
    { id: 26, name: "Tanzschule SK-Danceworld", desc: "Innenhof. Party.", lat: 49.15913, lng: 10.55123, tags: ["food", "drink", "wc", "party"], time: "ab 20:00" },
    { id: 27, name: "La Piccola Romana (Str.)", desc: "Pizza. Seitenstr.", lat: 49.15906, lng: 10.55076, tags: ["food", "wc"] },
    { id: 7, name: "Lumis Hundesalon", desc: "Hot Dog.", lat: 49.15786, lng: 10.55016, tags: ["food", "drink"] },
    { id: 9, name: "RäucherNest", desc: "Pulledpork.", lat: 49.15794, lng: 10.54976, tags: ["food"] },
    { id: 4, name: "Rockabilly Ranch Saloon", desc: "Bar.", lat: 49.15712, lng: 10.55191, tags: ["food", "drink", "kids"] }
];

const seedEvents = [
    { id: "e1", time: "17:00", title: "Eröffnung", desc: "Johanniskirche", loc: "Kirche", color: "yellow", lat: 49.15796, lng: 10.55103 },
    { id: "e2", time: "18:00", title: "Big Band", desc: "Pinselfabrik", loc: "Pinselfabrik", color: "gray", lat: 49.16019, lng: 10.55299 },
    { id: "e3", time: "19:30", title: "Tanzgruppe", desc: "Amaya Luna", loc: "Pinselfabrik", color: "gray", lat: 49.16019, lng: 10.55299 },
    { id: "e4", time: "20:00", title: "Feuershow", desc: "Kirchplatz", loc: "Kirche", color: "purple", lat: 49.15796, lng: 10.55103 },
    { id: "e5", time: "21:00", title: "Party", desc: "TSV Sportheim", loc: "Sportheim", color: "red", lat: 49.16455, lng: 10.56021 }
];

// --- INITIALIZATION ---
window.onload = async () => {
    // 0. Service Worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./sw.js');
            console.log('SW registered');
        } catch (e) { console.log('SW fail', e); }
    }

    // Load Favorites
    const savedFavs = localStorage.getItem('favorites');
    if (savedFavs) favorites = new Set(JSON.parse(savedFavs));

    // Load Dark Mode
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark');
        updateDarkModeIcon(true);
    }

    initMap();
    updateCurrentEvent();
    setInterval(updateCurrentEvent, 30000); // Check every 30s

    // Tutorial Check
    if (!localStorage.getItem('tutorial_seen')) {
        document.getElementById('tutorial-modal').classList.remove('hidden');
    }

    const btn = document.getElementById('status-indicator');

    if (typeof __firebase_config !== 'undefined') {
        try {
            // Dynamic Import
            const fbApp = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
            const fbAuth = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
            const fbStore = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

            const firebaseConfig = JSON.parse(__firebase_config);
            if (firebaseConfig.apiKey === "API_KEY_HIER") throw new Error("No Configured API Key");

            const app = fbApp.initializeApp(firebaseConfig);
            auth = fbAuth.getAuth(app);
            db = fbStore.getFirestore(app);

            // Bind globals
            signInWithEmailAndPassword = fbAuth.signInWithEmailAndPassword;
            signOut = fbAuth.signOut;
            onAuthStateChanged = fbAuth.onAuthStateChanged;
            getFirestore = fbStore.getFirestore;
            collection = fbStore.collection;
            doc = fbStore.doc;
            getDocs = fbStore.getDocs;
            setDoc = fbStore.setDoc;
            deleteDoc = fbStore.deleteDoc;

            // Extended Firestore features
            window.updateDoc = fbStore.updateDoc;
            window.increment = fbStore.increment;
            window.getDoc = fbStore.getDoc;
            serverTimestamp = fbStore.serverTimestamp;
            query = fbStore.query;
            where = fbStore.where;
            getCountFromServer = fbStore.getCountFromServer;

            // --- DYNAMIC YEAR CONFIG ---
            await syncGlobalConfig();

            // --- PRESENCE SYSTEM ---
            initPresence();

            // Auth Listener
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    if (user.isAnonymous) {
                        console.log("User is anonymous");
                        setAdminState(false);
                    } else if (user.email === "michael@schellenberger.biz") {
                        console.log("User is admin (" + user.email + ")");
                        setAdminState(true);
                    } else {
                        console.log("User is authenticated but not admin");
                        setAdminState(false);
                    }
                    btn.innerText = "Online";
                    btn.classList.replace('text-gray-500', 'text-green-500');
                    showToast('Online-Modus aktiviert', 'success');
                    // Only load data if not already loaded or force refresh?
                    // For now, just load.
                    await loadData();
                } else {
                    // No user, sign in anonymously
                    signInAnonymously(auth).catch(e => {
                        console.error("Anon Auth Error", e);
                        enableOfflineMode(btn);
                    });
                }
            });

        } catch (e) {
            console.error("Auth Error", e);
            enableOfflineMode(btn);
        }
    } else {
        enableOfflineMode(btn);
    }
};

function enableOfflineMode(btn) {
    useLocalStorage = true;
    btn.innerText = "Lokal";
    btn.title = "Daten werden nur im Browser gespeichert";
    showToast('Lokal-Modus (kein Server)', 'info');
    loadData();
}

async function loadData() {
    if (useLocalStorage) {
        const sData = localStorage.getItem('stations_data');
        stations = sData ? JSON.parse(sData) : seedStations;
        const eData = localStorage.getItem('events_data');
        events = eData ? JSON.parse(eData) : seedEvents;
    } else {
        const sCol = collection(db, 'artifacts', appId, 'public', 'data', 'stations');
        const sSnap = await getDocs(sCol);
        stations = sSnap.empty ? seedStations : [];
        sSnap.forEach(doc => stations.push(doc.data()));

        const eCol = collection(db, 'artifacts', appId, 'public', 'data', 'events');
        const eSnap = await getDocs(eCol);
        events = eSnap.empty ? seedEvents : [];
        eSnap.forEach(doc => events.push(doc.data()));
    }
    refreshMapMarkers();
    renderList(stations);
    renderTimeline();
}

// --- TOAST SYSTEM ---
window.showToast = (msg, type = 'info') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? 'check-circle' : (type === 'error' ? 'warning-circle' : 'info');
    toast.innerHTML = `<i class="ph ph-${icon} text-xl"></i><span>${msg}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// --- MAP LOGIC ---
let tileLayer;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([49.158, 10.552], 16);
    const isDark = document.documentElement.classList.contains('dark');
    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    tileLayer = L.tileLayer(tileUrl, { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }).addTo(map);
}

function updateMapTiles(isDark) {
    if (tileLayer) map.removeLayer(tileLayer);
    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    tileLayer = L.tileLayer(tileUrl, { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }).addTo(map);
}

function refreshMapMarkers() {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
    stations.forEach(s => {
        const icon = L.divIcon({ className: 'custom-pin', html: `<div style="background-color: #f59e0b; color: #000; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-family: sans-serif;">${s.id}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
        const marker = L.marker([s.lat, s.lng], { icon: icon, draggable: isAdmin }).addTo(map);
        marker.on('dragend', async (e) => {
            if (!isAdmin) return;
            const p = e.target.getLatLng();
            s.lat = Number(p.lat.toFixed(5)); s.lng = Number(p.lng.toFixed(5));
            await saveData('station', s);
            showToast('Position aktualisiert', 'success');
        });
        marker.on('click', () => openModal(s));
        markers.push({ id: s.id, marker: marker });
    });
}

// --- DATA PERSISTENCE ---
async function saveData(type, item) {
    if (useLocalStorage) {
        if (type === 'station') localStorage.setItem('stations_data', JSON.stringify(stations));
        if (type === 'event') localStorage.setItem('events_data', JSON.stringify(events));
    } else {
        const colName = type === 'station' ? 'stations' : 'events';
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', colName);
        const data = JSON.parse(JSON.stringify(item));
        await setDoc(doc(colRef, item.id.toString()), data);
    }
}

async function deleteData(type, id) {
    if (useLocalStorage) {
        if (type === 'station') {
            stations = stations.filter(x => x.id != id);
            localStorage.setItem('stations_data', JSON.stringify(stations));
        }
        if (type === 'event') {
            events = events.filter(x => x.id != id);
            localStorage.setItem('events_data', JSON.stringify(events));
        }
    } else {
        const colName = type === 'station' ? 'stations' : 'events';
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', colName);
        await deleteDoc(doc(colRef, id.toString()));
    }
}

// --- ADMIN UI ---
window.toggleAdminLogin = () => { if (isAdmin) return; document.getElementById('login-modal').classList.toggle('hidden'); };

window.performLogin = async () => {
    const email = document.getElementById('admin-email').value;
    const pass = document.getElementById('admin-pass').value;

    if (!email || !pass) { showToast('Bitte Email und Passwort eingeben', 'error'); return; }

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        document.getElementById('login-modal').classList.add('hidden');
        showToast('Erfolgreich angemeldet', 'success');
    } catch (e) {
        console.error(e);
        showToast('Login fehlgeschlagen: ' + e.message, 'error');
    }
};

window.logoutAdmin = async () => {
    try {
        await signOut(auth);
        // Auth listener will catch this and sign in anonymously
        showToast('Abgemeldet', 'info');
    } catch (e) {
        console.error(e);
    }
};

// --- PRESENCE ---
const sessionId = crypto.randomUUID();

function initPresence() {
    if (useLocalStorage) return;

    const sendHeartbeat = async () => {
        try {
            // Write to: artifacts/{appId}/public/data/presence/{sessionId}
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'presence', sessionId);
            await setDoc(ref, { lastSeen: serverTimestamp() });
        } catch (e) { console.warn("Heartbeat failed", e); }
    };

    const updateUserCount = async () => {
        try {
            // Count docs where lastSeen > 5 minutes ago
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'presence');
            const q = query(colRef, where('lastSeen', '>', fiveMinAgo));
            const snapshot = await getCountFromServer(q);
            const count = snapshot.data().count;

            const el = document.getElementById('user-count');
            if (el) {
                el.querySelector('span').innerText = count;
                el.classList.remove('hidden');
                el.classList.add('flex');
            }
        } catch (e) { console.warn("Count failed", e); }
    };

    // Initial call
    sendHeartbeat();
    updateUserCount();

    // Loop (Heartbeat every 5m, Count every 2m)
    setInterval(sendHeartbeat, 5 * 60 * 1000);
    setInterval(updateUserCount, 2 * 60 * 1000);
}

async function syncGlobalConfig() {
    try {
        const docRef = doc(db, 'global', 'config');
        const docSnap = await window.getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.activeYear) {
                appId = `lichternacht-${data.activeYear}`;
                console.log("Configured Year:", data.activeYear);
                // Update UI Year if needed
                document.querySelectorAll('.year-display').forEach(el => el.innerText = data.activeYear);
            }
        } else {
            console.log("No global config found, using default:", appId);
        }
    } catch (e) {
        console.warn("Could not sync global config (offline?)", e);
    }
}

window.closeTutorial = () => {
    document.getElementById('tutorial-modal').classList.add('hidden');
    localStorage.setItem('tutorial_seen', 'true');
};

window.changeYear = async () => {
    const newYear = prompt("Neues Jahr eingeben (z.B. 2026).\nACHTUNG: Dies wechselt die Datenbank für ALLE Nutzer sofort!");
    if (!newYear || newYear.length !== 4) return;

    try {
        await setDoc(doc(db, 'global', 'config'), { activeYear: newYear }, { merge: true });
        alert(`Jahr auf ${newYear} geändert. Die Seite wird neu geladen.`);
        location.reload();
    } catch (e) {
        console.error(e);
        alert("Fehler beim Ändern des Jahres.");
    }
};

function setAdminState(admin) {
    isAdmin = admin;
    if (isAdmin) {
        document.body.classList.add('admin-mode');
        document.getElementById('admin-bar').classList.remove('hidden');
        document.getElementById('lock-icon').classList.replace('ph-lock-key', 'ph-lock-key-open');
        document.getElementById('lock-icon').classList.add('text-green-500');
    } else {
        document.body.classList.remove('admin-mode');
        document.getElementById('admin-bar').classList.add('hidden');
        document.getElementById('lock-icon').classList.replace('ph-lock-key-open', 'ph-lock-key');
        document.getElementById('lock-icon').classList.remove('text-green-500');
    }
    refreshMapMarkers();
    renderTimeline();
}

window.uploadSeedData = async () => {
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
};

window.resetApp = async () => {
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
};
window.toggleAdminPanel = () => {
    const p = document.getElementById('admin-panel');
    if (p.classList.contains('hidden')) {
        p.classList.remove('hidden');

        // Header
        let tsv = "TYPE\tID\tNAME_TITLE\tDESC\tOFFER\tLAT\tLNG\tTAGS_COLOR\tTIME\tIMAGE_LOC\n";

        // Stations
        stations.forEach(s => {
            tsv += `station\t${s.id}\t${esc(s.name)}\t${esc(s.desc)}\t${esc(s.offer || '')}\t${s.lat}\t${s.lng}\t${esc(s.tags.join(','))}\t${esc(s.time || '')}\t${esc(s.image || '')}\n`;
        });

        // Events
        events.forEach(e => {
            tsv += `event\t${e.id}\t${esc(e.title)}\t${esc(e.desc)}\t\t${e.lat}\t${e.lng}\t${esc(e.color)}\t${esc(e.time)}\t${esc(e.loc)}\n`;
        });

        document.getElementById('export-area').value = tsv;
    } else p.classList.add('hidden');
};

function esc(str) {
    if (!str) return "";
    return str.toString().replace(/\t/g, " ").replace(/\n/g, " [br] ");
}

window.importData = async () => {
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
};
window.handleAdminAdd = () => {
    if (activeTab === 'events') openEventModal();
    else addNewStation();
}

// --- UI ---
// --- UI ---
const tagMap = {
    food: "Essen", drink: "Trinken", wc: "WC", kids: "Kinder",
    culture: "Kultur", party: "Party", shop: "Laden", event: "Event"
};
const reverseTagMap = Object.fromEntries(Object.entries(tagMap).map(([k, v]) => [v, k]));

window.toggleLike = async (id) => {
    event.stopPropagation();
    const likedKey = `liked_${id}`;
    if (localStorage.getItem(likedKey)) {
        showToast('Du hast bereits abgestimmt!', 'info');
        return;
    }

    // Optimistic UI update
    const s = stations.find(x => x.id == id);
    if (s) {
        s.likes = (s.likes || 0) + 1;
        updateLikeBtn(id, s.likes);
        // Update list item count if visible
        const listEl = document.getElementById(`like-count-${id}`);
        if (listEl) listEl.innerHTML = `<i class="ph-fill ph-fire text-orange-500 text-xs mr-0.5"></i>${s.likes}`;
    }

    localStorage.setItem(likedKey, 'true');
    showToast('Danke für deine Stimme!', 'success');

    if (!useLocalStorage && window.updateDoc && window.increment) {
        try {
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'stations', id.toString());
            await window.updateDoc(ref, { likes: window.increment(1) });
        } catch (e) { console.error("Like Error", e); }
    }
};

function updateLikeBtn(id, count) {
    const btn = document.getElementById('modal-like-btn');
    if (!btn) return;
    const isLiked = localStorage.getItem(`liked_${id}`);
    btn.innerHTML = `<i class="ph ${isLiked ? 'ph-fill' : ''} ph-fire text-xl ${isLiked ? 'text-orange-500' : 'text-gray-400'}"></i><span class="ml-1 text-xs font-bold ${isLiked ? 'text-orange-600' : 'text-gray-500'}">${count || 0}</span>`;
    if (isLiked) btn.classList.add('bg-orange-50', 'border-orange-200');
}

window.openModal = (s) => {
    window.activeStationId = s.id;
    document.getElementById('modal-number').innerText = s.id;
    document.getElementById('modal-title').innerText = s.name;
    document.getElementById('modal-subtitle').innerText = s.tags.map(t => tagMap[t] || t).join(' • ').toUpperCase();

    // --- GAMIFICATION ---
    let visitedStations = new Set();
    try {
        const saved = localStorage.getItem('visited_stations');
        if (saved) visitedStations = new Set(JSON.parse(saved));
    } catch (e) { }

    window.checkIn = (id) => {
        if (visitedStations.has(id)) return;

        if (!userLocation) {
            window.locateUser(() => window.checkIn(id));
            return;
        }

        const s = stations.find(x => x.id == id);
        if (!s) return;

        // Calc distance
        const dist = getDistance(userLocation.lat, userLocation.lng, s.lat, s.lng);
        if (dist > 0.2) { // 200m radius (generous)
            showToast(`Du bist zu weit weg! (${(dist * 1000).toFixed(0)}m)`, 'error');
            return;
        }

        visitedStations.add(id);
        localStorage.setItem('visited_stations', JSON.stringify([...visitedStations]));

        updatePassProgress();
        updateCheckInBtn(id);
        showToast('Check-in erfolgreich! 🏆', 'success');

        // Confetti or reward logic here
        if (visitedStations.size === 10) alert("Glückwunsch! Du hast 10 Stationen besucht! Zeige diesen Screen für eine Überraschung.");
    };

    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function updatePassProgress() {
        const count = visitedStations.size;
        const el = document.getElementById('pass-progress');
        if (el) el.innerHTML = `<i class="ph-fill ph-trophy text-yellow-500 mr-1"></i><span class="font-bold">${count}</span>`;
    }

    function updateCheckInBtn(id) {
        const btn = document.getElementById('checkin-btn');
        if (!btn) return;

        if (visitedStations.has(id)) {
            btn.innerHTML = `<i class="ph-fill ph-check-circle text-green-500 text-xl mr-2"></i><span class="text-green-600 font-bold">Besucht</span>`;
            btn.disabled = true;
            btn.classList.add('bg-green-50', 'border-green-200');
            btn.classList.remove('bg-white', 'hover:bg-gray-50');
        } else {
            btn.innerHTML = `<i class="ph ph-map-pin text-xl mr-2"></i><span>Einchecken</span>`;
            btn.disabled = false;
            btn.classList.remove('bg-green-50', 'border-green-200');
            btn.classList.add('bg-white', 'hover:bg-gray-50');
        }
    }

    // ... inside openModal ...
    updateModalFavBtn(s.id);
    updateLikeBtn(s.id, s.likes);
    updateCheckInBtn(s.id); // Update CheckIn Button

    // Description & Offer (Safe HTML generation)
    let content = `<p class="font-bold text-gray-800 dark:text-gray-200 mb-2"><i class="ph-fill ph-map-pin text-yellow-600 mr-1"></i>${escapeHTML(s.desc)}</p>`;
    if (s.offer) content += `<div class="text-gray-600 dark:text-gray-300 mt-3 border-l-2 border-yellow-500 pl-3 italic">${escapeHTML(s.offer).replace(/\n/g, '<br>')}</div>`;
    if (s.time) content += `<p class="text-yellow-700 dark:text-yellow-500 font-bold mt-4 flex items-center"><i class="ph-fill ph-clock mr-1"></i>${escapeHTML(s.time)} Uhr</p>`;

    document.getElementById('modal-desc').innerHTML = content;

    // Image Logic with Placeholder
    const imgCont = document.getElementById('modal-image-container');

    if (s.image) {
        imgCont.innerHTML = `<img id="modal-image" src="${s.image}" class="w-full h-56 object-contain bg-white">`;
        imgCont.classList.remove('hidden');
    } else {
        // Placeholder
        imgCont.innerHTML = `<div class="w-full h-40 bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-500"><i class="ph ph-image text-5xl"></i></div>`;
        imgCont.classList.remove('hidden');
    }

    document.getElementById('modal-view-mode').classList.remove('hidden');
    document.getElementById('modal-edit-mode').classList.add('hidden');

    document.getElementById('btn-route').onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`, '_blank');
    document.getElementById('btn-internal-route').onclick = () => { window.switchTab('map'); window.closeModal(); if (!userLocation) window.locateUser(() => window.calculateRoute(s.lat, s.lng)); else window.calculateRoute(s.lat, s.lng); };
    document.getElementById('detail-modal').classList.remove('hidden');
    requestAnimationFrame(() => document.getElementById('modal-content').classList.remove('translate-y-full'));
};

window.editStation = () => {
    const s = stations.find(x => x.id == window.activeStationId);
    if (!s) return;
    document.getElementById('modal-view-mode').classList.add('hidden');
    document.getElementById('modal-edit-mode').classList.remove('hidden');
    document.getElementById('edit-name').value = s.name;
    document.getElementById('edit-desc').value = s.desc;
    document.getElementById('edit-offer').value = s.offer || ''; // New Field
    // Show German tags in input
    document.getElementById('edit-tags').value = s.tags.map(t => tagMap[t] || t).join(', ');
    document.getElementById('edit-time').value = s.time || '';
    document.getElementById('edit-image').value = s.image || '';
    renderTagHelper(s.tags);

    // Setup Drag & Drop
    setupDragDrop();
};

function setupDragDrop() {
    const dropZone = document.getElementById('image-upload-btn');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('bg-gray-200'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('bg-gray-200'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files[0]) {
            const input = document.getElementById('image-upload');
            input.files = files;
            window.handleImageUpload(input);
        }
    }
}

window.saveStationChanges = async () => {
    const s = stations.find(x => x.id == window.activeStationId);
    if (!s) return;
    s.name = document.getElementById('edit-name').value;
    s.desc = document.getElementById('edit-desc').value;
    s.offer = document.getElementById('edit-offer').value; // New Field
    // Map back to English keys
    s.tags = document.getElementById('edit-tags').value.split(',')
        .map(t => t.trim())
        .filter(t => t)
        .map(t => reverseTagMap[t] || t); // Translate back

    s.time = document.getElementById('edit-time').value || null;
    s.image = document.getElementById('edit-image').value || null;

    await saveData('station', s);
    showToast('Station gespeichert', 'success');
    renderList(stations);
    openModal(s);
};

window.addNewStation = async () => {
    const newId = Math.max(...stations.map(s => s.id), 0) + 1;
    const c = map.getCenter();
    const ns = { id: newId, name: "Neue Station", desc: "...", lat: Number(c.lat.toFixed(5)), lng: Number(c.lng.toFixed(5)), tags: ["food"] };
    stations.push(ns);
    await saveData('station', ns);
    refreshMapMarkers();
    renderList(stations);
    openModal(ns);
    editStation();
    showToast('Station erstellt', 'success');
};

window.deleteStation = async () => {
    if (!confirm("Löschen?")) return;
    await deleteData('station', window.activeStationId);
    stations = stations.filter(x => x.id != window.activeStationId);
    refreshMapMarkers();
    renderList(stations);
    closeModal();
    showToast('Station gelöscht', 'info');
};

// Tags Helper
function renderTagHelper(currentTags) {
    const container = document.getElementById('available-tags');
    container.innerHTML = '';
    const allTags = new Set();
    stations.forEach(s => s.tags.forEach(t => allTags.add(t)));
    if (allTags.size === 0) ['food', 'drink', 'wc', 'kids'].forEach(t => allTags.add(t));
    allTags.forEach(tag => {
        const btn = document.createElement('span');
        btn.className = `tag-badge px-2 py-1 rounded border text-xs font-bold cursor-pointer select-none ${currentTags.includes(tag) ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'}`;
        btn.innerText = tagMap[tag] || tag;
        btn.onclick = () => toggleTag(tag);
        container.appendChild(btn);
    });
}
window.toggleTag = (tag) => {
    const input = document.getElementById('edit-tags');
    // Parse current input (German) back to keys to manipulate
    let current = input.value.split(',')
        .map(t => t.trim())
        .filter(t => t)
        .map(t => reverseTagMap[t] || t);

    if (current.includes(tag)) current = current.filter(t => t !== tag);
    else current.push(tag);

    // Write back as German
    input.value = current.map(t => tagMap[t] || t).join(', ');
    renderTagHelper(current);
};

// Standard functions (Lists, Filters, Events)
window.openHelpModal = () => { document.getElementById('help-modal').classList.remove('hidden'); };
window.closeHelpModal = () => { document.getElementById('help-modal').classList.add('hidden'); };

window.closeModal = () => { document.getElementById('modal-content').classList.add('translate-y-full'); setTimeout(() => document.getElementById('detail-modal').classList.add('hidden'), 300); };
window.switchTab = (tabName) => {
    activeTab = tabName;
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    document.querySelectorAll('.bottom-nav > div').forEach(el => { el.classList.remove('tab-active'); el.classList.add('tab-inactive'); el.classList.replace('text-yellow-600', 'text-gray-500'); });
    document.getElementById(`nav-${tabName}`).classList.remove('tab-inactive'); document.getElementById(`nav-${tabName}`).classList.add('tab-active');
    if (tabName === 'map' && map) setTimeout(() => map.invalidateSize(), 200);
};
window.filterList = (category) => {
    document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('bg-yellow-600', 'text-white', 'shadow-sm'); b.classList.add('bg-white', 'text-gray-700', 'border'); });
    event.target.classList.remove('bg-white', 'text-gray-700', 'border'); event.target.classList.add('bg-yellow-600', 'text-white', 'shadow-sm');
    const search = document.getElementById('search-input').value.toLowerCase();
    const filtered = stations.filter(s => {
        const matchesCat = category === 'all' || (category === 'favorites' ? favorites.has(s.id) : s.tags.includes(category));
        const matchesSearch = s.name.toLowerCase().includes(search) || s.desc.toLowerCase().includes(search);
        return matchesCat && matchesSearch;
    });
    renderList(filtered);
};
window.toggleFavorite = (id, fromModal = false) => {
    event.stopPropagation();
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    localStorage.setItem('favorites', JSON.stringify([...favorites]));

    if (fromModal) {
        updateModalFavBtn(id);
        // Refresh list in background
        const currentFilterBtn = document.querySelector('.filter-btn.bg-yellow-600');
        if (currentFilterBtn) currentFilterBtn.click();
    } else {
        // Refresh list item only (optimization) or full list
        const currentFilterBtn = document.querySelector('.filter-btn.bg-yellow-600');
        if (currentFilterBtn) currentFilterBtn.click();
    }
    showToast(favorites.has(id) ? 'Zu Favoriten hinzugefügt. (Siehe Liste -> Favoriten)' : 'Aus Favoriten entfernt', 'success');
};

function updateModalFavBtn(id) {
    const btn = document.getElementById('modal-fav-btn');
    const icon = btn.querySelector('i');
    // Reset base classes to ensure consistency
    icon.className = 'ph ph-heart text-2xl transition-colors';

    if (favorites.has(id)) {
        icon.classList.add('ph-fill', 'text-red-500');
        btn.classList.add('bg-red-50');
        btn.classList.remove('text-gray-400');
    } else {
        icon.classList.remove('ph-fill', 'text-red-500');
        btn.classList.remove('bg-red-50');
        btn.classList.add('text-gray-400');
    }
}

// Security: Escape HTML
function escapeHTML(str) {
    if (!str) return "";
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.renderList = (items) => {
    const list = document.getElementById('stations-list');
    list.innerHTML = '';
    if (items.length === 0) { list.innerHTML = '<div class="text-center text-gray-500 mt-10 dark:text-gray-400">Keine Ergebnisse.</div>'; return; }
    items.forEach(s => {
        const el = document.createElement('div');
        el.className = 'bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex gap-4 items-center active:bg-gray-50 dark:active:bg-gray-700 transition-colors cursor-pointer relative overflow-hidden';
        el.onclick = () => openModal(s);

        // Image Thumbnail or Placeholder
        let imgHtml = '';
        if (s.image) {
            imgHtml = `<div class="w-10 h-10 rounded-lg bg-gray-200 flex-shrink-0 overflow-hidden border border-gray-300 dark:border-gray-600 mr-3"><img src="${s.image}" loading="lazy" class="w-full h-full object-cover"></div>`;
        } else {
            imgHtml = `<div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center border border-gray-200 dark:border-gray-600 mr-3 text-gray-400 dark:text-gray-500"><i class="ph ph-image text-xl"></i></div>`;
        }

        let iconHtml = '';
        if (s.tags.includes('wc')) iconHtml += '<i class="ph ph-toilet text-blue-500 ml-2 text-lg"></i>';
        if (s.tags.includes('kids')) iconHtml += '<i class="ph ph-baby text-pink-500 ml-2 text-lg"></i>';

        const isFav = favorites.has(s.id);
        // Fix: Use ph-fill class for filled heart
        const favIconClass = isFav ? 'ph-fill ph-heart text-red-500' : 'ph-heart text-gray-300 dark:text-gray-500 hover:text-red-400';

        const likeCountHtml = s.likes ? `<span id="like-count-${s.id}" class="ml-2 flex items-center text-xs text-orange-500 font-bold bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded"><i class="ph-fill ph-fire mr-0.5"></i>${s.likes}</span>` : `<span id="like-count-${s.id}"></span>`;

        el.innerHTML = `
            <div class="flex-shrink-0 w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center font-bold text-white shadow-md border border-yellow-400 mr-3">${s.id}</div>
            ${imgHtml}
            <div class="flex-grow min-w-0">
                <div class="flex flex-wrap items-center mb-1"><h3 class="font-bold text-gray-900 dark:text-gray-100 text-sm mr-1 truncate">${escapeHTML(s.name)}</h3>${likeCountHtml}${iconHtml}</div>
                <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">${escapeHTML(s.desc)}</p>
            </div>
            <button onclick="toggleFavorite(${s.id})" class="p-2 z-10"><i class="ph ${favIconClass} text-xl transition-colors"></i></button>
        `;
        list.appendChild(el);
    });
};
document.getElementById('search-input').addEventListener('input', () => document.querySelector('.filter-btn.bg-yellow-600').click());

// --- IMAGE HANDLING ---
window.handleImageUpload = (input) => {
    if (input.files && input.files[0]) {
        setLoading(true, "Verarbeite Bild...");
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                document.getElementById('edit-image').value = dataUrl;
                showToast('Bild verarbeitet', 'success');
                setLoading(false);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
};

// --- UX HELPERS ---
function setLoading(active, text = "Lade...") {
    const el = document.getElementById('loading-overlay');
    const txt = document.getElementById('loading-text');
    if (active) {
        txt.innerText = text;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

// Geolocation
window.locateUser = (cb) => {
    if (!navigator.geolocation) { showToast("Kein GPS verfügbar", 'error'); return; }
    setLoading(true, "Suche GPS...");
    document.getElementById('status-indicator').innerText = "Suche...";
    navigator.geolocation.getCurrentPosition(pos => {
        setLoading(false);
        const lat = pos.coords.latitude; const lng = pos.coords.longitude; userLocation = { lat, lng };
        if (userMarker) userMarker.setLatLng([lat, lng]);
        else { const icon = L.divIcon({ html: '<div style="width:18px;height:18px;background:#2563eb;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #2563eb"></div>', className: 'user-loc', iconSize: [18, 18] }); userMarker = L.marker([lat, lng], { icon: icon }).addTo(map); }
        if (!routingControl) map.setView([lat, lng], 18);
        document.getElementById('status-indicator').innerText = "Verbunden"; if (cb) cb();
        showToast("Standort gefunden", 'success');
    }, err => {
        setLoading(false);
        showToast("GPS Fehler", 'error');
        document.getElementById('status-indicator').innerText = "GPS Fehler";
    });
};
window.resetMap = () => { map.setView([49.158, 10.552], 16); window.clearRoute(); };
window.calculateRoute = (dLat, dLng) => {
    if (!userLocation) return;
    setLoading(true, "Berechne Route...");
    window.clearRoute();
    document.getElementById('route-info').classList.remove('hidden');
    routingControl = L.Routing.control({
        waypoints: [L.latLng(userLocation.lat, userLocation.lng), L.latLng(dLat, dLng)],
        router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
        lineOptions: { styles: [{ color: '#3b82f6', opacity: 0.8, weight: 6 }] },
        show: false, addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: true
    }).addTo(map);

    // Routing Machine hat kein einfaches "loaded" event, wir faken es kurz
    setTimeout(() => setLoading(false), 1000);
};
window.clearRoute = () => { if (routingControl) { map.removeControl(routingControl); routingControl = null; } document.getElementById('route-info').classList.add('hidden'); };
window.startInternalNav = (lat, lng) => { window.switchTab('map'); window.closeModal(); if (!userLocation) window.locateUser(() => window.calculateRoute(lat, lng)); else window.calculateRoute(lat, lng); };

// Events CRUD (kept brief)
window.openEventModal = (evtId) => {
    document.getElementById('event-modal').classList.remove('hidden');
    if (evtId) {
        activeEventId = evtId;
        const e = events.find(x => x.id == evtId);
        document.getElementById('evt-time').value = e.time; document.getElementById('evt-title').value = e.title;
        document.getElementById('evt-desc').value = e.desc; document.getElementById('evt-loc').value = e.loc;
        document.getElementById('evt-color').value = e.color; document.getElementById('evt-lat').value = e.lat; document.getElementById('evt-lng').value = e.lng;
        document.getElementById('btn-delete-event').classList.remove('hidden');
    } else {
        activeEventId = null; document.getElementById('evt-time').value = ""; document.getElementById('evt-title').value = ""; document.getElementById('evt-desc').value = "";
        document.getElementById('evt-loc').value = ""; document.getElementById('evt-color').value = "yellow"; document.getElementById('evt-lat').value = ""; document.getElementById('evt-lng').value = "";
        document.getElementById('btn-delete-event').classList.add('hidden');
    }
};
window.closeEventModal = () => document.getElementById('event-modal').classList.add('hidden');
window.fillEventCoords = () => { const c = map.getCenter(); document.getElementById('evt-lat').value = c.lat.toFixed(5); document.getElementById('evt-lng').value = c.lng.toFixed(5); };
window.saveEventChanges = async () => {
    const newData = { id: activeEventId || "e" + Date.now(), time: document.getElementById('evt-time').value, title: document.getElementById('evt-title').value, desc: document.getElementById('evt-desc').value, loc: document.getElementById('evt-loc').value, color: document.getElementById('evt-color').value, lat: Number(document.getElementById('evt-lat').value) || 49.158, lng: Number(document.getElementById('evt-lng').value) || 10.552 };
    if (activeEventId) { const idx = events.findIndex(x => x.id == activeEventId); if (idx >= 0) events[idx] = newData; } else events.push(newData);
    events.sort((a, b) => a.time.localeCompare(b.time));
    await saveData('event', newData); renderTimeline(); closeEventModal(); showToast('Event gespeichert', 'success');
};
window.deleteEvent = async () => { if (!confirm("Löschen?")) return; await deleteData('event', activeEventId); events = events.filter(x => x.id != activeEventId); renderTimeline(); closeEventModal(); showToast('Event gelöscht', 'info'); };
window.renderTimeline = () => {
    const container = document.getElementById('timeline-container');
    container.innerHTML = events.map(e => `
        <div class="mb-8 relative group">
            <div class="absolute -left-[31px] bg-gray-50 border-2 border-${e.color}-500 w-4 h-4 rounded-full"></div>
            <div class="flex justify-between items-start">
                <div><span class="text-${e.color}-600 font-bold text-sm">${e.time} Uhr</span><h4 class="text-gray-900 font-bold text-lg">${e.title}</h4><p class="text-gray-600 text-sm mt-1">${e.desc}</p><div class="mt-2 inline-block bg-white border border-gray-200 px-2 py-1 rounded text-xs text-gray-500 shadow-sm"><i class="ph ph-map-pin mr-1"></i>${e.loc}</div></div>
                <div class="flex flex-col gap-2"><button onclick="window.startInternalNav(${e.lat}, ${e.lng})" class="bg-${e.color}-100 hover:bg-${e.color}-200 text-${e.color}-700 p-2 rounded-lg shadow-sm border border-${e.color}-200 transition-colors"><i class="ph ph-arrow-bend-up-right text-xl"></i></button>${isAdmin ? `<button onclick="window.openEventModal('${e.id}')" class="bg-gray-800 text-white p-2 rounded-lg shadow-sm"><i class="ph ph-pencil-simple text-xl"></i></button>` : ''}</div>
            </div>
        </div>`).join('');
};
function updateCurrentEvent() {
    const now = new Date();
    // Fake Datum für Demo wenn wir nicht am 22.11. sind
    // const now = new Date("2025-11-22T18:30:00"); 

    const currentH = now.getHours();
    const currentM = now.getMinutes();
    const timeVal = currentH * 60 + currentM;

    // Finde aktuelles Event
    let active = null;
    let next = null;

    // Sort events by time
    const sorted = [...events].sort((a, b) => {
        const [h1, m1] = a.time.split(':').map(Number);
        const [h2, m2] = b.time.split(':').map(Number);
        return (h1 * 60 + m1) - (h2 * 60 + m2);
    });

    for (let i = 0; i < sorted.length; i++) {
        const e = sorted[i];
        const [h, m] = e.time.split(':').map(Number);
        const eTime = h * 60 + m;

        if (timeVal >= eTime) {
            active = e;
        } else {
            if (!next) next = e;
        }
    }

    let html = '';
    if (active) {
        html += `<span class="inline-block bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded mb-1 animate-pulse">JETZT</span>
                 <p class="font-bold leading-tight text-white text-sm">${active.title}</p>
                 <p class="text-xs text-white/80">${active.loc}</p>`;
    }

    if (next) {
        html += `<div class="mt-2 pt-2 border-t border-white/20">
                 <span class="inline-block bg-white/20 text-white text-[10px] font-bold px-1 rounded mb-0.5">BALD (${next.time})</span>
                 <p class="font-medium leading-tight text-white text-xs">${next.title}</p>
                 </div>`;
    }

    if (!active && !next) {
        html = `<p class="text-sm text-white/90">Keine Events mehr heute.</p>`;
    }

    document.getElementById('current-event-display').innerHTML = html;
}

// --- DARK MODE & SHARE ---
window.toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    updateDarkModeIcon(isDark);
    updateMapTiles(isDark);
};

function updateDarkModeIcon(isDark) {
    const icon = document.getElementById('dark-mode-icon');
    if (isDark) {
        icon.classList.replace('ph-moon', 'ph-sun');
        icon.classList.add('text-yellow-400');
    } else {
        icon.classList.replace('ph-sun', 'ph-moon');
        icon.classList.remove('text-yellow-400');
    }
}

window.shareStation = async (id) => {
    const s = stations.find(x => x.id == id);
    if (!s) return;

    const shareData = {
        title: `Lichternacht: ${s.name}`,
        text: `Komm zur Station ${s.id}: ${s.name}!\n${s.desc}`,
        url: window.location.href
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
            showToast('Link kopiert!', 'success');
        }
    } catch (err) {
        console.error('Share failed', err);
    }
};
