import { state } from './state.js';
import { showToast } from './utils.js';

export const seedStations = [
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

export const seedEvents = [
    { id: "e1", time: "17:00", title: "Eröffnung", desc: "Johanniskirche", loc: "Kirche", color: "yellow", lat: 49.15796, lng: 10.55103 },
    { id: "e2", time: "18:00", title: "Big Band", desc: "Pinselfabrik", loc: "Pinselfabrik", color: "gray", lat: 49.16019, lng: 10.55299 },
    { id: "e3", time: "19:30", title: "Tanzgruppe", desc: "Amaya Luna", loc: "Pinselfabrik", color: "gray", lat: 49.16019, lng: 10.55299 },
    { id: "e4", time: "20:00", title: "Feuershow", desc: "Kirchplatz", loc: "Kirche", color: "purple", lat: 49.15796, lng: 10.55103 },
    { id: "e5", time: "21:00", title: "Party", desc: "TSV Sportheim", loc: "Sportheim", color: "red", lat: 49.16455, lng: 10.56021 }
];

export async function loadData() {
    if (state.useLocalStorage) {
        const sData = localStorage.getItem('stations_data');
        state.stations = sData ? JSON.parse(sData) : seedStations;
        const eData = localStorage.getItem('events_data');
        state.events = eData ? JSON.parse(eData) : seedEvents;
    } else {
        try {
            const { collection, getDocs, doc, getDoc } = state.fb;

            // Load Config & Downloads
            try {
                const configSnap = await getDoc(doc(state.db, 'artifacts', state.appId, 'public', 'config'));
                if (configSnap.exists()) {
                    const data = configSnap.data();
                    state.config = { ...state.config, ...data };
                    if (data.downloads) state.downloads = data.downloads;

                    // Apply Config to UI
                    if (state.config.title) {
                        document.getElementById('app-title').innerText = state.config.title;
                        document.title = state.config.title;
                    }
                    if (state.config.subtitle) document.getElementById('app-subtitle').innerText = state.config.subtitle;
                }
            } catch (e) { console.warn("Config load error", e); }

            const sCol = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'stations');
            const sSnap = await getDocs(sCol);
            
            if (sSnap.empty) {
                console.log("Firestore stations empty, using seed data");
                state.stations = [...seedStations];
            } else {
                state.stations = [];
                sSnap.forEach(doc => state.stations.push(doc.data()));
            }

            const eCol = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'events');
            const eSnap = await getDocs(eCol);
            
            if (eSnap.empty) {
                console.log("Firestore events empty, using seed data");
                state.events = [...seedEvents];
            } else {
                state.events = [];
                eSnap.forEach(doc => state.events.push(doc.data()));
            }
        } catch (e) {
            console.warn("Firestore load failed (CORS/Offline?), falling back to seed data.", e);
            showToast('Verbindungsproblem: Zeige lokale Daten.', 'info');
            state.stations = seedStations;
            state.events = seedEvents;
        }
    }
    if (window.refreshMapMarkers) window.refreshMapMarkers();
    if (window.renderList) window.renderList(state.stations);
    if (window.renderTimeline) window.renderTimeline();
    if (window.renderFilterBar) window.renderFilterBar();
    if (window.checkPlanningMode) window.checkPlanningMode();
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
                state.appId = `lichternacht-${data.activeYear}`;
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

export function changeYear() {
    console.warn("changeYear is deprecated");
}

