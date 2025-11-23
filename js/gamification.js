import { state } from './state.js';
import { showToast, getDistance } from './utils.js';

export async function toggleLike(id) {
    // event is global, but better pass it or stop propagation in UI
    if (window.event) window.event.stopPropagation();

    if (!id) {
        console.error("No ID for toggleLike");
        return;
    }

    const likedKey = `liked_${id}`;
    if (localStorage.getItem(likedKey)) {
        showToast('Du hast bereits abgestimmt!', 'info');
        return;
    }

    localStorage.setItem(likedKey, 'true');

    // Optimistic UI update
    const s = state.stations.find(x => x.id == id);
    if (s) {
        s.likes = (s.likes || 0) + 1;
        updateLikeBtn(id, s.likes);
        // Update list item count if visible
        const listEl = document.getElementById(`like-count-${id}`);
        if (listEl) listEl.innerHTML = `<i class="ph-fill ph-fire text-orange-500 text-xs mr-0.5"></i>${s.likes}`;
    }

    showToast('Danke für deine Stimme!', 'success');

    if (!state.useLocalStorage && state.fb.updateDoc && state.fb.increment) {
        try {
            const { doc, updateDoc, increment } = state.fb;
            const ref = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'stations', id.toString());
            await updateDoc(ref, { likes: increment(1) });
        } catch (e) { console.error("Like Error", e); }
    }
}

export function toggleFavorite(id, fromModal = false) {
    if (window.event) window.event.stopPropagation();
    if (state.favorites.has(id)) {
        state.favorites.delete(id);
        showToast('Aus Favoriten entfernt', 'info');
    } else {
        state.favorites.add(id);
        showToast('Zu Favoriten hinzugefügt', 'success');
    }
    localStorage.setItem('favorites', JSON.stringify([...state.favorites]));

    // Update UI
    if (fromModal) updateModalFavBtn(id);
    // Refresh list if needed (we don't have access to renderList here easily, but that's fine)
    // We could dispatch an event or just let the user refresh.
    // Actually, we should update the list icon if visible.
    const listIcon = document.getElementById(`fav - icon - ${id} `);
    if (listIcon) {
        listIcon.className = state.favorites.has(id) ? "ph-fill ph-heart text-red-500" : "ph ph-heart text-gray-400";
    }
}

export function updateLikeBtn(id, count) {
    const btn = document.getElementById('modal-like-btn');
    if (!btn) return;
    const isLiked = localStorage.getItem(`liked_${id}`);
    const iconHtml = isLiked
        ? `<i class="ph-fill ph-fire text-xl text-orange-500"></i>`
        : `<i class="ph ph-fire text-xl text-gray-400"></i>`;

    const countClass = isLiked ? 'text-orange-600' : 'text-gray-500';

    btn.innerHTML = `${iconHtml}<span class="ml-1 text-xs font-bold ${countClass}">${count || 0}</span>`;
    if (isLiked) btn.classList.add('bg-orange-50', 'border-orange-200');
}

export function updateModalFavBtn(id) {
    const btn = document.getElementById('modal-fav-btn');
    if (!btn) return;
    const isFav = state.favorites.has(id);
    btn.innerHTML = `<i class="ph ph-heart ${isFav ? 'ph-fill text-red-500' : 'text-gray-400'} text-2xl"></i>`;
}

export async function checkIn(id) {
    let visitedStations = new Set();
    try {
        const saved = localStorage.getItem('visited_stations');
        if (saved) visitedStations = new Set(JSON.parse(saved));
    } catch (e) { }

    if (visitedStations.has(id)) return;

    if (!state.userLocation) {
        // We need to import locateUser from map.js, but circular dependency.
        // Better: UI calls locateUser, then calls checkIn.
        // For now, assume UI handles location check before calling checkIn or we import it dynamically?
        // Let's just return error if no location.
        showToast("Bitte erst Standort aktivieren!", 'error');
        return;
    }

    const s = state.stations.find(x => x.id == id);
    if (!s) return;

    // Calc distance
    const dist = getDistance(state.userLocation.lat, state.userLocation.lng, s.lat, s.lng);
    if (dist > 0.2) { // 200m radius
        showToast(`Du bist zu weit weg! (${(dist * 1000).toFixed(0)}m)`, 'error');
        return;
    }

    visitedStations.add(id);
    localStorage.setItem('visited_stations', JSON.stringify([...visitedStations]));

    updatePassProgress();

    // Check for Champion Status
    const count = visitedStations.size;
    let newLevel = null;
    if (count === state.stations.length && count > 0) newLevel = 'diamond';
    else if (count === 30) newLevel = 'gold';
    else if (count === 20) newLevel = 'silver';
    else if (count === 10) newLevel = 'bronze';

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

    updateCheckInBtn(id);
    showToast('Check-in erfolgreich! 🏆', 'success');
}

export function updateCheckInBtn(id) {
    const btn = document.getElementById('checkin-btn');
    if (!btn) return;

    let visitedStations = new Set();
    try {
        const saved = localStorage.getItem('visited_stations');
        if (saved) visitedStations = new Set(JSON.parse(saved));
    } catch (e) { }

    if (visitedStations.has(id)) {
        btn.innerHTML = `<i class="ph-fill ph-check-circle text-green-500 text-xl mr-2"></i><span class="text-green-600 font-bold">Besucht</span>`;
        btn.disabled = true;
        btn.classList.add('bg-green-50', 'border', 'border-green-200');
        btn.classList.remove('bg-gray-900', 'text-white', 'hover:bg-black', 'shadow-md');
    } else {
        btn.innerHTML = `<i class="ph ph-map-pin text-xl mr-2"></i><span>Einchecken</span>`;
        btn.disabled = false;
        btn.classList.remove('bg-green-50', 'border', 'border-green-200');
        btn.classList.add('bg-gray-900', 'text-white', 'hover:bg-black', 'shadow-md');
    }
}

export function updatePassProgress() {
    let visitedStations = new Set();
    try {
        const saved = localStorage.getItem('visited_stations');
        if (saved) visitedStations = new Set(JSON.parse(saved));
    } catch (e) { }
    const count = visitedStations.size;
    const el = document.getElementById('pass-progress');
    if (el) el.innerHTML = `<i class="ph-fill ph-trophy text-yellow-500 mr-1"></i><span class="font-bold">${count}</span>`;
}

// Presence
const sessionId = crypto.randomUUID();

export function initPresence() {
    if (state.useLocalStorage) return;

    const sendHeartbeat = async () => {
        try {
            const { doc, setDoc, serverTimestamp } = state.fb;
            const ref = doc(state.db, 'artifacts', state.appId, 'public', 'data', 'presence', sessionId);
            await setDoc(ref, { lastSeen: serverTimestamp() });
        } catch (e) { console.warn("Heartbeat failed", e); }
    };

    const updateUserCount = async () => {
        try {
            const { collection, query, where, getCountFromServer, doc, getDoc } = state.fb;
            const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000);
            const colRef = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'presence');
            const q = query(colRef, where('lastSeen', '>', twoMinAgo));
            const snapshot = await getCountFromServer(q);
            const count = snapshot.data().count;

            const el = document.getElementById('user-count');
            if (el) {
                el.querySelector('span').innerText = count;
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
        } catch (e) { console.warn("Count failed", e); }
    };

    sendHeartbeat();
    updateUserCount();
    setInterval(sendHeartbeat, 60 * 1000);
    setInterval(updateUserCount, 60 * 1000);
}
