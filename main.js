import { state } from './js/state.js';
import { shareStation, showToast } from './js/utils.js';
import * as utils from './js/utils.js';
import { initFirebase } from './js/firebase-init.js';
import { initMap, updateMapTiles, locateUser, calculateRoute, resetMap, refreshMapMarkers } from './js/map.js?v=1.4.104';
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
    renderList, renderTimeline, renderFilterBar, openStation, openProgramEvent, startEventPicker, refreshStationList, checkPlanningMode, flyToStation, closePlanningBanner
} from './js/ui.js?v=1.4.104';
import {
    uploadSeedData, toggleAdminPanel, closeAdminPanel, importData, handleAdminAdd, dumpData, downloadDataJs, uploadFlyer, saveDownloads, sendBroadcast, saveAppConfig, resetLikes, deleteUser, saveTrackingConfig, clearTrackingConfig, saveRewardsConfig, exportStationsCsv, exportEventsCsv, downloadStationsCsvTemplate, downloadEventsCsvTemplate, importStationsCsv, importEventsCsv, runDataValidation, deleteBroadcast, startNewYear, testPlanningBanner
} from './js/admin.js?v=1.4.104';

import { updateAdminUiAvailability } from './js/admin.js?v=1.4.104';

// Bind to Window for HTML access
const APP_VERSION = "1.4.104";
console.log(`Lichternacht App v${APP_VERSION} loaded`);
window.state = state; // Explicitly bind state to window
window.showToast = showToast;
window.flyToStation = flyToStation;
window.closePlanningBanner = closePlanningBanner;
window.pendingAdminOpen = false;

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
window.closeAdminPage = closeAdminPanel;
window.importData = importData;
window.handleAdminAdd = handleAdminAdd;
window.dumpData = dumpData;
window.downloadDataJs = downloadDataJs;
window.exportStationsCsv = exportStationsCsv;
window.exportEventsCsv = exportEventsCsv;
window.downloadStationsCsvTemplate = downloadStationsCsvTemplate;
window.downloadEventsCsvTemplate = downloadEventsCsvTemplate;
window.importStationsCsv = importStationsCsv;
window.importEventsCsv = importEventsCsv;
window.runDataValidation = runDataValidation;
window.uploadFlyer = uploadFlyer;
window.saveDownloads = saveDownloads;
window.saveAppConfig = saveAppConfig;
window.saveTrackingConfig = saveTrackingConfig;
window.clearTrackingConfig = clearTrackingConfig;
window.saveRewardsConfig = saveRewardsConfig;
window.sendBroadcast = sendBroadcast;
window.deleteBroadcast = deleteBroadcast;
window.startNewYear = startNewYear;
window.testPlanningBanner = testPlanningBanner;
window.resetLikes = resetLikes;
window.deleteUser = deleteUser;

// Admin UI availability helper
window.updateAdminUiAvailability = updateAdminUiAvailability;
window.toggleLike = toggleLike;
window.toggleFavorite = toggleFavorite;
window.checkIn = checkIn;
window.undoCheckIn = undoCheckIn;
window.checkProximity = checkProximity;
window.executeSmartAction = executeSmartAction;
window.openModal = openModal;
window.closeModal = closeModal;

window.goHome = () => {
    closeModal();
    closeEventModal();
    if (window.closeAdminPage) window.closeAdminPage();
    switchTab('map');
    if (window.location.search || window.location.hash) {
        window.history.replaceState({}, '', window.location.pathname);
    }
};

window.requestAdminPage = () => {
    window.pendingAdminOpen = true;
    if (state.isAdmin && window.toggleAdminPanel) {
        window.pendingAdminOpen = false;
        window.toggleAdminPanel();
    } else if (!state.isAdmin && window.toggleAdminLogin) {
        window.toggleAdminLogin();
    }
};

window.showUserCountInfo = () => {
    const el = document.getElementById('user-count');
    const count = el?.querySelector('span')?.innerText ?? '0';
    if (state.useLocalStorage) {
        showToast(`Aktive Nutzer: ${count} (Offline: nur dieses Gerät)`, 'info');
    } else {
        showToast(`Aktive Nutzer gerade: ${count}`, 'info');
    }
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function parseTimeToMinutes(value) {
    const match = String(value || '').match(/(\d{1,2})[:.](\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return (hours * 60) + minutes;
}

function getLocalDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getNextVisitorEvent(eventWindow) {
    if (!eventWindow || !Array.isArray(state.events) || state.events.length === 0) return null;
    const todayKey = getLocalDateKey();
    if (eventWindow.dateKey !== todayKey) return null;

    const now = new Date();
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
    return state.events
        .map(event => ({ event, minutes: parseTimeToMinutes(event.time) }))
        .filter(item => item.minutes !== null && item.minutes >= nowMinutes)
        .sort((a, b) => a.minutes - b.minutes)[0]?.event || null;
}

function hideVisitorStartCard() {
    const card = document.getElementById('visitor-start-card');
    if (card) card.classList.add('hidden');
}

let visitorStartRetryTimer = null;

function isBlockingVisitorOverlayVisible() {
    const tutorial = document.getElementById('tutorial-modal');
    const tracking = document.getElementById('tracking-consent');
    const login = document.getElementById('login-modal');
    return (tutorial && !tutorial.classList.contains('hidden')) ||
        (tracking && !tracking.classList.contains('hidden')) ||
        (login && !login.classList.contains('hidden'));
}

function retryVisitorStartCardSoon() {
    if (visitorStartRetryTimer) window.clearTimeout(visitorStartRetryTimer);
    visitorStartRetryTimer = window.setTimeout(() => {
        visitorStartRetryTimer = null;
        if (window.updateVisitorStartCard) window.updateVisitorStartCard();
    }, 900);
}

window.dismissVisitorStartCard = () => {
    localStorage.setItem('visitor_start_card_dismissed_v1', 'true');
    hideVisitorStartCard();
};

window.updateVisitorStartCard = () => {
    const card = document.getElementById('visitor-start-card');
    const titleEl = document.getElementById('visitor-start-title');
    const metaEl = document.getElementById('visitor-start-meta');
    const nextEl = document.getElementById('visitor-start-next');
    if (!card || !titleEl || !metaEl || !nextEl) return;
    if (state.isAdmin || localStorage.getItem('visitor_start_card_dismissed_v1') === 'true') {
        hideVisitorStartCard();
        return;
    }
    if (isBlockingVisitorOverlayVisible()) {
        hideVisitorStartCard();
        retryVisitorStartCardSoon();
        return;
    }

    const eventWindow = (typeof utils.getConfiguredEventWindow === 'function') ? utils.getConfiguredEventWindow() : null;
    const eventLabel = eventWindow && typeof utils.formatEventWindowDe === 'function'
        ? utils.formatEventWindowDe(eventWindow)
        : 'Datum noch nicht festgelegt';
    const isActive = eventWindow && typeof utils.isWithinEventWindowNow === 'function'
        ? utils.isWithinEventWindowNow(eventWindow, new Date())
        : false;
    const nextEvent = getNextVisitorEvent(eventWindow);

    titleEl.textContent = state.config?.title ? `Willkommen bei ${state.config.title}` : 'Willkommen zur Lichternacht';
    metaEl.textContent = `${eventLabel} · Lichter‑Pass ${isActive ? 'aktiv' : 'noch nicht aktiv'}`;

    if (nextEvent) {
        nextEl.innerHTML = `
            <div class="font-bold text-gray-900 dark:text-white">Als Nächstes: ${escapeHtml(nextEvent.time || '')} Uhr · ${escapeHtml(nextEvent.title || 'Programmpunkt')}</div>
            <div class="mt-0.5">${escapeHtml(nextEvent.loc || nextEvent.desc || 'Im Programm findest du Details und den Kartenbezug.')}</div>
        `;
    } else if (eventWindow) {
        nextEl.innerHTML = `
            <div class="font-bold text-gray-900 dark:text-white">Dein schneller Einstieg</div>
            <div class="mt-0.5">Öffne die Karte, suche Stationen oder plane deinen Abend im Programm.</div>
        `;
    } else {
        nextEl.innerHTML = `
            <div class="font-bold text-gray-900 dark:text-white">Noch kein Veranstaltungsdatum</div>
            <div class="mt-0.5">Du kannst die Stationen schon ansehen; der Lichter‑Pass wird zur Veranstaltung wichtig.</div>
        `;
    }

    card.classList.remove('hidden');
};

window.showPassInfo = () => {
    const visitedRecords = (typeof utils.getVisitedStationRecords === 'function') ? utils.getVisitedStationRecords(state.stations) : [];
    const visited = visitedRecords.length;
    const total = Array.isArray(state.stations) ? state.stations.length : 0;

    const rewards = state.config?.rewards || {};
    const enabled = rewards.enabled === true;
    const thresholds = rewards.thresholds || {};
    const prizes = rewards.prizes || {};

    const bronzePercent = Number.isFinite(Number(thresholds.bronze)) ? Number(thresholds.bronze) : 80;
    const silverPercent = Number.isFinite(Number(thresholds.silver)) ? Number(thresholds.silver) : 90;
    const goldPercent = Number.isFinite(Number(thresholds.gold)) ? Number(thresholds.gold) : 95;

    const bronzePrize = String(prizes.bronze || '').trim();
    const silverPrize = String(prizes.silver || '').trim();
    const goldPrize = String(prizes.gold || '').trim();

    const hasAnyPrize = Boolean(bronzePrize || silverPrize || goldPrize);
    const showAdminPassTools = state.isAdmin === true;
    const existing = document.getElementById('pass-modal');
    if (existing) existing.remove();

    function escapeHtml(s) {
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function pctToCount(pct, tot) {
        const p = Math.min(100, Math.max(1, Math.floor(Number(pct) || 0)));
        if (!Number.isFinite(Number(tot)) || Number(tot) <= 0) return 0;
        return Math.max(1, Math.floor((p / 100) * Number(tot)));
    }

    const eventWindow = (typeof utils.getConfiguredEventWindow === 'function') ? utils.getConfiguredEventWindow() : null;
    const eventWindowLabel = eventWindow && typeof utils.formatEventWindowDe === 'function' ? utils.formatEventWindowDe(eventWindow) : '';
    const passActive = !eventWindow || (typeof utils.isWithinEventWindowNow === 'function' ? utils.isWithinEventWindowNow(eventWindow, new Date()) : true);

    const prizeRows = [
        { key: 'bronze', label: 'Bronze', icon: '🥉', percent: bronzePercent, prize: bronzePrize },
        { key: 'silver', label: 'Silber', icon: '🥈', percent: silverPercent, prize: silverPrize },
        { key: 'gold', label: 'Gold', icon: '🥇', percent: goldPercent, prize: goldPrize },
    ].filter(row => row.prize);

    const nextGoal = prizeRows
        .map(row => ({ ...row, count: pctToCount(row.percent, total) }))
        .filter(row => visited < row.count)
        .sort((a, b) => a.count - b.count)[0];

    const bestReached = [...prizeRows]
        .map(row => ({ ...row, count: pctToCount(row.percent, total) }))
        .filter(row => visited >= row.count)
        .sort((a, b) => b.count - a.count)[0];

    const progressPercent = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
    const nextGoalText = nextGoal
        ? `Noch ${Math.max(0, nextGoal.count - visited)} Station(en) bis ${nextGoal.label}.`
        : (hasAnyPrize ? 'Du hast alle eingestellten Preisstufen erreicht.' : 'Sammle Stationen und verfolge hier deinen Fortschritt.');

    const visibleVisitedRecords = visitedRecords.slice(-8).reverse();
    const visitedHistoryHtml = visibleVisitedRecords.length > 0
        ? visibleVisitedRecords.map(item => `
            <div class="flex items-start justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                <div>
                    <div class="font-bold text-gray-900 dark:text-white">#${escapeHtml(item.stationNumber)} ${escapeHtml(item.stationName)}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400">${escapeHtml(item.checkedAtLabel)}</div>
                </div>
            </div>
        `).join('')
        : '<div class="text-sm text-gray-600 dark:text-gray-300">Noch keine Check-ins vorhanden.</div>';

    function renderPrizeRow(label, icon, percent, prize, current, tot) {
        if (!prize) return '';
        const p = Math.min(100, Math.max(1, Math.floor(Number(percent) || 0)));
        const thresholdCount = pctToCount(p, tot);
        const reached = thresholdCount > 0 && current >= thresholdCount;
        const badge = reached
            ? `<span class="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-bold">Erreicht</span>`
            : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200 font-bold">ab ${p}% (${thresholdCount})</span>`;
        return `
            <div class="p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                <div class="flex items-center justify-between gap-2">
                    <div class="font-extrabold">${icon} ${label}</div>
                    ${badge}
                </div>
                <div class="text-sm text-gray-700 dark:text-gray-200 mt-2 whitespace-pre-wrap">${escapeHtml(prize)}</div>
                ${reached ? `<button type="button" class="mt-3 w-full bg-green-600 text-white py-2.5 rounded-xl font-bold text-sm" data-claim-level="${label}" data-claim-prize="${escapeHtml(prize)}">Preis anfordern</button>` : ''}
            </div>
        `;
    }

    const overlay = document.createElement('div');
    overlay.id = 'pass-modal';
    overlay.className = 'fixed inset-0 z-[6500] flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" data-close="1"></div>
        <div class="relative z-10 w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-800 dark:text-white rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-xl font-extrabold">Lichter‑Pass</div>
                    <div class="text-sm text-gray-600 dark:text-gray-300 mt-1">${visited}/${total} Stationen besucht · ${progressPercent}%</div>
                </div>
                <button type="button" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 -mr-2 -mt-2" data-close="1">
                    <i class="ph ph-x text-2xl"></i>
                </button>
            </div>

            <div class="mt-4">
                <div class="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div class="h-full bg-yellow-500 rounded-full" style="width:${progressPercent}%"></div>
                </div>
            </div>

            <div class="mt-4 p-3 rounded-xl border ${passActive ? 'border-green-200 bg-green-50 text-green-900' : 'border-yellow-200 bg-yellow-50 text-yellow-900'} text-sm">
                <div class="font-bold">${passActive ? 'Lichter‑Pass ist aktiv' : 'Lichter‑Pass ist noch nicht aktiv'}</div>
                <div class="mt-1">${eventWindowLabel ? `Check-ins sind im Zeitraum ${escapeHtml(eventWindowLabel)} möglich.` : 'Check-ins sind während der Veranstaltung möglich.'}</div>
            </div>

            <div class="mt-4 p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                <div class="font-bold text-gray-900 dark:text-white">So funktioniert es</div>
                <div class="mt-1 text-gray-600 dark:text-gray-300">Gehe zu einer Station, aktiviere GPS und tippe in der Nähe auf „Einchecken“. Wenn du eine Preisstufe erreichst, kannst du den Preis hier anfordern.</div>
                <div class="mt-2 font-bold text-gray-900 dark:text-white">${escapeHtml(nextGoalText)}</div>
                <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">Dein Fortschritt bleibt auf diesem Gerät, solange du Website-Daten nicht löschst.</div>
            </div>

            ${bestReached ? `
                <div class="mt-4 p-3 rounded-xl border border-green-200 bg-green-50 text-green-900 text-sm">
                    <div class="font-bold">${bestReached.icon} ${bestReached.label} erreicht</div>
                    <div class="mt-1">Gib deine Kontaktdaten an. Ich melde mich danach bei dir und organisiere die Übergabe.</div>
                    <button type="button" class="mt-3 w-full bg-green-600 text-white py-2.5 rounded-xl font-bold text-sm" data-claim-level="${bestReached.label}" data-claim-prize="${escapeHtml(bestReached.prize)}">Preis anfordern</button>
                </div>
            ` : ''}

            <div class="mt-4 space-y-3">
                ${hasAnyPrize
                    ? `${renderPrizeRow('Bronze', '🥉', bronzePercent, bronzePrize, visited, total)}
                       ${renderPrizeRow('Silber', '🥈', silverPercent, silverPrize, visited, total)}
                       ${renderPrizeRow('Gold', '🥇', goldPercent, goldPrize, visited, total)}`
                    : '<div class="text-sm text-gray-600 dark:text-gray-300">Aktuell sind noch keine Preise hinterlegt.</div>'}
            </div>

            <div class="mt-4 p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm">
                <div class="flex items-center justify-between gap-2">
                    <div class="font-bold text-gray-900 dark:text-white">Check-in Verlauf</div>
                    ${showAdminPassTools ? `
                        <button type="button" class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 rounded-lg font-bold border border-gray-200 dark:border-gray-600" id="pass-history-export">
                            CSV Export
                        </button>
                    ` : ''}
                </div>
                <div class="mt-2">${visitedHistoryHtml}</div>
                ${showAdminPassTools && visitedRecords.length > visibleVisitedRecords.length ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-2">Es werden die letzten ${visibleVisitedRecords.length} Check-ins angezeigt. Der Export enthält alle.</div>` : ''}
            </div>

            <div class="mt-5 flex gap-2">
                ${showAdminPassTools ? `
                    <button type="button" class="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-2.5 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-600" id="pass-modal-copy">
                        Preise kopieren
                    </button>
                ` : ''}
                <button type="button" class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm" data-close="1">
                    OK
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close="1"]').forEach(btn => btn.addEventListener('click', close));
    overlay.querySelectorAll('[data-claim-level]').forEach(btn => {
        btn.addEventListener('click', () => {
            const level = btn.getAttribute('data-claim-level') || 'Preis';
            const prize = btn.getAttribute('data-claim-prize') || '';
            if (typeof window.openPrizeClaimModal === 'function') window.openPrizeClaimModal(level, prize, visited, total);
        });
    });

    const copyBtn = document.getElementById('pass-modal-copy');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const lines = [];
            if (bronzePrize) lines.push(`Bronze (${Math.floor(bronzePercent)}% = ${pctToCount(bronzePercent, total)}): ${bronzePrize}`);
            if (silverPrize) lines.push(`Silber (${Math.floor(silverPercent)}% = ${pctToCount(silverPercent, total)}): ${silverPrize}`);
            if (goldPrize) lines.push(`Gold (${Math.floor(goldPercent)}% = ${pctToCount(goldPercent, total)}): ${goldPrize}`);
            const text = lines.join('\n');
            try {
                await navigator.clipboard.writeText(text);
                showToast('Preise kopiert', 'success');
            } catch (e) {
                showToast('Kopieren nicht möglich', 'error');
            }
        });
    }

    const exportBtn = document.getElementById('pass-history-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (visitedRecords.length === 0) {
                showToast('Noch keine Check-ins vorhanden.', 'info');
                return;
            }

            const rows = [
                ['Station Nr.', 'Station', 'Check-in Zeitpunkt', 'Check-in ISO'].join(';'),
                ...visitedRecords.map(item => [
                    utils.toCsvValue(item.stationNumber),
                    utils.toCsvValue(item.stationName),
                    utils.toCsvValue(item.checkedAtLabel),
                    utils.toCsvValue(item.checkedAt || '')
                ].join(';'))
            ];

            const blob = new Blob([`\uFEFF${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lichterpass-checkins-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('Check-in Verlauf exportiert.', 'success');
        });
    }
};

window.openPrizeClaimModal = (level, prizeText, visited = 0, total = 0) => {
    const existing = document.getElementById('prize-claim-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'prize-claim-modal';
    overlay.className = 'fixed inset-0 z-[7000] flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" data-close="1"></div>
        <div class="relative z-10 w-full max-w-md bg-white dark:bg-gray-800 dark:text-white rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-xl font-extrabold">Preis anfordern</div>
                    <div class="text-sm text-gray-600 dark:text-gray-300 mt-1">${level} · ${visited}/${total} Stationen</div>
                </div>
                <button type="button" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 -mr-2 -mt-2" data-close="1">
                    <i class="ph ph-x text-2xl"></i>
                </button>
            </div>

            <div class="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 text-sm whitespace-pre-wrap" id="claim-prize-text"></div>

            <div class="mt-4 space-y-3">
                <input id="claim-name" class="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" placeholder="Dein Name" autocomplete="name">
                <input id="claim-contact" class="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm" placeholder="E-Mail oder Telefonnummer" autocomplete="email">
                <textarea id="claim-note" class="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm h-20" placeholder="Hinweis zur Übergabe (optional)"></textarea>
            </div>

            <div class="text-xs text-gray-500 dark:text-gray-400 mt-3">
                Die Angaben werden per E-Mail an den Admin gesendet, damit die Übergabe organisiert werden kann.
            </div>

            <div class="mt-5 flex gap-2">
                <button type="button" class="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-2.5 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-600" data-close="1">
                    Abbrechen
                </button>
                <button type="button" class="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-bold text-sm" id="claim-submit">
                    Anfordern
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const prizeEl = document.getElementById('claim-prize-text');
    if (prizeEl) prizeEl.textContent = prizeText || level;

    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close="1"]').forEach(btn => btn.addEventListener('click', close));

    const submitBtn = document.getElementById('claim-submit');
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            const name = (document.getElementById('claim-name')?.value || '').trim();
            const contact = (document.getElementById('claim-contact')?.value || '').trim();
            const note = (document.getElementById('claim-note')?.value || '').trim();
            if (!name || !contact) {
                showToast('Bitte Name und Kontakt angeben.', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sende...';

            const claimId = `LP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            const visitedRecords = (typeof utils.getVisitedStationRecords === 'function') ? utils.getVisitedStationRecords(state.stations) : [];
            const visitedLines = visitedRecords.length > 0
                ? visitedRecords.map(item => `- #${item.stationNumber} ${item.stationName} | ${item.checkedAtLabel}`).join('\n')
                : '- Keine Check-ins gefunden';

            const text = [
                `Anforderungs-ID: ${claimId}`,
                `Preisstufe: ${level}`,
                `Preis: ${prizeText || '-'}`,
                `Fortschritt: ${visited}/${total} Stationen`,
                `Name: ${name}`,
                `Kontakt: ${contact}`,
                `Hinweis: ${note || '-'}`,
                `Zeit: ${new Date().toLocaleString()}`,
                `App: ${state.appId || 'unknown'}`,
                '',
                'Besuchte Stationen:',
                visitedLines
            ].join('\n');

            try {
                const res = await fetch('./api/bug-report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subject: `Preisanforderung Lichternacht App: ${level}`,
                        text,
                        meta: { type: 'prize_claim', claimId, level, name, contact, appId: state.appId || 'unknown' }
                    })
                });
                if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));

                try {
                    localStorage.setItem(`prize_claimed_${String(level).toLowerCase()}`, 'true');
                } catch (e) { }
                close();
                showToast('Danke! Deine Preisanforderung wurde gesendet.', 'success');
            } catch (e) {
                console.error('Prize claim failed', e);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Anfordern';
                showToast('Senden nicht möglich. Bitte später erneut versuchen.', 'error');
            }
        });
    }
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
window.openProgramEvent = openProgramEvent;
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
    retryVisitorStartCardSoon();
};

window.toggleAdminLogin = () => {
    if (state.isAdmin) {
        toggleAdminPanel();
        return;
    }
    document.getElementById('login-modal').classList.toggle('hidden');
};

function startTrackingIfConsented() {
    const hasConsent = (typeof window.hasTrackingConsent === 'function') ? window.hasTrackingConsent() : false;
    if (!hasConsent) return;

    // Tracking is loaded only from admin-configured trackingCode (stored outside the git repo).
    if (state.config && state.config.trackingCode) {
        injectTrackingCode(state.config.trackingCode);
    }
}

function initTrackingConsentUi() {
    const consentState = (typeof window.getTrackingConsentState === 'function')
        ? window.getTrackingConsentState()
        : null;

    const modal = document.getElementById('tracking-consent');
    if (!modal) return;

    const acceptBtn = document.getElementById('tracking-consent-accept');
    const declineBtn = document.getElementById('tracking-consent-decline');
    const closeBtn = document.getElementById('tracking-consent-close');
    const backdrop = document.getElementById('tracking-consent-backdrop');

    const hide = () => {
        modal.classList.add('hidden');
        retryVisitorStartCardSoon();
    };
    const show = () => modal.classList.remove('hidden');

    // Allow opening the cookie banner from other pages/links.
    window.openCookieBanner = show;
    window.closeCookieBanner = hide;

    if (acceptBtn) {
        acceptBtn.onclick = () => {
            if (typeof window.setTrackingConsent === 'function') window.setTrackingConsent(true);
            hide();
            startTrackingIfConsented();
        };
    }
    if (declineBtn) {
        declineBtn.onclick = () => {
            if (typeof window.setTrackingConsent === 'function') window.setTrackingConsent(false);
            hide();
        };
    }
    if (closeBtn) closeBtn.onclick = () => hide();
    if (backdrop) backdrop.onclick = () => hide();

    // Help modal buttons (allow changing later)
    const allowSettingsBtn = document.getElementById('tracking-settings-allow');
    const denySettingsBtn = document.getElementById('tracking-settings-deny');
    if (allowSettingsBtn) {
        allowSettingsBtn.onclick = () => {
            if (typeof window.setTrackingConsent === 'function') window.setTrackingConsent(true);
            showToast('Tracking erlaubt', 'success');
            startTrackingIfConsented();
        };
    }
    if (denySettingsBtn) {
        denySettingsBtn.onclick = () => {
            if (typeof window.setTrackingConsent === 'function') window.setTrackingConsent(false);
            showToast('Tracking abgelehnt', 'info');
        };
    }

    // Show banner only on first visit / no decision yet.
    // Also allow deep-linking via ?cookies=1 (to change consent later).
    try {
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('cookies') === '1') {
            show();
            params.delete('cookies');
            const newQuery = params.toString();
            const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '') + window.location.hash;
            history.replaceState(null, '', newUrl);
            return;
        }
    } catch (e) { }
    if (consentState === null) show();
}

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

    const visitorClose = document.getElementById('visitor-start-close');
    if (visitorClose) visitorClose.addEventListener('click', window.dismissVisitorStartCard);
    document.querySelectorAll('[data-visitor-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-visitor-tab');
            if (tab) switchTab(tab);
            hideVisitorStartCard();
        });
    });

    // Tracking consent UI (mobile bottom sheet)
    initTrackingConsentUi();

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

    // Tracking: only load after explicit user consent.
    if (typeof window.hasTrackingConsent === 'function' && window.hasTrackingConsent()) {
        startTrackingIfConsented();
    } else if (state.config && state.config.trackingCode) {
        console.log("Tracking code configured, but consent missing. Not injecting.");
    }

    // Auto-Locate on Start (User Request)
    // This prompts for permission immediately and ensures distances are shown.
    locateUser();

    // Offer mini-tour (user decides)
    setTimeout(() => {
        if (window.showMiniTourPrompt) window.showMiniTourPrompt();
    }, 900);

    // Deep links from help.html
    try {
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('tour') === '1') {
            setTimeout(() => {
                if (window.startMiniTour) window.startMiniTour(true);
            }, 1200);
        }
        if (params.get('bug') === '1') {
            setTimeout(() => {
                if (window.openBugReportModal) window.openBugReportModal();
            }, 900);
        }
        if (params.get('admin') === '1') {
            window.pendingAdminOpen = true;
            setTimeout(() => {
                if (window.requestAdminPage) window.requestAdminPage();
            }, 900);
        }
    } catch (e) { }

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

    function parseEventDateKeyCompat(input) {
        const raw = String(input || '').trim();
        if (!raw) return null;
        const datePart = raw.split(/\s+/)[0];

        const de = datePart.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (de) {
            const day = String(de[1]).padStart(2, '0');
            const month = String(de[2]).padStart(2, '0');
            const year = de[3];
            return `${year}-${month}-${day}`;
        }

        const compact = datePart.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

        const iso = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

        return null;
    }

    const configuredKey = parseEventDateKeyCompat(state.downloads && state.downloads.icsDate);
    if (!configuredKey) return;
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (todayKey !== configuredKey) return;

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
