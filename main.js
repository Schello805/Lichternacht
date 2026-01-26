import { state } from './js/state.js';
import { shareStation, showToast } from './js/utils.js';
import { initFirebase } from './js/firebase-init.js';
import { initMap, updateMapTiles, locateUser, calculateRoute, resetMap, refreshMapMarkers } from './js/map.js';
import { loadData, syncGlobalConfig } from './js/data.js';
import { initAuthListener, performLogin, logoutAdmin, createNewUser } from './js/auth.js';
import { initPresence, toggleLike, toggleFavorite, checkIn, undoCheckIn, checkProximity, executeSmartAction, updatePassProgress } from './js/gamification.js';
import {
    openModal, closeModal, switchTab, toggleDarkMode, updateDarkModeIcon,
    openHelpModal, closeHelpModal, saveStationChanges, deleteStation,
    handleImageUpload, editStation, openEventModal, closeEventModal,
    fillEventCoords, saveEventChanges, deleteEvent, filterStations, filterList, generateICS, searchAddress,
    fillStationCoords, searchStationAddress, createEventForStation, clearStationImage, startStationPicker,
    openBugReportModal, submitBugReport, editEvent, applyStationToEvent,
    renderList, renderTimeline, renderFilterBar, openStation, startEventPicker, refreshStationList, checkPlanningMode, flyToStation, closePlanningBanner
} from './js/ui.js';
import {
    uploadSeedData, toggleAdminPanel, importData, handleAdminAdd, dumpData, downloadDataJs, uploadFlyer, saveDownloads, sendBroadcast, saveAppConfig, resetLikes, deleteUser, saveTrackingConfig, deleteBroadcast, startNewYear, testPlanningBanner
} from './js/admin.js';

// Bind to Window for HTML access
const APP_VERSION = "1.4.71";
console.log(`Lichternacht App v${APP_VERSION} loaded`);
window.state = state; // Explicitly bind state to window
window.showToast = showToast;
window.flyToStation = flyToStation;
window.closePlanningBanner = closePlanningBanner;

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
window.deleteBroadcast = deleteBroadcast;
window.startNewYear = startNewYear;
window.testPlanningBanner = testPlanningBanner;
window.resetLikes = resetLikes;
window.deleteUser = deleteUser;
window.toggleLike = toggleLike;
window.toggleFavorite = toggleFavorite;
window.checkIn = checkIn;
window.undoCheckIn = undoCheckIn;
window.checkProximity = checkProximity;
window.executeSmartAction = executeSmartAction;
window.openModal = openModal;
window.closeModal = closeModal;

window.showUserCountInfo = () => {
    const el = document.getElementById('user-count');
    const count = el?.querySelector('span')?.innerText ?? '0';
    if (state.useLocalStorage) {
        showToast(`Aktive Nutzer: ${count} (Offline: nur dieses Gerät)`, 'info');
    } else {
        showToast(`Aktive Nutzer gerade: ${count}`, 'info');
    }
};

window.showPassInfo = () => {
    let visitedStations = new Set();
    try {
        const saved = localStorage.getItem('visited_stations');
        if (saved) visitedStations = new Set(JSON.parse(saved));
    } catch (e) { }
    const visited = visitedStations.size;
    const total = Array.isArray(state.stations) ? state.stations.length : 0;
    showToast(`Lichter-Pass: ${visited}/${total} Stationen besucht. Sammle alle Stationen!`, 'info');
};

function setTourFlag(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // ignore
    }
    try {
        const maxAge = 60 * 60 * 24 * 365; // 1 year
        document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/`;
    } catch (e) { }
}

function getTourFlag(key) {
    try {
        const v = localStorage.getItem(key);
        if (v !== null) return v;
    } catch (e) { }
    try {
        const needle = `${encodeURIComponent(key)}=`;
        const parts = (document.cookie || '').split(';').map(s => s.trim());
        const hit = parts.find(p => p.startsWith(needle));
        if (!hit) return null;
        return decodeURIComponent(hit.substring(needle.length));
    } catch (e) { }
    return null;
}

function hideMiniTourPromptEl() {
    const el = document.getElementById('mini-tour-prompt');
    if (!el) return;
    el.classList.add('hidden');
    el.style.display = 'none';
}

window.startMiniTour = (force = false) => {
    const key = 'mini_tour_seen_v1';
    if (!force && getTourFlag(key) === 'true') return;

    const steps = [
        {
            elId: 'user-count',
            title: 'Aktive Nutzer',
            text: 'Zeigt, wie viele Leute die App gerade aktiv nutzen.'
        },
        {
            elId: 'pass-progress',
            title: 'Lichter‑Pass',
            text: 'Dein Fortschritt: besucht/gesamt. Einchecken klappt nur in der Nähe einer Station.'
        },
        {
            elId: 'smart-action-container',
            title: 'In der Nähe',
            text: 'Wenn du nah genug an einer Station bist, erscheint hier ein Quick‑Button zum direkten Einchecken.'
        },
        {
            tab: 'list',
            elId: 'nav-list',
            title: 'Stationen',
            text: 'Über das Menü unten kommst du zur Stationsliste. Dort kannst du suchen und filtern.'
        },
        {
            tab: 'events',
            elId: 'nav-events',
            title: 'Programm',
            text: 'Über das Menü unten kommst du zum Programm. Mit „Zeigen“ springst du zur passenden Station auf der Karte.'
        }
    ];

    let idx = 0;
    let tooltip = null;
    let activeTarget = null;
    let onResize = null;

    const clearTargetHighlight = () => {
        if (activeTarget) {
            activeTarget.classList.remove('tour-target-pulse');
            activeTarget = null;
        }
    };

    const cleanup = () => {
        clearTargetHighlight();
        if (tooltip) tooltip.remove();
        tooltip = null;
        if (onResize) {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
            onResize = null;
        }
    };

    const finish = () => {
        setTourFlag(key, 'true');
        // Once completed, never show prompt again
        setTourFlag('mini_tour_prompt_dismissed_v1', 'true');
        cleanup();
    };

    const render = () => {
        const step = steps[idx];

        // Switch to required tab first (keeps tour working across sections)
        if (step.tab && window.switchTab) {
            // Only switch if target is currently not available
            const alreadyThere = document.getElementById(step.elId);
            if (!alreadyThere) {
                window.switchTab(step.tab);
                setTimeout(() => render(), 320);
                return;
            }
        }

        const target = document.getElementById(step.elId);
        if (!target) {
            finish();
            return;
        }

        clearTargetHighlight();
        activeTarget = target;
        activeTarget.classList.add('tour-target-pulse');

        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'tour-tooltip';
            document.body.appendChild(tooltip);
        }

        const isLast = idx === steps.length - 1;
        tooltip.innerHTML = `
            <div class="tour-title">${step.title} <span style="opacity:.75;font-weight:700">(${idx + 1}/${steps.length})</span></div>
            <div class="tour-text">${step.text}</div>
            <div class="tour-actions">
                <button class="tour-btn" type="button" id="tour-skip">Überspringen</button>
                <button class="tour-btn primary" type="button" id="tour-next">${isLast ? 'Fertig' : 'Weiter'}</button>
            </div>
        `;

        tooltip.querySelector('#tour-skip').onclick = finish;
        tooltip.querySelector('#tour-next').onclick = () => {
            if (isLast) finish();
            else {
                idx += 1;
                render();
            }
        };

        const positionTooltip = () => {
            const r = target.getBoundingClientRect();
            const pad = 10;

            // Measure tooltip after content has been injected
            const t = tooltip.getBoundingClientRect();

            // Prefer above-right of target (like a callout)
            let x = r.right;
            let y = r.top;

            // Place tooltip above the target if there's room, else below
            const preferAbove = (r.top - t.height - 12) > pad;
            y = preferAbove ? (r.top - 12) : (r.bottom + 12);

            // Align to the right edge of target, but keep within screen
            x = r.right;

            // Convert to top-left by subtracting tooltip size (anchor at top-right)
            let left = x - t.width;
            let top = y;
            if (preferAbove) top = y - t.height;

            // Clamp into viewport
            left = Math.min(window.innerWidth - pad - t.width, Math.max(pad, left));
            top = Math.min(window.innerHeight - pad - t.height, Math.max(pad, top));

            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
            tooltip.style.transform = 'none';
        };

        // Initial position after layout
        requestAnimationFrame(positionTooltip);

        if (!onResize) {
            onResize = () => requestAnimationFrame(positionTooltip);
            window.addEventListener('resize', onResize);
            window.addEventListener('orientationchange', onResize);
        }
    };

    try {
        render();
    } catch (e) {
        cleanup();
    }
};

window.showMiniTourPrompt = () => {
    const seenKey = 'mini_tour_seen_v1';
    const dismissedKey = 'mini_tour_prompt_dismissed_v1';
    const seen = getTourFlag(seenKey);
    const dismissed = getTourFlag(dismissedKey);
    if (seen === 'true' || dismissed === 'true') {
        hideMiniTourPromptEl();
        return;
    }

    const tutorialModal = document.getElementById('tutorial-modal');
    if (tutorialModal && !tutorialModal.classList.contains('hidden')) return;

    const el = document.getElementById('mini-tour-prompt');
    if (!el) return;
    el.classList.remove('hidden');
    el.style.display = ''; // CSS-independent

    // Robust binding (Safari + cached HTML edge cases)
    const startBtn = document.getElementById('mini-tour-start');
    const dismissBtn = document.getElementById('mini-tour-dismiss');
    if (startBtn) {
        startBtn.onclick = (e) => {
            try { e.stopPropagation(); } catch (err) { }
            window.startMiniTourFromPrompt();
        };
    }
    if (dismissBtn) {
        dismissBtn.onclick = (e) => {
            try { e.stopPropagation(); } catch (err) { }
            window.dismissMiniTourPrompt();
        };
    }
};

window.dismissMiniTourPrompt = () => {
    setTourFlag('mini_tour_prompt_dismissed_v1', 'true');
    const el = document.getElementById('mini-tour-prompt');
    if (el) {
        el.classList.add('hidden');
        el.style.display = 'none';
    }
};

window.startMiniTourFromPrompt = () => {
    const el = document.getElementById('mini-tour-prompt');
    if (el) {
        el.classList.add('hidden');
        el.style.display = 'none';
    }
    // Also hide prompt for this session so it doesn't reappear
    setTourFlag('mini_tour_prompt_dismissed_v1', 'true');
    if (window.startMiniTour) setTimeout(() => window.startMiniTour(true), 0);
};

// Safari/Leaflet safety: ensure prompt buttons work even if clicks are swallowed/stopped
if (!window.__miniTourPromptHandlerBound) {
    window.__miniTourPromptHandlerBound = true;

    let lastHandledAt = 0;

    const handler = (e) => {
        const now = Date.now();
        if (now - lastHandledAt < 250) return;

        // Safari sometimes reports a text node as target; normalize to an Element
        let t = e.target;
        if (t && t.nodeType === 3) t = t.parentElement; // TEXT_NODE

        // Prefer composedPath() when available
        const path = (typeof e.composedPath === 'function') ? e.composedPath() : null;
        const pathEl = Array.isArray(path) ? path.find(n => n && n.nodeType === 1) : null;
        const base = (t && t.nodeType === 1) ? t : pathEl;

        const start = base?.closest?.('#mini-tour-start') || (Array.isArray(path) ? path.find(n => n && n.id === 'mini-tour-start') : null);
        const dismiss = base?.closest?.('#mini-tour-dismiss') || (Array.isArray(path) ? path.find(n => n && n.id === 'mini-tour-dismiss') : null);
        if (!start && !dismiss) return;

        lastHandledAt = now;

        try { e.preventDefault(); } catch (err) { }
        try { e.stopPropagation(); } catch (err) { }

        try {
            if (start) {
                window.startMiniTourFromPrompt();
            }
            if (dismiss) {
                window.dismissMiniTourPrompt();
            }
        } catch (err) {
            // ignore
        }
    };

    document.addEventListener('pointerdown', handler, true);
}

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

// Provide a stable API for inline HTML buttons (e.g. tutorial modal)
window.triggerPwaInstall = async () => {
    if (!deferredPrompt) {
        // Not available on all browsers (e.g. Safari) or if already installed
        showToast('Installation ist in diesem Browser gerade nicht verfügbar. Nutze ggf. "Zum Home-Bildschirm" im Browser-Menü.', 'info');
        return;
    }
    try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install prompt: ${outcome}`);
        deferredPrompt = null;
    } catch (e) {
        console.log('PWA install prompt failed', e);
        showToast('Installation konnte nicht gestartet werden.', 'error');
    }
};

window.restartMiniTour = () => {
    try {
        localStorage.removeItem('mini_tour_seen_v1');
        localStorage.removeItem('mini_tour_prompt_dismissed_v1');
    } catch (e) { }
    try {
        document.cookie = "mini_tour_seen_v1=; Max-Age=0; Path=/";
        document.cookie = "mini_tour_prompt_dismissed_v1=; Max-Age=0; Path=/";
    } catch (e) { }

    if (window.showMiniTourPrompt) window.showMiniTourPrompt();
    showToast('Tour kann erneut gestartet werden.', 'info');
};

// Navigation Bindings (Robust)
window.switchTab = (tab) => {
    console.log("window.switchTab called", tab);
    switchTab(tab);
};
window.appSwitchTab = window.switchTab; // Alias for safety

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
window.checkPlanningMode = checkPlanningMode;
window.closePlanningBanner = closePlanningBanner;
window.openStation = openStation;
window.startEventPicker = startEventPicker;
window.refreshStationList = refreshStationList;
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
    // Try to load config.js dynamically to avoid 404 console spam if missing
    try {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'config.js';
            script.onload = resolve;
            script.onerror = () => { console.log('config.js not found (using local/defaults)'); resolve(); }; // Resolve anyway to continue
            document.body.appendChild(script);
        });
    } catch (e) { console.log('Config load skipped'); }

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
    updatePassProgress(); // FIX: Show correct pass progress on load

    // Tutorial Check
    if (!localStorage.getItem('tutorial_seen')) {
        document.getElementById('tutorial-modal').classList.remove('hidden');
    }

    // Init Firebase
    const fbReady = await initFirebase();

    if (fbReady) {
        state.useLocalStorage = false;

        // Ensure active user counter is visible immediately in online mode
        const userCountEl = document.getElementById('user-count');
        if (userCountEl) {
            userCountEl.classList.remove('hidden');
            userCountEl.classList.add('flex');
        }

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

        // Fallback: show badge even without Firebase (only this device)
        const userCountEl = document.getElementById('user-count');
        if (userCountEl) {
            const span = userCountEl.querySelector('span');
            if (span) span.innerText = '1';
            userCountEl.classList.remove('hidden');
            userCountEl.classList.add('flex');
            userCountEl.title = 'Aktive Nutzer: nur dieses Gerät (Offline)';
        }
        loadData();
    }

    // Attempt to inject tracking code if present in config
    if (state.config && state.config.trackingCode) {
        injectTrackingCode(state.config.trackingCode);
    }

    // Auto-Locate on Start (User Request)
    // This prompts for permission immediately and ensures distances are shown.
    locateUser();

    // Offer mini-tour (user decides)
    setTimeout(() => {
        if (window.showMiniTourPrompt) window.showMiniTourPrompt();
    }, 900);

    // Defensive: if flags already set, ensure prompt is not visible
    try {
        const seen = getTourFlag('mini_tour_seen_v1');
        const dismissed = getTourFlag('mini_tour_prompt_dismissed_v1');
        if (seen === 'true' || dismissed === 'true') {
            hideMiniTourPromptEl();
        }
    } catch (e) { }
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
        const btn = document.getElementById('notification-btn');
        const badge = btn.querySelector('span');

        if (snap.exists()) {
            const data = snap.data();
            state.lastBroadcast = data; // Store globally

            const lastSeen = Number(localStorage.getItem('last_broadcast_seen') || 0);
            const fourHoursAgo = Date.now() - (1000 * 60 * 60 * 4);

            // Show Bell if recent message exists
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
        } else {
            // Document deleted -> Hide Bell
            state.lastBroadcast = null;
            if (btn) btn.classList.add('hidden');
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

    const icsDate = state.downloads && state.downloads.icsDate;
    if (!icsDate || !/^\d{8}$/.test(icsDate)) return;
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const icsKey = `${icsDate.slice(0, 4)}-${icsDate.slice(4, 6)}-${icsDate.slice(6, 8)}`;
    if (todayKey !== icsKey) return;

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
