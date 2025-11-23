import { state } from './state.js';
import { showToast, escapeHTML, setLoading } from './utils.js';
import { updateMapTiles, locateUser, calculateRoute } from './map.js';
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
    if (state.events.length === 0) { container.innerHTML = '<div class="text-center text-gray-500 mt-10">Keine Events.</div>'; return; }

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
        el.innerHTML += `
            <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm cursor-pointer hover:border-yellow-400 transition-colors" onclick="openEventModal('${e.id}')">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-yellow-600 dark:text-yellow-500 text-sm font-mono">${escapeHTML(e.time)}</span>
                    ${state.isAdmin ? `<button class="text-xs text-gray-400 hover:text-black" onclick="event.stopPropagation(); openEventModal('${e.id}')"><i class="ph ph-pencil"></i></button>` : ''}
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

    updateCurrentEventDisplay();
}

function updateCurrentEventDisplay() {
    const container = document.getElementById('current-event-display');
    if (!container) return;

    const now = new Date();
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
                    <p class="text-white font-bold">Programm beendet</p>
                    <p class="text-white/80 text-sm">Wir sehen uns nächstes Jahr!</p>
                </div>
            </div>
        `;
    }
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

    await saveData('station', s);
    showToast('Änderungen gespeichert', 'success');

    // Refresh UI
    renderList(state.stations);
    refreshMapMarkers(); // Update map (maybe name changed)
    openModal(s); // Re-render modal
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
    }
    document.getElementById('event-modal').classList.remove('hidden');
}

export function closeEventModal() { document.getElementById('event-modal').classList.add('hidden'); }

export function fillEventCoords() {
    const c = state.map.getCenter();
    document.getElementById('evt-lat').value = c.lat.toFixed(5);
    document.getElementById('evt-lng').value = c.lng.toFixed(5);
}

export async function saveEventChanges() {
    const id = state.activeEventId || 'e' + Date.now();
    const newItem = {
        id: id,
        time: document.getElementById('evt-time').value,
        title: document.getElementById('evt-title').value,
        desc: document.getElementById('evt-desc').value,
        loc: document.getElementById('evt-loc').value,
        lat: Number(document.getElementById('evt-lat').value),
        lng: Number(document.getElementById('evt-lng').value),
        color: document.getElementById('evt-color').value
    };

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

export function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('edit-image').value = e.target.result;
        showToast('Bild geladen (Base64)', 'success');
    };
    reader.readAsDataURL(file);
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
