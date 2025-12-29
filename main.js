import { state } from './js/state.js';
import { shareStation, showToast } from './js/utils.js?v=1.4.36';
import { initFirebase } from './js/firebase-init.js?v=1.4.36';
import { initMap, updateMapTiles, locateUser, calculateRoute, resetMap, refreshMapMarkers } from './js/map.js?v=1.4.36';
import { loadData, syncGlobalConfig } from './js/data.js?v=1.4.36';
import { initAuthListener, performLogin, logoutAdmin, createNewUser } from './js/auth.js?v=1.4.36';
import { initPresence, toggleLike, toggleFavorite, checkIn, checkProximity, executeSmartAction } from './js/gamification.js?v=1.4.36';
import {
    openModal, closeModal, switchTab, toggleDarkMode, updateDarkModeIcon,
    openHelpModal, closeHelpModal, saveStationChanges, deleteStation,
    handleImageUpload, editStation, openEventModal, closeEventModal,
    fillEventCoords, saveEventChanges, deleteEvent, filterStations, filterList, generateICS, searchAddress,
    fillStationCoords, searchStationAddress, createEventForStation, clearStationImage, startStationPicker,
    openBugReportModal, submitBugReport, editEvent, applyStationToEvent,
    renderList, renderTimeline, renderFilterBar, openStation, startEventPicker, refreshStationList
} from './js/ui.js?v=1.4.36';
import {
    uploadSeedData, toggleAdminPanel, importData, handleAdminAdd, dumpData, downloadDataJs, uploadFlyer, saveDownloads, sendBroadcast, saveAppConfig, resetLikes, deleteUser, saveTrackingConfig
} from './js/admin.js?v=1.4.36';

// Bind to Window for HTML access
const APP_VERSION = "1.4.36";
console.log(`Lichternacht App v${APP_VERSION} loaded`);
window.state = state; // Explicitly bind state to window
window.showToast = showToast;

// Forced Reload Mechanism for Major Updates
const lastVersion = localStorage.getItem('app_version');
if (lastVersion !== APP_VERSION) {
    console.log(`Version changed from ${lastVersion} to ${APP_VERSION}. Cleaning up...`);
    localStorage.setItem('app_version', APP_VERSION);
    // Optional: clear specific caches if needed, but SW update usually handles it.
}
window.performLogin = performLogin;
window.logoutAdmin = logoutAdmin;
window.createNewUser = createNewUser;
window.uploadSeedData = uploadSeedData;
window.toggleAdminPanel = toggleAdminPanel;
window.importData = importData;
window.handleAdminAdd = handleAdminAdd;
window.dumpData = dumpData;
window.downloadDataJs = downloadDataJs;
window.uploadFlyer = uploadFlyer;
window.saveDownloads = saveDownloads;
window.saveAppConfig = saveAppConfig;
window.saveTrackingConfig = saveTrackingConfig;
window.sendBroadcast = sendBroadcast;
window.resetLikes = resetLikes;
window.deleteUser = deleteUser;
window.toggleLike = toggleLike;
window.toggleFavorite = toggleFavorite;
window.checkIn = checkIn;
window.checkProximity = checkProximity;
window.executeSmartAction = executeSmartAction;
window.openModal = openModal;
window.closeModal = closeModal;

// PWA Install Prompt Logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Show Install Button in Tutorial/Header if applicable
    const installBtn = document.getElementById('btn-pwa-install');
    if (installBtn) {
        installBtn.classList.remove('hidden');
        installBtn.onclick = async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to install prompt: ${outcome}`);
                deferredPrompt = null;
                installBtn.classList.add('hidden');
            }
        };
    }
    console.log("PWA Install Prompt captured");
});

// Navigation Bindings (Robust)
window.switchTab = (tab) => {
    console.log("window.switchTab called", tab);
    switchTab(tab);
};
window.appSwitchTab = window.switchTab; // Alias for safety

window.flyToStation = (lat, lng) => {
    if (state.map) {
        state.map.flyTo([lat, lng], 18);
        window.switchTab('map');
    } else {
        console.error("Map not initialized");
    }
};

window.toggleDarkMode = () => {
    toggleDarkMode();
    updateMapTiles(document.documentElement.classList.contains('dark'));
};
window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.saveStationChanges = saveStationChanges;
window.deleteStation = deleteStation;
window.handleImageUpload = handleImageUpload;
window.editStation = editStation;
window.createEventForStation = createEventForStation;
window.editEvent = editEvent;
window.applyStationToEvent = applyStationToEvent;
window.clearStationImage = clearStationImage;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.fillEventCoords = fillEventCoords;
window.fillStationCoords = fillStationCoords;
window.searchStationAddress = searchStationAddress;
window.startStationPicker = startStationPicker;
window.saveEventChanges = saveEventChanges;
window.deleteEvent = deleteEvent;
window.shareStation = shareStation;
window.filterStations = filterStations;
window.filterList = filterList;
window.locateUser = locateUser;
window.calculateRoute = calculateRoute;
window.resetMap = resetMap;
window.refreshMapMarkers = refreshMapMarkers;
window.generateICS = generateICS;
window.searchAddress = searchAddress;
window.openBugReportModal = openBugReportModal;
window.submitBugReport = submitBugReport;
window.renderList = renderList;
window.renderTimeline = renderTimeline;
window.renderFilterBar = renderFilterBar;
window.openStation = openStation;
window.startEventPicker = startEventPicker;
window.addNewTag = window.addNewTag; // Already on window from ui.js, but for completeness/clarity if we move to exports later.
// Actually ui.js assigns it to window.addNewTag.
// Let's just ensuring it's not overridden or lost.


window.closeTutorial = () => {
    document.getElementById('tutorial-modal').classList.add('hidden');
    localStorage.setItem('tutorial_seen', 'true');
};

window.toggleAdminLogin = () => {
    if (state.isAdmin) {
        toggleAdminPanel();
        return;
    }
    document.getElementById('login-modal').classList.toggle('hidden');
};

window.onload = async () => {
    // Load Favorites
    const savedFavs = localStorage.getItem('favorites');
    if (savedFavs) state.favorites = new Set(JSON.parse(savedFavs));

    // Load Dark Mode
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark');
        updateDarkModeIcon(true);
    }
    // Search
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterStations(e.target.value));
    }

    // Notifications: Request permission on first user interaction
    const requestNotif = () => {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
        document.removeEventListener('click', requestNotif);
    };
    document.addEventListener('click', requestNotif);

    // Check for upcoming events every minute
    setInterval(checkUpcomingEvents, 60000);
    checkUpcomingEvents(); // Initial check

    // Init
    initMap();

    // Tutorial Check
    if (!localStorage.getItem('tutorial_seen')) {
        document.getElementById('tutorial-modal').classList.remove('hidden');
    }

    // Init Firebase
    const fbReady = await initFirebase();

    if (fbReady) {
        // 1. Set Default App ID
        state.appId = (typeof __app_id !== 'undefined' && __app_id) ? __app_id : 'lichternacht';
        console.log("Using Initial App ID:", state.appId);
        
        // 2. Sync Config (might override App ID)
        await syncGlobalConfig();
        console.log("Using Final App ID:", state.appId);

        // 3. Init Listeners
        initPresence();
        initAuthListener(); // Loads data on auth state change
        initBroadcastListener();
    } else {
        // Offline / No Config
        state.useLocalStorage = true;
        document.getElementById('status-indicator').innerText = "Lokal";
        loadData();
    }

    // Attempt to inject tracking code if present in config
    if (state.config && state.config.trackingCode) {
        injectTrackingCode(state.config.trackingCode);
    }
};

function injectTrackingCode(codeHtml) {
    if (!codeHtml) return;
    console.log("Injecting Tracking Code...");
    
    // Create a dummy container to parse the HTML
    const div = document.createElement('div');
    div.innerHTML = codeHtml;
    
    // Extract script tags
    const scripts = div.getElementsByTagName('script');
    
    Array.from(scripts).forEach(script => {
        const newScript = document.createElement('script');
        
        // Copy attributes
        Array.from(script.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
        });
        
        // Copy content
        if (script.innerHTML) {
            newScript.innerHTML = script.innerHTML;
        }
        
        document.head.appendChild(newScript);
    });
}

function initBroadcastListener() {
    const { doc, onSnapshot } = state.fb;

    onSnapshot(doc(state.db, 'artifacts', state.appId, 'public', 'broadcast'), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            state.lastBroadcast = data; // Store globally

            const lastSeen = Number(localStorage.getItem('last_broadcast_seen') || 0);
            const fourHoursAgo = Date.now() - (1000 * 60 * 60 * 4);

            // Show Bell if recent message exists
            const btn = document.getElementById('notification-btn');
            const badge = btn.querySelector('span');

            if (data.timestamp > fourHoursAgo) {
                btn.classList.remove('hidden');

                // Show/Hide Red Dot based on seen status
                if (data.timestamp > lastSeen) {
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            } else {
                btn.classList.add('hidden');
            }

            // Auto-Popup if NEW and recent
            if (data.timestamp > lastSeen && data.timestamp > fourHoursAgo) {
                localStorage.setItem('last_broadcast_seen', data.timestamp);
                sendLocalNotification('Nachricht vom Team', data.text);
                alert(`NACHRICHT VOM TEAM:\n\n${data.text}`);
            }
        }
    });
}

window.showLastBroadcast = () => {
    if (state.lastBroadcast) {
        // Mark as seen
        localStorage.setItem('last_broadcast_seen', state.lastBroadcast.timestamp);

        // Hide red dot
        const btn = document.getElementById('notification-btn');
        const badge = btn.querySelector('span');
        if (badge) badge.classList.add('hidden');

        alert(`NACHRICHT VOM TEAM:\n\n${state.lastBroadcast.text}`);
    }
};

function checkUpcomingEvents() {
    if (!state.events) return;
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeVal = currentHours * 60 + currentMinutes;

    state.events.forEach(e => {
        const [h, m] = e.time.split(':').map(Number);
        const eventTimeVal = h * 60 + m;

        // Check if event starts in exactly 15 minutes
        // We use a small window (14-16 min) to be safe with the interval
        const diff = eventTimeVal - currentTimeVal;

        if (diff === 15) {
            sendLocalNotification(`Gleich geht's los: ${e.title}`, `In 15 Minuten bei: ${e.loc}`);
        }
    });
}

function sendLocalNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: './icon.png',
            badge: './icon.png'
        });
    } else {
        // Fallback: Toast inside app if open
        showToast(title, 'info');
    }
}
