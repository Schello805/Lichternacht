import { state } from './state.js';
import { showToast, escapeHTML, setLoading, compressImage } from './utils.js';
import { updateMapTiles, locateUser, calculateRoute } from './map.js';
// ... (rest of imports)

// ... (rest of code)

export async function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    showToast('Bild wird verarbeitet...', 'info');
    try {
        const compressed = await compressImage(file);
        document.getElementById('edit-image').value = compressed;
        showToast('Bild komprimiert & geladen', 'success');
    } catch (e) {
        console.error(e);
        showToast('Fehler beim Bild-Upload', 'error');
    }
}

export function updateStationPickerDisplay(lat, lng) {
    const latSpan = document.getElementById('station-lat-display');
    const lngSpan = document.getElementById('station-lng-display');
    if (latSpan) latSpan.innerText = `Lat: ${lat !== undefined ? lat : '--'}`;
    if (lngSpan) lngSpan.innerText = `Lng: ${lng !== undefined ? lng : '--'}`;
}

function confirmStationCoordinateOverwrite(station, newLat, newLng, sourceLabel) {
    if (!station) return true;
    if (typeof station.lat !== 'number' || typeof station.lng !== 'number') return true;
    const oldLat = Number(station.lat.toFixed(5));
    const oldLng = Number(station.lng.toFixed(5));
    if (oldLat === newLat && oldLng === newLng) return true;
    const descSnippet = station.desc ? station.desc.trim().replace(/\s+/g, ' ').slice(0, 80) : 'keine Beschreibung';
    const confirmText = `Station "${station.name || station.id}" hat bereits Koordinaten (${oldLat}, ${oldLng}) und Beschreibung "${descSnippet}". Die ${sourceLabel}-Position (${newLat}, ${newLng}) überschreibt diese Werte. Wirklich übernehmen?`;
    return window.confirm(confirmText);
}

export function startStationPicker() {
    const map = state.map;
    if (!map) {
        showToast('Karte nicht verfügbar.', 'error');
        return;
    }

    showToast('Karte klicken, um Position zu wählen. Rechtsklick bricht ab.', 'info');
    const tempMarker = L.marker(map.getCenter(), { opacity: 0.7 }).addTo(map);

    const finalize = (lat, lng) => {
        map.off('click', onClick);
        map.off('contextmenu', onCancel);
        tempMarker.remove();
        const latInput = document.getElementById('edit-lat');
        const lngInput = document.getElementById('edit-lng');
        const numLat = Number(lat.toFixed(5));
        const numLng = Number(lng.toFixed(5));
        const s = state.stations.find(x => x.id == state.activeStationId);
        if (s && !confirmStationCoordinateOverwrite(s, numLat, numLng, 'Klick auf der Karte')) {
            showToast('Positionierung abgebrochen.', 'info');
            return;
        }
        if (s) {
            s.lat = numLat;
            s.lng = numLng;
        }
        if (latInput) latInput.value = numLat;
        if (lngInput) lngInput.value = numLng;
        updateStationPickerDisplay(lat.toFixed(5), lng.toFixed(5));
        showToast('Stationen-Koordinaten übernommen. Speichern nicht vergessen.', 'success');
    };

    const onClick = (e) => {
        const { lat, lng } = e.latlng;
        tempMarker.setLatLng(e.latlng);
        finalize(lat, lng);
    };

    const onCancel = () => {
        map.off('click', onClick);
        map.off('contextmenu', onCancel);
        tempMarker.remove();
        showToast('Positionierung abgebrochen.', 'info');
    };

    map.once('click', onClick);
    map.once('contextmenu', onCancel);
}

export function clearStationImage() {
    const input = document.getElementById('edit-image');
    if (input) input.value = '';
    const fileInput = document.getElementById('image-upload');
    if (fileInput) fileInput.value = '';
    showToast('Bild entfernt. Bitte speichern, um die Änderung zu übernehmen.', 'info');
}
import { saveData, deleteData } from './data.js';
import { checkIn, toggleLike, toggleFavorite, updateLikeBtn, updateCheckInBtn, updateModalFavBtn } from './gamification.js';

const tagMap = {
    food: "Essen", drink: "Trinken", wc: "WC", kids: "Kinder",
    culture: "Kultur", party: "Party", shop: "Laden", event: "Event"
};

export function renderList(items) {
    const list = document.getElementById('stations-list');
    list.innerHTML = '';
    if (items.length === 0) { list.innerHTML = '<div class="text-center text-gray-500 mt-10 dark:text-gray-400">Keine Ergebnisse.</div>'; return; }
    items.forEach(s => {
        if (!s) return;
        const el = document.createElement('div');
        el.className = 'bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex gap-4 items-center active:bg-gray-50 dark:active:bg-gray-700 transition-colors cursor-pointer relative overflow-hidden';
        el.onclick = () => openModal(s);

        // Image
        const imgDiv = document.createElement('div');
        imgDiv.className = 'w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0 overflow-hidden relative';
        if (s.image) {
            imgDiv.innerHTML = `<img src="${s.image}" class="w-full h-full object-cover" loading="lazy">`;
        } else {
            imgDiv.innerHTML = `<div class="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-500"><i class="ph ph-image text-2xl"></i></div>`;
        }
        el.appendChild(imgDiv);

        // Content
        const content = document.createElement('div');
        content.className = 'flex-1 min-w-0';
        content.innerHTML = `
            <div class="flex justify-between items-start">
                <h3 class="font-bold text-gray-900 dark:text-white truncate pr-2">${escapeHTML(s.name)}</h3>
                <span class="text-xs font-bold text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded border border-yellow-100 dark:border-yellow-800 flex-shrink-0">#${s.id}</span>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 truncate mb-1">${escapeHTML(s.desc)}</p>
            <div class="flex flex-wrap gap-1 mt-1">
                ${s.tags.map(t => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">${tagMap[t] || t}</span>`).join('')}
            </div>
            <div class="flex gap-3 mt-2">
                 <div id="like-count-${s.id}" class="flex items-center text-xs text-gray-400 font-medium">
                    <i class="ph-fill ph-fire text-orange-500 text-xs mr-0.5"></i>${s.likes || 0}
                </div>
                <div class="flex items-center text-xs text-gray-400">
                    <i id="fav-icon-${s.id}" class="ph ${state.favorites.has(s.id) ? 'ph-fill text-red-500' : 'ph-heart'} text-xs mr-1"></i>
                </div>
            </div>
        `;
        el.appendChild(content);
        list.appendChild(el);
    });
}

export function filterStations(query) {
    if (!query) {
        renderList(state.stations);
        return;
    }
    query = query.toLowerCase();
    const filtered = state.stations.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.desc.toLowerCase().includes(query) ||
        s.id.toString().includes(query) ||
        s.tags.some(t => (tagMap[t] || t).toLowerCase().includes(query))
    );
    renderList(filtered);
}

export function filterList(category) {
    // Update Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick');
        if (onclick && onclick.includes(`'${category}'`)) {
            btn.className = 'filter-btn active px-4 py-1 rounded-full text-sm bg-yellow-600 text-white font-medium whitespace-nowrap shadow-sm';
            // Fix icon color for favorites if active
            if (category === 'favorites') btn.innerHTML = `<i class="ph-fill ph-heart text-white mr-1"></i>Favoriten`;
        } else {
            btn.className = 'filter-btn px-4 py-1 rounded-full text-sm bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 whitespace-nowrap dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600';
            // Reset icon for favorites
            if (btn.innerText.includes('Favoriten')) btn.innerHTML = `<i class="ph-fill ph-heart text-red-500 mr-1"></i>Favoriten`;
        }
    });

    let filtered = state.stations;
    if (category === 'favorites') {
        filtered = state.stations.filter(s => state.favorites.has(s.id));
    } else if (category !== 'all') {
        filtered = state.stations.filter(s => s.tags.includes(category));
    }
    renderList(filtered);
}

export function renderTimeline() {
    const container = document.getElementById('timeline-container');
    container.innerHTML = '';
    updateCurrentEventDisplay();

    // Downloads Section (Top Placement)
    const d = state.downloads || {};
    let downloadsHtml = '';

    if (d.flyer1) {
        downloadsHtml += `<a href="${d.flyer1}" target="_blank" class="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"><i class="ph ph-file-pdf text-red-500 text-lg"></i>Flyer 1</a>`;
    }
    if (d.flyer2) {
        downloadsHtml += `<a href="${d.flyer2}" target="_blank" class="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"><i class="ph ph-file-pdf text-red-500 text-lg"></i>Flyer 2</a>`;
    }

    // ICS Button
    if (d.icsDate) {
        downloadsHtml += `<button onclick="generateICS()" class="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"><i class="ph ph-calendar-plus text-blue-500 text-lg"></i>Termin in Kalender eintragen</button>`;
    }

    if (downloadsHtml) {
        const dlContainer = document.createElement('div');
        dlContainer.className = 'mb-8';
        dlContainer.innerHTML = `
            <h3 class="font-bold text-gray-900 dark:text-white mb-3 px-1">Downloads & Infos</h3>
            <div class="grid grid-cols-2 gap-3">
                ${downloadsHtml}
            </div>
        `;
        container.appendChild(dlContainer);
    }

    if (state.events.length === 0) {
        container.innerHTML += '<div class="text-center text-gray-500 mt-10">Keine Events.</div>';
        return;
    }

    // Sort by time
    const sorted = [...state.events].sort((a, b) => a.time.localeCompare(b.time));

    sorted.forEach((e, i) => {
        const el = document.createElement('div');
        el.className = 'relative pl-8 pb-8 last:pb-0';

        // Line
        if (i !== sorted.length - 1) {
            const line = document.createElement('div');
            line.className = 'absolute left-[11px] top-3 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700';
            el.appendChild(line);
        }

        // Dot
        const dot = document.createElement('div');
        dot.className = `absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-white dark:border-gray-900 shadow-sm z-10`;
        // Color mapping
        let bg = 'bg-gray-400';
        if (e.color === 'yellow') bg = 'bg-yellow-500';
        if (e.color === 'red') bg = 'bg-red-500';
        if (e.color === 'purple') bg = 'bg-purple-500';
        if (e.color === 'blue') bg = 'bg-blue-500';
        dot.classList.add(bg);
        el.appendChild(dot);

        // Content
        // Content
        const isAdmin = state.isAdmin;
        const clickAttr = isAdmin ? `onclick="openEventModal('${e.id}')"` : '';
        const cursorClass = isAdmin ? 'cursor-pointer hover:border-yellow-400' : '';

        el.innerHTML += `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-colors ${cursorClass}" ${clickAttr}>
                <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-yellow-600 dark:text-yellow-500 text-sm font-mono">${escapeHTML(e.time)}</span>
                    ${isAdmin ? `<button class="text-xs text-gray-400 hover:text-black" onclick="event.stopPropagation(); openEventModal('${e.id}')"><i class="ph ph-pencil"></i></button>` : ''}
                </div>
                <h3 class="font-bold text-gray-900 dark:text-white text-lg leading-tight mb-1">${escapeHTML(e.title)}</h3>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">${escapeHTML(e.desc)}</p>
                <div class="flex items-center text-xs text-gray-500 dark:text-gray-500">
                    <i class="ph-fill ph-map-pin mr-1"></i> ${escapeHTML(e.loc)}
                </div>
            </div>
        `;
        container.appendChild(el);
    });
}

function updateCurrentEventDisplay() {
    const container = document.getElementById('current-event-display');
    if (!container) return;

    const now = new Date();

    // Check if event is over (after 22.11.2025)
    // Note: Month is 0-indexed (10 = November)
    const eventDate = new Date(2025, 10, 22);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (today > eventDate) {
        container.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                    <i class="ph ph-calendar-check text-2xl text-white"></i>
                </div>
                <div>
                    <p class="text-white font-bold">Die Lichternacht 2025 ist vorbei</p>
                    <p class="text-white/80 text-sm">Wir freuen uns auf die nächste!</p>
                </div>
            </div>
        `;
        return;
    }

    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeVal = currentHours * 60 + currentMinutes;

    // Find next or current event
    // Sort events by time
    const sorted = [...state.events].sort((a, b) => a.time.localeCompare(b.time));

    let nextEvent = null;
    let currentEvent = null;

    for (const e of sorted) {
        const [h, m] = e.time.split(':').map(Number);
        const eventTimeVal = h * 60 + m;

        // Assume event lasts 1 hour for "current" logic, or just find the next one starting
        if (eventTimeVal > currentTimeVal) {
            nextEvent = e;
            break;
        }
    }

    if (nextEvent) {
        container.innerHTML = `
            <div class="flex justify-between items-center">
                <div>
                    <p class="text-xs text-white/80 font-bold uppercase tracking-wider">Als nächstes (${nextEvent.time} Uhr)</p>
                    <p class="text-white font-bold text-lg leading-tight">${escapeHTML(nextEvent.title)}</p>
                    <p class="text-white/90 text-sm truncate">${escapeHTML(nextEvent.loc)}</p>
                </div>
                <div class="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                    <i class="ph ph-clock-countdown text-2xl text-white"></i>
                </div>
            </div>
        `;
    } else {
        // No more events today
        container.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                    <i class="ph ph-moon-stars text-2xl text-white"></i>
                </div>
                <div>
                    <p class="text-white font-bold">Die Lichternacht 2025 ist vorbei</p>
                    <p class="text-white/80 text-sm">Wir freuen uns auf die nächste!</p>
                </div>
            </div>
        `;
    }
}

export function generateICS() {
    const d = state.downloads || {};
    const dateStr = d.icsDate || "20251122"; // Fallback
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);

    // Format: YYYYMMDD
    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Lichternacht//Bechhofen//DE
BEGIN:VEVENT
UID:${crypto.randomUUID()}@lichternacht.bechhofen.de
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTSTART:${dateStr}T160000Z
DTEND:${dateStr}T200000Z
SUMMARY:Lichternacht Bechhofen ${year}
DESCRIPTION:Die lange Nacht der Lichter in Bechhofen.
LOCATION:Bechhofen
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `lichternacht-${year}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function openModal(s) {
    state.activeStationId = s.id;
    window.activeStationId = s.id;
    document.getElementById('modal-number').innerText = s.id;
    document.getElementById('modal-title').innerText = s.name;
    document.getElementById('modal-subtitle').innerText = s.tags.map(t => tagMap[t] || t).join(' • ').toUpperCase();

    updateModalFavBtn(s.id);
    updateLikeBtn(s.id, s.likes);
    updateCheckInBtn(s.id);

    // Description & Offer
    let content = `<p class="font-bold text-gray-800 dark:text-gray-200 mb-2"><i class="ph-fill ph-map-pin text-yellow-600 mr-1"></i>${escapeHTML(s.desc)}</p>`;
    if (s.offer) content += `<div class="text-gray-600 dark:text-gray-300 mt-3 border-l-2 border-yellow-500 pl-3 italic">${escapeHTML(s.offer).replace(/\n/g, '<br>')}</div>`;
    if (s.time) content += `<p class="text-yellow-700 dark:text-yellow-500 font-bold mt-4 flex items-center"><i class="ph-fill ph-clock mr-1"></i>${escapeHTML(s.time)} Uhr</p>`;

    document.getElementById('modal-desc').innerHTML = content;

    // Image
    const imgCont = document.getElementById('modal-image-container');
    if (s.image) {
        imgCont.innerHTML = `<img id="modal-image" src="${s.image}" class="w-full h-56 object-contain bg-white">`;
        imgCont.classList.remove('hidden');
    } else {
        imgCont.innerHTML = `<div class="w-full h-40 bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-500"><i class="ph ph-image text-5xl"></i></div>`;
        imgCont.classList.remove('hidden');
    }

    document.getElementById('modal-view-mode').classList.remove('hidden');
    document.getElementById('modal-edit-mode').classList.add('hidden');

    document.getElementById('btn-route').onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`, '_blank');
    document.getElementById('btn-internal-route').onclick = () => { switchTab('map'); closeModal(); if (!state.userLocation) locateUser(() => calculateRoute(s.lat, s.lng)); else calculateRoute(s.lat, s.lng); };

    document.getElementById('detail-modal').classList.remove('hidden');
    requestAnimationFrame(() => document.getElementById('modal-content').classList.remove('translate-y-full'));
}

export function createEventForStation() {
    const s = state.stations.find(x => x.id == state.activeStationId);
    if (!s) {
        showToast('Keine aktive Station gefunden.', 'error');
        return;
    }

    if (!state.isAdmin) {
        showToast('Nur für Admins verfügbar.', 'error');
        return;
    }

    // Neues Event vorbereiten, basierend auf der Station
    const locText = s.name || '';

    openEventModal();
    document.getElementById('evt-title').value = s.name || '';
    document.getElementById('evt-desc').value = s.desc || '';
    const evtLoc = document.getElementById('evt-loc');
    if (evtLoc) evtLoc.value = locText;
    const select = document.getElementById('evt-linked-station');
    if (select) {
        select.value = s.id;
        applyStationToEvent(s.id);
    }
}

export function populateEventStationSelect(selectedId) {
    const select = document.getElementById('evt-linked-station');
    if (!select) return;
    const options = [
        '<option value="">Keine Station</option>',
        ...state.stations.map(s => `<option value="${s.id}">${s.name}</option>`)
    ];
    select.innerHTML = options.join('');
    if (selectedId) select.value = selectedId;
}

export function applyStationToEvent(stationId) {
    const select = document.getElementById('evt-linked-station');
    if (select) select.value = stationId || '';
    if (!stationId) return;
    const station = state.stations.find(s => s.id == stationId);
    if (!station) return;
    const latInput = document.getElementById('evt-lat');
    const lngInput = document.getElementById('evt-lng');
    if (latInput && typeof station.lat === 'number') latInput.value = station.lat.toFixed(5);
    if (lngInput && typeof station.lng === 'number') lngInput.value = station.lng.toFixed(5);
    const locInput = document.getElementById('evt-loc');
    if (locInput && !locInput.value) locInput.value = station.name;
}

export function closeModal() {
    document.getElementById('modal-content').classList.add('translate-y-full');
    setTimeout(() => document.getElementById('detail-modal').classList.add('hidden'), 300);
}

export function switchTab(tab) {
    state.activeTab = tab;

    // Update Nav Icons
    document.querySelectorAll('.nav-icon').forEach(el => el.classList.remove('text-yellow-500', 'scale-110'));
    document.querySelectorAll('.nav-text').forEach(el => el.classList.remove('text-yellow-500', 'font-bold'));

    const activeIcon = document.getElementById(`nav-${tab}`);
    if (activeIcon) {
        activeIcon.querySelector('.nav-icon').classList.add('text-yellow-500', 'scale-110');
        activeIcon.querySelector('.nav-text').classList.add('text-yellow-500', 'font-bold');
    }

    // Hide all views
    document.getElementById('view-map').classList.add('hidden');
    document.getElementById('view-list').classList.add('hidden');
    document.getElementById('view-events').classList.add('hidden');

    // Show active view
    if (tab === 'map') {
        document.getElementById('view-map').classList.remove('hidden');
        setTimeout(() => state.map.invalidateSize(), 100);
    } else if (tab === 'list') {
        document.getElementById('view-list').classList.remove('hidden');
        renderList(state.stations);
    } else if (tab === 'events') {
        document.getElementById('view-events').classList.remove('hidden');
        renderTimeline();
    }
}
export function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', isDark);
    updateDarkModeIcon(isDark);
    updateMapTiles(isDark);
}

export function updateDarkModeIcon(isDark) {
    const icon = document.getElementById('dark-mode-icon');
    if (isDark) {
        icon.classList.replace('ph-moon', 'ph-sun');
        icon.classList.add('text-yellow-400');
    } else {
        icon.classList.replace('ph-sun', 'ph-moon');
        icon.classList.remove('text-yellow-400');
    }
}

export function openHelpModal() { document.getElementById('help-modal').classList.remove('hidden'); }
export function closeHelpModal() { document.getElementById('help-modal').classList.add('hidden'); }

export async function shareStation() {
    const s = state.stations.find(x => x.id == state.activeStationId);
    if (!s) return;

    const shareData = {
        title: `Lichternacht: ${s.name}`,
        text: `Schau dir ${s.name} auf der Lichternacht Bechhofen an!\n${s.desc}`,
        url: window.location.href
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback
            navigator.clipboard.writeText(`${shareData.title}\n${shareData.text}\n${shareData.url}`);
            showToast('Link kopiert!', 'success');
        }
    } catch (err) {
        console.log('Share failed:', err);
    }
}

// --- EDIT MODE ---
export function editStation() {
    const s = state.stations.find(x => x.id == state.activeStationId);
    if (!s) return;
    document.getElementById('modal-view-mode').classList.add('hidden');
    document.getElementById('modal-edit-mode').classList.remove('hidden');
    document.getElementById('edit-name').value = s.name;
    document.getElementById('edit-desc').value = s.desc;
    document.getElementById('edit-offer').value = s.offer || '';
    document.getElementById('edit-tags').value = s.tags.map(t => tagMap[t] || t).join(', ');
    document.getElementById('edit-time').value = s.time || '';
    document.getElementById('edit-image').value = s.image || '';
    renderTagHelper(s.tags);
    // Drag Drop setup would go here
    if (typeof s.lat === 'number' && typeof s.lng === 'number') {
        document.getElementById('edit-lat').value = s.lat;
        document.getElementById('edit-lng').value = s.lng;
        updateStationPickerDisplay(s.lat.toFixed(5), s.lng.toFixed(5));
    }
}

export function renderTagHelper(currentTags) {
    const container = document.getElementById('available-tags');
    container.innerHTML = '';
    Object.entries(tagMap).forEach(([key, label]) => {
        const isActive = currentTags.includes(key);
        const tag = document.createElement('span');
        tag.className = `text-[10px] px-2 py-1 rounded cursor-pointer border ${isActive ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'bg-gray-100 border-gray-200 text-gray-500'}`;
        tag.innerText = label;
        tag.onclick = () => {
            const input = document.getElementById('edit-tags');
            let tags = input.value.split(',').map(t => t.trim()).filter(t => t);
            // Simple toggle logic based on label is tricky because input might have raw tags.
            // Just append for now.
            if (!input.value.includes(label) && !input.value.includes(key)) {
                if (input.value) input.value += ', ' + label;
                else input.value = label;
            }
        };
        container.appendChild(tag);
    });
}

export async function saveStationChanges() {
    const s = state.stations.find(x => x.id == state.activeStationId);
    if (!s) return;

    s.name = document.getElementById('edit-name').value;
    s.desc = document.getElementById('edit-desc').value;
    s.offer = document.getElementById('edit-offer').value;
    s.time = document.getElementById('edit-time').value;
    s.image = document.getElementById('edit-image').value;

    // Parse tags
    const rawTags = document.getElementById('edit-tags').value.split(',');
    const reverseTagMap = Object.fromEntries(Object.entries(tagMap).map(([k, v]) => [v, k]));
    s.tags = rawTags.map(t => {
        t = t.trim();
        return reverseTagMap[t] || t.toLowerCase();
    }).filter(t => t);

    // Simple coordinate validation
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number' || Number.isNaN(s.lat) || Number.isNaN(s.lng)) {
        showToast('Bitte Koordinaten für die Station setzen (Adresse suchen oder Karte + 📍).', 'error');
        return;
    }

    const linkedEvents = state.events.filter(e => e.stationId === s.id);
    for (const ev of linkedEvents) {
        ev.lat = s.lat;
        ev.lng = s.lng;
        await saveData('event', ev);
    }
    await saveData('station', s);
    showToast('Änderungen gespeichert', 'success');

    // Refresh UI
    renderList(state.stations);
    refreshMapMarkers(); // Update map (maybe name changed)
    openModal(s); // Re-render modal
}

export function fillStationCoords() {
    const c = state.map.getCenter();
    const lat = c.lat.toFixed(5);
    const lng = c.lng.toFixed(5);

    const ok = window.confirm(`Aktuelle Kartenmitte für diese Station übernehmen?\n\nKoordinaten: ${lat}, ${lng}`);
    if (!ok) {
        showToast('Übernahme abgebrochen.', 'info');
        return;
    }

    const s = state.stations.find(x => x.id == state.activeStationId);
    if (!s) {
        showToast('Keine aktive Station gefunden.', 'error');
        return;
    }

    const numLat = Number(lat);
    const numLng = Number(lng);
    if (!confirmStationCoordinateOverwrite(s, numLat, numLng, 'Kartenmitte')) {
        showToast('Übernahme abgebrochen.', 'info');
        return;
    }

    s.lat = numLat;
    s.lng = numLng;
    showToast('Koordinaten für Station übernommen. Nach dem Speichern werden Marker aktualisiert.', 'success');
    updateStationPickerDisplay(lat, lng);
}

export async function searchStationAddress() {
    const input = document.getElementById('station-address-search');
    if (!input) return;
    const query = input.value;
    if (!query) return;

    showToast('Suche Stations-Adresse...', 'info');
    try {
        let q = query.trim();
        if (!q.includes(',')) {
            q = `${q}, Bechhofen, Deutschland`;
        }
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=de&limit=3&q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data && data.length > 0) {
            const best = data[0];
            const lat = parseFloat(best.lat);
            const lng = parseFloat(best.lon);
            const name = best.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

            const centerLat = 49.158;
            const centerLng = 10.552;
            const R = 6371;
            const dLat = (lat - centerLat) * Math.PI / 180;
            const dLng = (lng - centerLng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(centerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const cVal = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distanceKm = R * cVal;

            let confirmText = `Gefundene Adresse für Station:\n\n${name}\n\nKoordinaten: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            const maxDistanceKm = (state.config && typeof state.config.maxDistanceKm === 'number')
                ? state.config.maxDistanceKm
                : 10;
            if (distanceKm > maxDistanceKm) {
                confirmText += `\n\nAchtung: Die Position liegt ca. ${distanceKm.toFixed(1)} km vom Zentrum Bechhofen entfernt. Trotzdem übernehmen?`;
            } else {
                confirmText += `\n\nDiese Koordinaten für die Station übernehmen?`;
            }

            const ok = window.confirm(confirmText);
            if (!ok) {
                showToast('Übernahme abgebrochen.', 'info');
                return;
            }

            const s = state.stations.find(x => x.id == state.activeStationId);
            if (!s) {
                showToast('Keine aktive Station gefunden.', 'error');
                return;
            }

            const numLat = Number(lat.toFixed(5));
            const numLng = Number(lng.toFixed(5));
            if (!confirmStationCoordinateOverwrite(s, numLat, numLng, 'Adresssuche')) {
                showToast('Übernahme abgebrochen.', 'info');
                return;
            }
            s.lat = numLat;
            s.lng = numLng;
            const descInput = document.getElementById('edit-desc');
            if (descInput) descInput.value = name;
            showToast('Adresse übernommen. Nach dem Speichern werden Marker aktualisiert.', 'success');
            updateStationPickerDisplay(lat.toFixed(5), lng.toFixed(5));
        } else {
            console.log('Nominatim (Station): keine Ergebnisse', { query, usedQuery: q, data });
            showToast('Adresse nicht gefunden.', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Fehler bei der Suche.', 'error');
    }
}

export async function deleteStation() {
    if (!confirm("Wirklich löschen?")) return;
    await deleteData('station', state.activeStationId);
    showToast('Station gelöscht', 'success');
    closeModal();
    // Refresh
    location.reload(); // Simplest way to refresh everything
}

// Event Edit
export function openEventModal(id) {
    if (!state.isAdmin) return;
    if (id) {
        state.activeEventId = id;
        const e = state.events.find(x => x.id == id);
        document.getElementById('evt-time').value = e.time;
        document.getElementById('evt-title').value = e.title;
        document.getElementById('evt-desc').value = e.desc;
        document.getElementById('evt-loc').value = e.loc;
        document.getElementById('evt-lat').value = e.lat;
        document.getElementById('evt-lng').value = e.lng;
        document.getElementById('evt-color').value = e.color;
        document.getElementById('btn-delete-event').classList.remove('hidden');
        populateEventStationSelect(e.stationId || '');
    } else {
        state.activeEventId = null;
        document.getElementById('evt-time').value = '';
        document.getElementById('evt-title').value = '';
        document.getElementById('evt-desc').value = '';
        document.getElementById('evt-loc').value = '';
        document.getElementById('evt-lat').value = '';
        document.getElementById('evt-lng').value = '';
        document.getElementById('evt-color').value = 'yellow';
        document.getElementById('btn-delete-event').classList.add('hidden');
        populateEventStationSelect('');
    }
    document.getElementById('event-modal').classList.remove('hidden');
}

export function closeEventModal() { document.getElementById('event-modal').classList.add('hidden'); }

export function fillEventCoords() {
    const c = state.map.getCenter();
    const lat = c.lat.toFixed(5);
    const lng = c.lng.toFixed(5);

    const ok = window.confirm(`Aktuelle Kartenmitte verwenden?\n\nKoordinaten: ${lat}, ${lng}`);
    if (!ok) {
        showToast('Übernahme abgebrochen.', 'info');
        return;
    }

    document.getElementById('evt-lat').value = lat;
    document.getElementById('evt-lng').value = lng;
    showToast('Koordinaten übernommen.', 'success');
}

export async function searchAddress() {
    const query = document.getElementById('evt-address-search').value;
    if (!query) return;

    showToast('Suche Adresse...', 'info');
    try {
        let q = query.trim();

        // Wenn kein Ort angegeben ist, automatisch Bechhofen, Deutschland ergänzen
        if (!q.includes(',')) {
            q = `${q}, Bechhofen, Deutschland`;
        }

        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=de&limit=3&q=${encodeURIComponent(q)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data && data.length > 0) {
            const best = data[0];

            const lat = parseFloat(best.lat);
            const lng = parseFloat(best.lon);

            const name = best.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

            // Zentrum Bechhofen (ca.)
            const centerLat = 49.158;
            const centerLng = 10.552;

            // Haversine-Distanz in km
            const R = 6371; // Erdradius in km
            const dLat = (lat - centerLat) * Math.PI / 180;
            const dLng = (lng - centerLng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(centerLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distanceKm = R * c;

            let confirmText = `Gefundene Adresse:\n\n${name}\n\nKoordinaten: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

            const maxDistanceKm = (state.config && typeof state.config.maxDistanceKm === 'number')
                ? state.config.maxDistanceKm
                : 10; // Schwellwert in km für Warnung
            if (distanceKm > maxDistanceKm) {
                confirmText += `\n\nAchtung: Die Position liegt ca. ${distanceKm.toFixed(1)} km vom Zentrum Bechhofen entfernt. Trotzdem übernehmen?`;
            } else {
                confirmText += `\n\nDiese Koordinaten für das Event übernehmen?`;
            }

            const ok = window.confirm(confirmText);
            if (!ok) {
                showToast('Übernahme abgebrochen.', 'info');
                return;
            }

            document.getElementById('evt-lat').value = lat.toFixed(5);
            document.getElementById('evt-lng').value = lng.toFixed(5);
            showToast('Adresse übernommen.', 'success');
        } else {
            console.log('Nominatim: keine Ergebnisse', { query, usedQuery: q, data });
            showToast('Adresse nicht gefunden.', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Fehler bei der Suche.', 'error');
    }
}

export async function saveEventChanges() {
    const time = document.getElementById('evt-time').value;
    const title = document.getElementById('evt-title').value;
    const desc = document.getElementById('evt-desc').value;

    // Validation
    if (!time || !title) {
        showToast('Bitte Zeit und Titel ausfüllen!', 'error');
        return;
    }

    // Time Format Validation (HH:MM)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
        showToast('Ungültige Uhrzeit! Format: HH:MM (00:00 - 23:59)', 'error');
        return;
    }

    const id = state.activeEventId || 'e' + Date.now();
    const stationSelect = document.getElementById('evt-linked-station');
    const linkedStationId = stationSelect && stationSelect.value ? Number(stationSelect.value) : null;

    const newItem = {
        id: id,
        time: time,
        title: title,
        desc: desc,
        loc: document.getElementById('evt-loc').value,
        lat: Number(document.getElementById('evt-lat').value),
        lng: Number(document.getElementById('evt-lng').value),
        color: document.getElementById('evt-color').value,
        stationId: linkedStationId
    };

    if (Number.isNaN(newItem.lat) || Number.isNaN(newItem.lng)) {
        showToast('Bitte Koordinaten für das Event setzen (Adresse suchen oder Karte + 📍).', 'error');
        return;
    }

    if (state.activeEventId) {
        // Update existing in array
        const idx = state.events.findIndex(x => x.id == id);
        if (idx >= 0) state.events[idx] = newItem;
    } else {
        state.events.push(newItem);
    }

    await saveData('event', newItem);
    showToast('Event gespeichert', 'success');
    closeEventModal();
    renderTimeline();
}

export async function deleteEvent() {
    if (!state.activeEventId) return;
    if (!confirm("Event löschen?")) return;
    await deleteData('event', state.activeEventId);
    showToast('Event gelöscht', 'success');
    closeEventModal();
    location.reload();
}

export function setupDragDrop() {
    const dropZone = document.getElementById('image-upload-btn');
    if (!dropZone) return;

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
        if (files.length) {
            handleImageUpload({ files: files });
        }
    }
}

export function openBugReportModal() {
    closeHelpModal();
    document.getElementById('bug-report-modal').classList.remove('hidden');
    document.getElementById('bug-desc').value = '';
    document.getElementById('bug-desc').focus();
}

export async function submitBugReport() {
    const desc = document.getElementById('bug-desc').value;
    if (!desc.trim()) {
        showToast('Bitte beschreibe das Problem.', 'error');
        return;
    }

    setLoading(true, "Bereite E-Mail vor...");
    try {
        const techInfo = `
--------------------------------
Technische Daten (automatisch):
UserAgent: ${navigator.userAgent}
Screen: ${window.screen.width}x${window.screen.height}
URL: ${window.location.href}
Platform: ${navigator.platform}
Time: ${new Date().toLocaleString()}
--------------------------------`;

        const body = encodeURIComponent(`${desc}\n\n${techInfo}`);
        const subject = encodeURIComponent('Bug Report: Lichternacht App');
        const mailtoLink = `mailto:info@lichternacht-bechhofen.de?subject=${subject}&body=${body}`;

        // Open Mail Client
        window.location.href = mailtoLink;

        showToast('E-Mail Programm geöffnet.', 'success');
        document.getElementById('bug-report-modal').classList.add('hidden');
    } catch (e) {
        console.error(e);
        showToast('Fehler beim Öffnen der Mail.', 'error');
    } finally {
        setLoading(false);
    }
}

