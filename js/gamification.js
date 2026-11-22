import { state } from './state.js';
import { createProximityDwell } from './proximity-dwell.js?v=1.4.342';
import { isStationCancelled, countAvailableStations } from './station-status.js?v=1.4.342';
import { STATION_ARRIVAL_RADIUS_METERS, stationCoordinates, distanceMeters } from './round-trip.js?v=1.4.342';
import { canUseFirestore, noteFirestoreError } from './firebase-quota.js?v=1.4.342';
import {
    showToast,
    getDistance,
    getPassVisitedStationRecords,
    getVisitedStationIdSet,
    markStationVisited,
    removeStationVisited,
    vibrateFeedback
} from './utils.js?v=1.4.342';
import * as utils from './utils.js?v=1.4.342';
import { getAnonymousAuditId, recordAuditEvent } from './audit.js?v=1.4.342';
import { showProximityRadius } from './maplibre-map.js?v=1.4.342';
import { queueOfflineAction, flushOfflineActions, getCheckinSyncStatus } from './offline-sync.js?v=1.4.342';
import { recordCheckinDiagnostic } from './checkin-diagnostics.js?v=1.4.342';

function isPassActiveToday() {
    const w = (typeof utils.getConfiguredEventWindow === 'function') ? utils.getConfiguredEventWindow() : null;
    if (!w) return false;
    if (typeof utils.isWithinPassCheckinWindowNow === 'function') return utils.isWithinPassCheckinWindowNow(w, new Date());
    if (typeof utils.isWithinEventWindowNow === 'function') return utils.isWithinEventWindowNow(w, new Date());
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return todayKey === w.dateKey;
}

function getPassInactiveMessage() {
    const w = (typeof utils.getConfiguredEventWindow === 'function') ? utils.getConfiguredEventWindow() : null;
    if (!w) return 'Der Lichter‑Pass ist noch nicht aktiv, weil der Veranstaltungszeitraum noch nicht festgelegt wurde.';
    const formatted = (typeof utils.formatEventWindowDe === 'function')
        ? utils.formatEventWindowDe(w)
        : (typeof utils.formatEventDateDe === 'function')
            ? utils.formatEventDateDe(w.dateKey)
            : (w.dateKey || '');
    return `Einchecken ist von einer Stunde vor Beginn bis drei Stunden nach Ende möglich (${formatted}).`;
}

function getAnonymousAnalyticsId() {
    return getAnonymousAuditId();
}

async function recordAnonymousCheckIn(station, visitedCount, reachedLevel = '', diagnosticToken = null) {
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const payload = {
        type: 'checkin',
        anonymousId: getAnonymousAnalyticsId(),
        stationId: String(station.id),
        stationName: String(station.name || `Station ${station.id}`),
        checkedAt: now.toISOString(),
        dateKey,
        hour: now.getHours(),
        passCountAfter: Number(visitedCount) || 0,
        reachedLevel: reachedLevel || '',
        source: 'lichterpass',
        appId: state.appId || 'unknown'
    };
    if (state.localBackend) {
        queueOfflineAction('checkin', payload, { diagnosticToken });
        await flushOfflineActions();
        return;
    }
    if (!navigator.onLine || (!state.localBackend && !canUseFirestore())) {
        queueOfflineAction('checkin', payload);
        return;
    }
    if (state.useLocalStorage || !state.db || !state.fb?.addDoc || !state.fb?.collection) return;
    try {
        const user = state.auth?.currentUser;
        if (!user) throw new Error('Firebase-Anmeldung fehlt');
        const reference = state.fb.doc(state.db, 'artifacts', state.appId, 'public', 'data', 'checkins', `${user.uid}_${payload.stationId}`);
        try {
            await state.fb.setDoc(reference, { ...payload, ownerUid: user.uid, receivedAt: state.fb.serverTimestamp() });
        } catch (error) {
            if (error.code !== 'permission-denied') throw error;
            const existing = await state.fb.getDoc(reference);
            if (!existing.exists()) throw error;
        }
    } catch (e) {
        noteFirestoreError(e);
        console.warn('Anonymous check-in analytics failed', e);
        queueOfflineAction('checkin', payload);
    }
}

function getRewardConfig() {
    const rewards = state.config?.rewards || {};
    const rawThresholds = rewards.thresholds || {};
    const rawPrizes = rewards.prizes || {};

    const asIntOr = (value, fallback) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(1, Math.floor(n));
    };

    const thresholdsPercent = {
        bronze: Math.min(100, asIntOr(rawThresholds.bronze, 80)),
        silver: Math.min(100, asIntOr(rawThresholds.silver, 90)),
        gold: Math.min(100, asIntOr(rawThresholds.gold, 95)),
    };

    return {
        enabled: rewards.enabled === true,
        thresholdsPercent,
        prizes: {
            bronze: String(rawPrizes.bronze || '').trim(),
            silver: String(rawPrizes.silver || '').trim(),
            gold: String(rawPrizes.gold || '').trim(),
        }
    };
}

function percentToCount(percent, total) {
    const t = Number.isFinite(Number(total)) ? Number(total) : 0;
    if (t <= 0) return 0;
    const p = Math.min(100, Math.max(1, Math.floor(Number(percent) || 0)));
    // DSG: Abrunden wie gewünscht
    return Math.max(1, Math.floor((p / 100) * t));
}

function getNextRewardProgressText(visitedCount, total) {
    const cfg = getRewardConfig();
    if (!cfg.enabled) return '';

    const goals = [
        { key: 'bronze', label: 'Bronze', count: percentToCount(cfg.thresholdsPercent.bronze, total) },
        { key: 'silver', label: 'Silber', count: percentToCount(cfg.thresholdsPercent.silver, total) },
        { key: 'gold', label: 'Gold', count: percentToCount(cfg.thresholdsPercent.gold, total) },
    ].filter(goal => cfg.prizes?.[goal.key] && goal.count > 0);

    const nextGoal = goals
        .filter(goal => visitedCount < goal.count)
        .sort((a, b) => a.count - b.count)[0];

    if (nextGoal) {
        const remaining = Math.max(1, nextGoal.count - visitedCount);
        return `Noch ${remaining} Station(en) bis ${nextGoal.label}.`;
    }
    return goals.length ? 'Du hast alle Preisstufen erreicht.' : '';
}

function showRewardModal(level, prizeText) {
    if (!prizeText) return;

    const existing = document.getElementById('reward-modal');
    if (existing) existing.remove();

    const titleMap = {
        bronze: 'Bronze erreicht 🥉',
        silver: 'Silber erreicht 🥈',
        gold: 'Gold erreicht 🥇',
        diamond: 'Diamant erreicht 💎'
    };
    const title = titleMap[level] || 'Preis';
    const levelLabelMap = {
        bronze: 'Bronze',
        silver: 'Silber',
        gold: 'Gold',
        diamond: 'Diamant'
    };
    const levelLabel = levelLabelMap[level] || title;

    const overlay = document.createElement('div');
    overlay.id = 'reward-modal';
    overlay.className = 'fixed inset-0 z-[6500] flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" data-close="1"></div>
        <div class="relative z-10 w-full max-w-md bg-white dark:bg-gray-800 dark:text-white rounded-2xl shadow-2xl p-6 border border-gray-200 dark:border-gray-700">
            <div class="flex items-start justify-between gap-3">
                <h2 class="text-xl font-extrabold">${title}</h2>
                <button type="button" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 -mr-2 -mt-2" data-close="1">
                    <i class="ph ph-x text-2xl"></i>
                </button>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-300 mt-2">Dein Preis:</p>
            <div class="mt-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 text-sm whitespace-pre-wrap" id="reward-text"></div>
            <p class="text-sm text-gray-600 dark:text-gray-300 mt-3">Gib deine Kontaktdaten an, damit die Übergabe organisiert werden kann.</p>
            <div class="flex gap-2 mt-4">
                <button type="button" class="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-2.5 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-600" data-close="1">
                    Später
                </button>
                <button type="button" class="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-bold text-sm" id="reward-claim">
                    Preis anfordern
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const rewardTextEl = document.getElementById('reward-text');
    if (rewardTextEl) rewardTextEl.textContent = prizeText;

    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close="1"]').forEach(btn => btn.addEventListener('click', close));

    const claimBtn = document.getElementById('reward-claim');
    if (claimBtn) {
        claimBtn.addEventListener('click', () => {
            close();
            if (typeof window.openPrizeClaimModal === 'function') {
                const visitedStations = getPassVisitedStationRecords();
                const total = countAvailableStations(state.stations);
                window.openPrizeClaimModal(levelLabel, prizeText, visitedStations.length, total);
            } else {
                showToast('Bitte öffne den Lichter‑Pass, um den Preis anzufordern.', 'info');
            }
        });
    }
}

function showGpsCheckInHint(onContinue) {
    const existing = document.getElementById('gps-checkin-hint-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gps-checkin-hint-modal';
    overlay.className = 'fixed inset-0 z-[6500] flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" data-close="1"></div>
        <div class="relative z-10 w-full max-w-sm bg-white dark:bg-gray-800 dark:text-white rounded-2xl shadow-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div class="w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center mb-3">
                <i class="ph-fill ph-navigation-arrow text-2xl"></i>
            </div>
            <h2 class="text-lg font-extrabold">Kurz zu GPS</h2>
            <p class="text-sm text-gray-600 dark:text-gray-300 mt-2">Damit der Lichter‑Pass fair bleibt, prüft die App beim Einchecken kurz, ob du in der Nähe der Station bist.</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Dein Standort wird dafür nur auf deinem Gerät genutzt und nicht als Bewegungsprofil gespeichert.</p>
            <div class="flex gap-2 mt-5">
                <button type="button" class="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-2.5 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-600" data-close="1">
                    Später
                </button>
                <button type="button" class="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm" id="gps-checkin-continue">
                    Verstanden
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close="1"]').forEach(btn => btn.addEventListener('click', close));
    const continueBtn = document.getElementById('gps-checkin-continue');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            localStorage.setItem('gps_checkin_hint_seen_v1', 'true');
            close();
            if (typeof onContinue === 'function') onContinue();
        });
    }
}

export function undoCheckIn(id) {
    const visitedStations = getVisitedStationIdSet();
    const key = String(id);

    if (!visitedStations.has(key)) {
        showToast('Station war nicht als besucht markiert.', 'info');
        return;
    }

    if (!state.useLocalStorage && !state.localBackend) {
        showToast('Rücknahme ist nur mit der lokalen Datenbank verfügbar.', 'info');
        return;
    }
    if (!window.confirm('Check-in wirklich rückgängig machen? Der Besuch wird aus deinem Lichter-Pass entfernt.')) return;
    if (state.localBackend || localStorage.getItem('local_backend_enabled') === 'true') {
        queueOfflineAction('undo-checkin', { stationId: String(id) });
        flushOfflineActions();
    }
    removeStationVisited(id);
    const count = getPassVisitedStationRecords().length;
    const total = countAvailableStations(state.stations);
    const rewards = getRewardConfig();
    for (const level of ['bronze', 'silver', 'gold']) {
        if (count < percentToCount(rewards.thresholdsPercent[level], total)) localStorage.removeItem(`reached_${level}`);
    }
    if (count < total) localStorage.removeItem('reached_diamond');

    const lastChecked = localStorage.getItem('last_checked_station');
    if (lastChecked && lastChecked.toString() === id.toString()) {
        localStorage.removeItem('last_checked_station');
        state.lastCheckedStationId = null;
    }

    updatePassProgress();
    updateCheckInBtn(id);
    showToast(state.localBackend ? 'Besuch lokal entfernt. Die Rücknahme wird mit dem Server abgeglichen.' : 'Lokale Besuchsmarkierung entfernt.', 'info');
    const station = state.stations.find(item => item.id == id);
    recordAuditEvent('checkin_removed', { stationId: id, stationName: station?.name || '' });

    if (window.refreshMapMarkers) window.refreshMapMarkers();
    if (window.refreshStationList) window.refreshStationList();
}

// Make available for inline onclick handlers even if main.js is cached/stale
window.undoCheckIn = undoCheckIn;

export async function toggleLike(id) {
    // event is global, but better pass it or stop propagation in UI
    if (window.event) window.event.stopPropagation();

    if (id === undefined || id === null) {
        console.error("No ID for toggleLike");
        return;
    }

    const likedKey = `liked_${id}`;
    if (localStorage.getItem(likedKey)) {
        // Ensure modal UI is in sync even if the user already voted
        try {
            const s = state.stations.find(x => x.id == id);
            updateLikeBtn(id, s?.likes || 0);
            if (window.refreshStationList) window.refreshStationList();
        } catch (e) { }
        showToast('Du hast bereits abgestimmt!', 'info');
        return;
    }

    localStorage.setItem(likedKey, 'true');

    // Optimistic UI update
    const s = state.stations.find(x => x.id == id);
    if (s) {
        s.likes = (s.likes || 0) + 1;
        updateLikeBtn(id, s.likes);
        
        // Refresh list to show updated like count
        if (window.refreshStationList) window.refreshStationList();
    }

    showToast('Danke für deine Stimme!', 'success');
    vibrateFeedback(20);
    recordAuditEvent('station_liked', { stationId: id, stationName: s?.name || '' });

    if (!navigator.onLine) {
        queueOfflineAction('like', { stationId: id });
        return;
    }
    if (!state.useLocalStorage && state.fb.updateDoc && state.fb.increment) {
        try {
            const { doc, updateDoc, increment } = state.fb;
            const ref = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'stations', id.toString());
            await updateDoc(ref, { likes: increment(1) });
        } catch (e) {
            console.error("Like Error", e);
            queueOfflineAction('like', { stationId: id });
        }
    }
}

export function toggleFavorite(id, fromModal = false) {
    if (window.event) window.event.stopPropagation();
    const station = state.stations.find(item => item.id == id);
    if (state.favorites.has(id)) {
        state.favorites.delete(id);
        recordAuditEvent('favorite_removed', { stationId: id, stationName: station?.name || '' });
    } else {
        state.favorites.add(id);
        recordAuditEvent('favorite_added', { stationId: id, stationName: station?.name || '' });
    }
    localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
    vibrateFeedback(15);

    // Update UI
    if (fromModal) {
        updateModalFavBtn(id);
        const modalFavoriteButton = document.getElementById('modal-fav-btn');
        if (modalFavoriteButton) {
            modalFavoriteButton.classList.remove('favorite-feedback');
            requestAnimationFrame(() => modalFavoriteButton.classList.add('favorite-feedback'));
            setTimeout(() => modalFavoriteButton.classList.remove('favorite-feedback'), 420);
        }
    }
    // Refresh list if needed (we don't have access to renderList here easily, but that's fine)
    // We could dispatch an event or just let the user refresh.
    // Actually, we should update the list icon if visible.
    const listIcon = document.getElementById(`fav-icon-${id}`);
    if (listIcon) {
        listIcon.className = state.favorites.has(id) ? "ph-fill ph-star text-yellow-500" : "ph ph-star text-gray-400";
    }

    // If we are in favorites view and removed a favorite, refresh the list
    const favBtn = document.querySelector("button[onclick=\"filterList('favorites')\"]");
    if (favBtn && favBtn.classList.contains('active') && !state.favorites.has(id)) {
        if (window.filterList) window.filterList('favorites');
    }
}

export function updateLikeBtn(id, count) {
    const btn = document.getElementById('modal-like-btn');
    if (!btn) return;
    const isLiked = localStorage.getItem(`liked_${id}`);
    const iconHtml = isLiked
        ? `<i class="ph-fill ph-thumbs-up text-xl text-orange-500"></i>`
        : `<i class="ph ph-thumbs-up text-xl text-gray-400"></i>`;

    const countClass = isLiked ? 'text-orange-600' : 'text-gray-500';

    btn.innerHTML = `${iconHtml}<span class="ml-1 text-xs font-bold ${countClass}">${count || 0}</span>`;
    if (isLiked) {
        btn.classList.add('bg-orange-50', 'border-orange-200');
        btn.classList.remove('bg-gray-100', 'border-gray-200');
    } else {
        btn.classList.remove('bg-orange-50', 'border-orange-200');
        btn.classList.add('bg-gray-100', 'border-gray-200');
    }
}

export function updateModalFavBtn(id) {
    const btn = document.getElementById('modal-fav-btn');
    if (!btn) return;
    const isFav = state.favorites.has(id);
    btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
    btn.innerHTML = `<i class="ph ${isFav ? 'ph-fill ph-star text-yellow-500' : 'ph-star text-gray-400'} text-2xl"></i>`;
}

export async function checkIn(id, diagnosticToken = null, options = {}) {
    const automatic = options.automatic === true;
    if (automatic && !canAutomaticallyCheckIn(id)) return;
    if (!getVisitedStationIdSet().has(String(id))) diagnosticToken = recordCheckinDiagnostic('attempt', id, diagnosticToken);
    if (isStationCancelled(state.stations.find(station => String(station.id) === String(id)))) {
        recordCheckinDiagnostic('cancelled', id, diagnosticToken);
        updateCheckInBtn(id);
        showToast('Diese Station ist abgesagt. Einchecken ist nicht möglich.', 'info');
        return;
    }
    if (!isPassActiveToday()) {
        recordCheckinDiagnostic('outside_window', id, diagnosticToken);
        showToast(getPassInactiveMessage(), 'info');
        return;
    }
    const visitedStations = getVisitedStationIdSet();
    const key = String(id);

    if (visitedStations.has(key)) {
        updateCheckInBtn(id);
        showToast('Diese Station ist bereits als besucht markiert.', 'info');
        return;
    }

    if (!automatic && localStorage.getItem('gps_checkin_hint_seen_v1') !== 'true') {
        showGpsCheckInHint(() => checkIn(id, diagnosticToken));
        return;
    }

    if (!state.userLocation) {
        recordCheckinDiagnostic('gps_missing', id, diagnosticToken);
        // Auto-locate
        if (window.locateUser) {
            setCheckInButtonState(id, 'searching');
            showToast('Standort wird angefragt… bitte GPS erlauben.', 'info');
            window.locateUser(() => checkIn(id, diagnosticToken));
        } else {
            showToast("Bitte erst Standort aktivieren!", 'error');
        }
        return;
    }

    const gpsAgeMs = Date.now() - Number(state.gpsLastFixAt || 0);
    if (!state.gpsLastFixAt || gpsAgeMs > 60000) {
        recordCheckinDiagnostic('gps_stale', id, diagnosticToken);
        setCheckInButtonState(id, 'searching');
        showToast('Der Standort ist nicht mehr aktuell – GPS wird neu bestimmt.', 'info');
        if (window.locateUser) window.locateUser(() => checkIn(id, diagnosticToken));
        return;
    }

    if (Number.isFinite(Number(state.gpsAccuracy)) && Number(state.gpsAccuracy) > 75) {
        recordCheckinDiagnostic('gps_inaccurate', id, diagnosticToken);
        showToast(`GPS noch zu ungenau (±${Math.round(Number(state.gpsAccuracy))} m). Bitte kurz warten und erneut versuchen.`, 'info');
        return;
    }

    const s = state.stations.find(x => x.id == id);
    if (!s) return;
    recordCheckinDiagnostic('gps_ready', id, diagnosticToken);

    // Calc distance
    const dist = getDistance(state.userLocation.lat, state.userLocation.lng, s.lat, s.lng);
    const ALLOWED_RADIUS = STATION_ARRIVAL_RADIUS_METERS;

    if (dist > ALLOWED_RADIUS) {
        recordCheckinDiagnostic('too_far', id, diagnosticToken);
        setCheckInButtonState(id, 'too-far', Math.round(dist));
        showToast(`Noch zu weit weg: ca. ${dist.toFixed(0)} m entfernt (max. ${ALLOWED_RADIUS} m).`, 'error');
        
        // Visual Feedback: Show circle on map
        if (state.map) showProximityRadius(s, state.userLocation, ALLOWED_RADIUS);
        return;
    }

    recordCheckinDiagnostic('station_detected', id, diagnosticToken);
    markStationVisited(id);
    recordCheckinDiagnostic('local_saved', id, diagnosticToken);
    const updatedVisitedStations = getPassVisitedStationRecords();

    state.lastCheckedStationId = id;
    localStorage.setItem('last_checked_station', id.toString());

    updatePassProgress();

    // Check for Champion Status
    const count = updatedVisitedStations.length;
    if (count >= 3 && typeof window.maybeAskPassParticipation === 'function') {
        window.maybeAskPassParticipation();
    }

    let newLevel = null;
    if (count >= countAvailableStations(state.stations) && countAvailableStations(state.stations) > 0) newLevel = 'diamond';
    else {
        const cfg = getRewardConfig();
        const total = countAvailableStations(state.stations);
        const goldCount = percentToCount(cfg.thresholdsPercent.gold, total);
        const silverCount = percentToCount(cfg.thresholdsPercent.silver, total);
        const bronzeCount = percentToCount(cfg.thresholdsPercent.bronze, total);

        // Use >= so changes in station count still award once (guarded by reached_* keys).
        if (goldCount > 0 && count >= goldCount) newLevel = 'gold';
        else if (silverCount > 0 && count >= silverCount) newLevel = 'silver';
        else if (bronzeCount > 0 && count >= bronzeCount) newLevel = 'bronze';
    }

    if (newLevel) {
        const key = `reached_${newLevel}`;
        if (!localStorage.getItem(key)) {
            localStorage.setItem(key, 'true');

            let msg = '', field = '';
            if (newLevel === 'bronze') { msg = 'Bronze Champion! 🥉'; field = 'count_bronze'; }
            if (newLevel === 'silver') { msg = 'Silber Champion! 🥈'; field = 'count_silver'; }
            if (newLevel === 'gold') { msg = 'Gold Champion! 🥇'; field = 'count_gold'; }
            if (newLevel === 'diamond') { msg = 'Diamant Champion! 💎'; field = 'count_diamond'; }

            showToast(msg, 'success');

            // Show configured prize (if enabled)
            try {
                const cfg = getRewardConfig();
                if (cfg.enabled && (newLevel === 'bronze' || newLevel === 'silver' || newLevel === 'gold')) {
                    const prize = cfg.prizes?.[newLevel];
                    if (prize) showRewardModal(newLevel, prize);
                }
            } catch (e) { }

            try {
                const { doc, updateDoc, setDoc, increment } = state.fb;
                const statsRef = doc(state.db, 'global', 'stats');
                const updatePayload = {};
                updatePayload[field] = increment(1);

                await updateDoc(statsRef, updatePayload).catch(async () => {
                    const setPayload = {};
                    setPayload[field] = 1;
                    await setDoc(statsRef, setPayload, { merge: true });
                });
            } catch (e) { console.warn("Could not update champion stats", e); }
        }
    }

    recordAnonymousCheckIn(s, count, newLevel || '', diagnosticToken);
    recordAuditEvent('station_checked_in', { stationId: id, stationName: s.name || '', count, level: newLevel || '' });

    updateCheckInBtn(id);
    const totalStations = countAvailableStations(state.stations);
    const rewardProgressText = getNextRewardProgressText(count, totalStations);
    showToast(`${s.name || 'Station'} gespeichert! ${rewardProgressText || '🏆'}`, 'success');
    vibrateFeedback([35, 35, 60]);

    // Update map marker styles (visited ring / last-checked pulse)
    if (window.refreshMapMarkers) window.refreshMapMarkers();

    // Briefly highlight the station so the user immediately sees what happened
    try {
        const entry = Array.isArray(state.markers) ? state.markers.find(m => m.id == id) : null;
        if (entry && entry.marker) {
            const iconDiv = entry.marker.getElement();
            const innerDiv = iconDiv?.querySelector('div');
            if (innerDiv) {
                innerDiv.classList.add('highlight-pin');
                setTimeout(() => innerDiv.classList.remove('highlight-pin'), 3500);
            }
        }
    } catch (e) { }
    
    // Refresh list to show "BESUCHT" badge immediately
    if (window.refreshStationList) window.refreshStationList();
    
    // Hide smart button if it was for this station
    if (state.smartActionStationId === id) {
        document.getElementById('smart-action-btn')?.classList.add('hidden');
        state.smartActionStationId = null;
    }
}

function setCheckInButtonState(id, status, distance = 0) {
    const button = document.getElementById('checkin-btn');
    if (!button || String(state.activeStationId) !== String(id)) return;
    button.dataset.status = status;
    button.disabled = status === 'searching';
    button.classList.remove('bg-gray-900', 'bg-red-50', 'text-white', 'text-red-700', 'border', 'border-red-200', 'hover:bg-black');

    if (status === 'searching') {
        button.innerHTML = '<i class="ph ph-spinner animate-spin text-xl mr-2"></i><span>GPS wird gesucht…</span>';
        button.classList.add('bg-gray-700', 'text-white');
        window.setTimeout(() => {
            if (button.dataset.status === 'searching') updateCheckInBtn(id);
        }, 30000);
        return;
    }

    if (status === 'too-far') {
        button.innerHTML = `<i class="ph ph-warning-circle text-xl mr-2"></i><span>Zu weit entfernt · ca. ${distance} m</span>`;
        button.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
    }
}

export function updateCheckInBtn(id) {
    const btn = document.getElementById('checkin-btn');
    if (!btn) return;

    const visitedStations = getVisitedStationIdSet();
    const cancelled = isStationCancelled(state.stations.find(station => String(station.id) === String(id)));
    const visited = visitedStations.has(String(id));
    const hideCheckin = cancelled || visited;
    btn.classList.toggle('hidden', hideCheckin);
    btn.classList.toggle('flex', !hideCheckin);
    document.getElementById('checkin-hint')?.classList.toggle('hidden', cancelled || visited);
    const success = document.getElementById('checkin-success');
    success?.classList.toggle('hidden', !visited);
    success?.classList.toggle('flex', visited);
    const undoButton = document.getElementById('checkin-undo');
    if (undoButton) undoButton.onclick = () => undoCheckIn(id);
    btn.dataset.status = visited ? 'success' : 'idle';
    btn.classList.remove('bg-gray-700', 'bg-red-50', 'text-red-700', 'border-red-200');

    if (visited) {
        const sync = getCheckinSyncStatus(id);
        const label = sync?.status === 'pending' ? 'Besucht · Übertragung ausstehend'
            : sync?.status === 'rejected' ? 'Besucht · nur auf diesem Gerät' : 'Besucht';
        const successLabel = document.getElementById('checkin-success-label');
        if (successLabel) successLabel.textContent = label;
    } else if (cancelled) {
        btn.dataset.status = 'cancelled';
        btn.textContent = 'Einchecken';
        btn.disabled = true;
        btn.classList.remove('bg-green-50', 'border', 'border-green-200');
        btn.classList.add('bg-gray-900', 'text-white');
    } else {
        btn.innerHTML = `<i class="ph ph-map-pin text-xl mr-2"></i><span>Einchecken</span>`;
        btn.disabled = false;
        btn.classList.remove('bg-green-50', 'border', 'border-green-200');
        btn.classList.add('bg-gray-900', 'text-white', 'hover:bg-black', 'shadow-md');
    }
}

if (typeof window.addEventListener === 'function') window.addEventListener('lichternacht:checkin-sync', () => {
    if (state.activeStationId != null) updateCheckInBtn(state.activeStationId);
});

export function updatePassProgress() {
    const count = getPassVisitedStationRecords().length;
    const total = countAvailableStations(state.stations);
    const el = document.getElementById('pass-progress');
    if (el) {
        el.innerHTML = `<i class="ph-fill ph-trophy"></i><span class="font-bold">Sammeln ${count}/${total}</span>`;
        el.setAttribute('aria-label', `Lichter-Pass: ${count} von ${total} Stationen gesammelt. Erklärung öffnen.`);
    }
}

// Allow other modules to refresh the badge after async data loads
window.updatePassProgress = updatePassProgress;

// Presence
const sessionId = crypto.randomUUID();

export function initPresence() {
    if (state.useLocalStorage) return;

    // Ensure badge is visible immediately in online mode (even before first successful count)
    const el = document.getElementById('user-count');
    if (el) {
        el.classList.remove('hidden');
        el.classList.add('flex');
        const span = el.querySelector('span');
        if (span && !span.innerText) span.innerText = '0';
    }

    let heartbeatPending = false;
    const sendHeartbeat = async () => {
        if (document.visibilityState === 'hidden' || (!state.localBackend && !canUseFirestore())) return;
        if (!state.auth?.currentUser || heartbeatPending) return;
        heartbeatPending = true;
        try {
            const { doc, setDoc, serverTimestamp } = state.fb;
            const ref = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'presence', sessionId);
            await setDoc(ref, { lastSeen: serverTimestamp() });
        } catch (e) { noteFirestoreError(e); console.warn("Heartbeat failed", e); }
        finally { heartbeatPending = false; }
    };

    const updateUserCount = async () => {
        if (document.visibilityState === 'hidden' || (!state.localBackend && !canUseFirestore())) return;
        try {
            const { collection, query, where, getCountFromServer, doc, getDoc } = state.fb;
            const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
            const colRef = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'presence');
            const q = query(colRef, where('lastSeen', '>', twoMinAgo));
            const snapshot = await getCountFromServer(q);
            const count = snapshot.data().count;

            const el = document.getElementById('user-count');
            if (el) {
                const span = el.querySelector('span');
                if (span) span.innerText = count;
                el.classList.remove('hidden');
                el.classList.add('flex');
            }

            // Stats
            const statsRef = doc(state.db, 'global', 'stats');
            const statsSnap = await getDoc(statsRef);
            if (statsSnap.exists()) {
                const d = statsSnap.data();
                if (document.getElementById('count-bronze')) document.getElementById('count-bronze').innerText = d.count_bronze || 0;
                if (document.getElementById('count-silver')) document.getElementById('count-silver').innerText = d.count_silver || 0;
                if (document.getElementById('count-gold')) document.getElementById('count-gold').innerText = d.count_gold || 0;
                if (document.getElementById('count-diamond')) document.getElementById('count-diamond').innerText = d.count_diamond || 0;
            }
        } catch (e) {
            noteFirestoreError(e);
            console.warn("Count failed", e);
            // Keep badge visible even if count fails
            const el = document.getElementById('user-count');
            if (el) {
                el.classList.remove('hidden');
                el.classList.add('flex');
            }
        }
    };

    sendHeartbeat();
    if (state.auth && typeof state.fb.onAuthStateChanged === 'function') {
        state.fb.onAuthStateChanged(state.auth, user => {
            if (user) sendHeartbeat();
        });
    }
    updateUserCount();
    setInterval(sendHeartbeat, 60 * 1000);
    setInterval(updateUserCount, 60 * 1000);
}

const updateProximityDwell = createProximityDwell();
const updateAutomaticDwell = createProximityDwell({ durationMs: 120000, strictlyLonger: true });
const automaticAttempts = new Set();
const boundAutoCheckinControls = new WeakSet();
let autoCheckinEnabled = false;
let visibilityListenerBound = false;
let automaticReadyStationId = null;
let proximityTimer = null;

function resetProximity() {
    if (proximityTimer != null) window.clearTimeout?.(proximityTimer);
    proximityTimer = null;
    updateProximityDwell({ id: null });
    updateAutomaticDwell({ id: null });
    automaticReadyStationId = null;
    state.smartActionStationId = null;
    document.getElementById('smart-action-btn')?.classList.add('hidden');
}

function bindProximityVisibility() {
    if (visibilityListenerBound || typeof document.addEventListener !== 'function') return;
    document.addEventListener('visibilitychange', resetProximity);
    window.addEventListener?.('pagehide', resetProximity);
    visibilityListenerBound = true;
}

export function setAutoCheckinEnabled(enabled) {
    autoCheckinEnabled = enabled === true;
    resetProximity();
    bindProximityVisibility();
    const checkbox = document.getElementById('auto-checkin-enabled');
    if (checkbox) checkbox.checked = autoCheckinEnabled;
    return autoCheckinEnabled;
}

export function initAutoCheckin() {
    bindProximityVisibility();
    let checkbox = document.getElementById('auto-checkin-enabled');
    if (!checkbox) {
        const content = document.getElementById('pass-modal')?.querySelector('.relative.z-10');
        if (!content) return;
        const control = document.createElement('div');
        control.className = 'mt-4 p-3 rounded-xl border border-gray-200 dark:border-gray-600 text-sm';
        control.innerHTML = `<label class="flex items-center gap-3 font-bold"><input type="checkbox" id="auto-checkin-enabled" aria-describedby="auto-checkin-description">Automatisch einchecken (freiwillig)</label>
            <p id="auto-checkin-description" class="mt-2 text-xs">Nur bei sichtbarer App und mehr als zwei Minuten durchgehend innerhalb von 20 m zur nächsten nicht abgesagten Station mit frischen GPS-Messungen (gemeldete Genauigkeit höchstens ±20 m). Standort wird nicht automatisch angefordert. GPS kann abweichen; eine tatsächliche Genauigkeit ist nicht garantiert. Manuelles Einchecken bleibt möglich.</p>`;
        content.appendChild(control);
        checkbox = document.getElementById('auto-checkin-enabled');
    }
    if (!checkbox) return;
    checkbox.checked = autoCheckinEnabled;
    if (boundAutoCheckinControls.has(checkbox)) return;
    checkbox.addEventListener('change', () => setAutoCheckinEnabled(checkbox.checked));
    boundAutoCheckinControls.add(checkbox);
}

function nearestAutomaticStation(lat, lng, now = Date.now()) {
    const location = stationCoordinates({ lat, lng });
    const current = stationCoordinates(state.userLocation);
    if (!location || !current || location[0] !== current[0] || location[1] !== current[1]
        || document.visibilityState !== 'visible' || !Number.isFinite(state.gpsAccuracy)
        || state.gpsAccuracy < 0 || state.gpsAccuracy > 20 || !Number.isFinite(state.gpsLastFixAt)
        || state.gpsLastFixAt > now || now - state.gpsLastFixAt > 5000) return null;
    const candidates = (state.stations || []).filter(station => !isStationCancelled(station) && stationCoordinates(station))
        .map(station => ({ station, distance: distanceMeters(location, stationCoordinates(station)) }))
        .sort((first, second) => first.distance - second.distance);
    if (!candidates.length || candidates[0].distance > 20
        || (candidates[1] && Math.abs(candidates[1].distance - candidates[0].distance) < 0.01)) return null;
    return candidates[0].station;
}

function canAutomaticallyCheckIn(id) {
    const nearest = nearestAutomaticStation(state.userLocation?.lat, state.userLocation?.lng);
    return autoCheckinEnabled && automaticReadyStationId === String(id) && isPassActiveToday()
        && nearest != null && String(nearest.id) === String(id) && !getVisitedStationIdSet().has(String(id));
}

export function checkProximity(lat, lng) {
    if (proximityTimer != null) window.clearTimeout?.(proximityTimer);
    proximityTimer = null;
    bindProximityVisibility();
    const now = Date.now();
    const automaticStation = autoCheckinEnabled && isPassActiveToday() ? nearestAutomaticStation(lat, lng, now) : null;
    const automaticDwell = updateAutomaticDwell({
        id: automaticStation && !getVisitedStationIdSet().has(String(automaticStation.id)) ? automaticStation.id : null,
        accuracy: state.gpsAccuracy,
        fixAt: state.gpsLastFixAt,
        visible: document.visibilityState === 'visible'
    }, now);
    automaticReadyStationId = automaticDwell.ready ? String(automaticStation.id) : null;
    if (automaticDwell.ready && !automaticAttempts.has(automaticReadyStationId)) {
        automaticAttempts.add(automaticReadyStationId);
        void checkIn(automaticStation.id, null, { automatic: true }).catch(error => console.warn('Automatic check-in failed', error));
    }
    // Hide smart check-in outside the configured event day to avoid unfair early check-ins.
    if (!isPassActiveToday()) {
        updateProximityDwell({ id: null });
        const btn = document.getElementById('smart-action-btn');
        if (btn) btn.classList.add('hidden');
        state.smartActionStationId = null;
        return;
    }
    // Only check if we have stations
    if (!state.stations || state.stations.length === 0) {
        updateProximityDwell({ id: null });
        document.getElementById('smart-action-btn')?.classList.add('hidden');
        state.smartActionStationId = null;
        return;
    }

    // Get visited stations
    const visitedStations = getVisitedStationIdSet();

    // Find nearest unvisited station (and keep all candidates within radius)
    let nearest = null;
    let minDist = Infinity;
    const DETECT_RADIUS = STATION_ARRIVAL_RADIUS_METERS;
    const candidates = [];

    state.stations.forEach(s => {
        if (isStationCancelled(s)) return;
        if (visitedStations.has(String(s.id))) return; // Skip visited

        const dist = getDistance(lat, lng, s.lat, s.lng);
        if (dist <= DETECT_RADIUS) {
            candidates.push({ station: s, dist });
        }
        if (dist < minDist) {
            minDist = dist;
            nearest = s;
        }
    });

    const dwell = updateProximityDwell({
        id: candidates.length > 0 && nearest && minDist <= DETECT_RADIUS ? nearest.id : null,
        accuracy: state.gpsAccuracy,
        fixAt: state.gpsLastFixAt,
        visible: document.visibilityState === 'visible'
    });
    const btn = document.getElementById('smart-action-btn');
    if (!btn) return;

    if (dwell.monitoring && !autoCheckinEnabled) {
        proximityTimer = window.setTimeout(() => {
            const location = state.userLocation;
            checkProximity(location?.lat, location?.lng);
        }, 1000);
    }

    if (dwell.ready && nearest) {
        // Show Smart Button
        state.smartActionStationId = nearest.id;
        const extraCount = candidates.length - 1;
        const text = document.getElementById('smart-action-text');
        if (text) text.innerText = extraCount > 0 ? `${nearest.name} (+${extraCount})` : nearest.name;
        btn.classList.remove('hidden');
        // Add minimal bounce if it just appeared? (Handled by CSS animation class)
    } else {
        // Hide
        state.smartActionStationId = null;
        btn.classList.add('hidden');
    }
}

export function executeSmartAction() {
    if (state.smartActionStationId) {
        // Quick check-in
        if (window.checkIn) {
            window.checkIn(state.smartActionStationId);
        }
    }
}
