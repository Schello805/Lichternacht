import { state } from './js/state.js';
import { initFirebase } from './js/firebase-init.js';
import { initMap, updateMapTiles, locateUser, calculateRoute } from './js/map.js';
import { loadData, syncGlobalConfig, changeYear } from './js/data.js';
import { initAuthListener, performLogin, logoutAdmin } from './js/auth.js';
import { initPresence, toggleLike, toggleFavorite, checkIn } from './js/gamification.js';
import {
    openModal, closeModal, switchTab, toggleDarkMode, updateDarkModeIcon,
    openHelpModal, closeHelpModal, saveStationChanges, deleteStation,
    handleImageUpload, editStation, openEventModal, closeEventModal,
    fillEventCoords, saveEventChanges, deleteEvent, shareStation, filterStations, filterList
} from './js/ui.js';
import {
    uploadSeedData, resetApp, toggleAdminPanel, importData, handleAdminAdd, dumpData, downloadDataJs
} from './js/admin.js';

// Bind to Window for HTML access
window.performLogin = performLogin;
window.logoutAdmin = logoutAdmin;
window.uploadSeedData = uploadSeedData;
window.resetApp = resetApp;
window.toggleAdminPanel = toggleAdminPanel;
window.importData = importData;
window.handleAdminAdd = handleAdminAdd;
window.dumpData = dumpData;
window.downloadDataJs = downloadDataJs;
window.toggleLike = toggleLike;
window.toggleFavorite = toggleFavorite;
window.checkIn = checkIn;
window.openModal = openModal;
window.closeModal = closeModal;
window.switchTab = switchTab;
window.toggleDarkMode = toggleDarkMode;
window.openHelpModal = openHelpModal;
window.closeHelpModal = closeHelpModal;
window.saveStationChanges = saveStationChanges;
window.deleteStation = deleteStation;
window.handleImageUpload = handleImageUpload;
window.editStation = editStation;
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.fillEventCoords = fillEventCoords;
window.saveEventChanges = saveEventChanges;
window.deleteEvent = deleteEvent;
window.shareStation = shareStation;
window.filterList = filterList;
window.changeYear = changeYear;
window.locateUser = locateUser;
window.calculateRoute = calculateRoute;

window.closeTutorial = () => {
    document.getElementById('tutorial-modal').classList.add('hidden');
    localStorage.setItem('tutorial_seen', 'true');
};

window.toggleAdminLogin = () => {
    if (state.isAdmin) return;
    document.getElementById('login-modal').classList.toggle('hidden');
};

window.onload = async () => {
    // Service Worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./sw.js');
            console.log('SW registered');
        } catch (e) { console.log('SW fail', e); }
    }

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

    // Init
    initMap();

    // Tutorial Check
    if (!localStorage.getItem('tutorial_seen')) {
        document.getElementById('tutorial-modal').classList.remove('hidden');
    }

    // Init Firebase
    const fbReady = await initFirebase();

    if (fbReady) {
        state.appId = typeof __app_id !== 'undefined' ? __app_id : 'lichternacht-2025';
        await syncGlobalConfig();
        initPresence();
        initAuthListener(); // Loads data on auth state change
    } else {
        // Offline / No Config
        state.useLocalStorage = true;
        document.getElementById('status-indicator').innerText = "Lokal";
        loadData();
    }
};
