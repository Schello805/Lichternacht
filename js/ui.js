
import { state } from './state.js';
import { showToast, getDistance } from './utils.js';
import { saveData, deleteData } from './data.js';
import { refreshMapMarkers } from './map.js';

// --- Modal & Tab Handling ---

export function openModal(target) {
    if (typeof target === 'string') {
        // Simple ID toggle
        const el = document.getElementById(target);
        if (el) el.classList.remove('hidden');
    } else if (typeof target === 'object' && target !== null) {
        // Station Object
        const s = target;
        state.activeStationId = s.id;
        window.activeStationId = s.id; // Wichtig für HTML onclicks
        
        // Populate Modal
        document.getElementById('modal-title').innerText = s.name;
        document.getElementById('modal-subtitle').innerText = s.desc || '';
        document.getElementById('modal-desc').innerText = s.offer || s.desc || 'Keine Beschreibung verfügbar.';
        
        // Fix ID Display
        const numEl = document.getElementById('modal-number');
        if (numEl) numEl.innerText = s.id;
        
        // Image
        const imgContainer = document.getElementById('modal-image-container');
        if (s.image) {
            imgContainer.innerHTML = `<img src="${s.image}" class="w-full h-48 object-cover rounded-t-2xl">`;
            imgContainer.classList.remove('hidden');
        } else {
            imgContainer.classList.add('hidden');
        }

        // Route & Maps Buttons
        const btnRoute = document.getElementById('btn-internal-route');
        const btnMaps = document.getElementById('btn-route');
        
        if (btnRoute) {
            btnRoute.onclick = () => {
                closeModal();
                if (window.calculateRoute) window.calculateRoute(s.lat, s.lng);
            };
        }
        
        if (btnMaps) {
            btnMaps.onclick = () => {
                const url = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
                window.open(url, '_blank');
            };
        }

        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('modal-content');
        if (modal) {
            modal.classList.remove('hidden');
            // Animate in - Double RAF for safety
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (content) content.classList.remove('translate-y-full');
                });
            });
            
            // Reset view mode
            document.getElementById('modal-view-mode').classList.remove('hidden');
            document.getElementById('modal-edit-mode').classList.add('hidden');
        }
    }
}

export function openStation(id) {
    const s = state.stations.find(x => x.id == id);
    if (s) {
        openModal(s);
    } else {
        console.error("Station not found:", id);
    }
}

export function closeModal(id) {
    if (!id) {
        // Default to detail modal if no ID passed (e.g. from X button)
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('modal-content');
        
        // Reset active station highlight
        if (state.activeStationId) {
            state.activeStationId = null;
            window.activeStationId = null;
            refreshMapMarkers();
        }

        if (content) content.classList.add('translate-y-full');
        
        // Wait for animation
        setTimeout(() => {
            if (modal) modal.classList.add('hidden');
        }, 300);
        return;
    }

    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

export function switchTab(tab) {
    console.log("switchTab called for:", tab);
    
    // Hide all views
    const views = ['view-map', 'view-list', 'view-events'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('hidden');
            el.style.display = 'none'; 
        }
    });
    
    // Deactivate all nav buttons
    const navs = ['nav-map', 'nav-list', 'nav-events'];
    navs.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.remove('tab-active', 'text-yellow-600', 'font-bold');
            btn.classList.add('tab-inactive', 'text-gray-500');
        }
    });
    
    // Show selected view
    const content = document.getElementById(`view-${tab}`);
    if (content) {
        content.classList.remove('hidden');
        content.style.display = ''; 
        if (tab === 'list') content.style.display = 'flex';
        else content.style.display = 'block';
        
        console.log("Showing view:", `view-${tab}`);
    } else {
        console.error("View not found:", `view-${tab}`);
    }
    
    // Activate selected button
    const activeBtn = document.getElementById(`nav-${tab}`);
    if (activeBtn) {
        activeBtn.classList.remove('tab-inactive', 'text-gray-500');
        activeBtn.classList.add('tab-active', 'text-yellow-600', 'font-bold');
    }

    if (tab === 'map') {
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
            if (state.map) state.map.invalidateSize();
        }, 50);
    }
}

// Alias for backward compatibility
export const appSwitchTab = switchTab;

export function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    updateDarkModeIcon(isDark);
    
    // JS Fallback for styling (if CSS fails/lags)
    const header = document.getElementById('main-header');
    if (header) {
        header.style.backgroundColor = isDark ? 'rgba(17, 24, 39, 0.9)' : '';
        header.style.borderBottomColor = isDark ? 'rgba(202, 138, 4, 0.2)' : '';
    }
    const map = document.getElementById('map');
    if (map) {
        map.style.backgroundColor = isDark ? '#1f2937' : '';
    }
    
    // Update Meta Theme Color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.content = isDark ? '#111827' : '#fbbf24';
    }
}

export function updateDarkModeIcon(isDark) {
    const icon = document.getElementById('dark-mode-icon');
    if (icon) {
        icon.className = isDark ? 'ph ph-sun text-xl' : 'ph ph-moon text-xl';
    }
}

export function openHelpModal() {
    openModal('help-modal');
}

export function closeHelpModal() {
    closeModal('help-modal');
}

// --- Rendering ---

export const TAG_TRANSLATIONS = {
    'food': 'Essen',
    'drink': 'Getränke',
    'kids': 'Kinder',
    'wc': 'WC',
    'shop': 'Einkaufen',
    'culture': 'Kultur',
    'party': 'Party',
    'event': 'Event'
};

let currentFilter = 'all';

export function renderFilterBar() {
    const container = document.getElementById('filter-bar');
    if (!container) return;
    
    console.log("Rendering Filter Bar v1.4.56");

    // Collect all tags from stations
    const allTags = new Set();
    state.stations.forEach(s => {
        if (s.tags) s.tags.forEach(t => allTags.add(t));
    });
    
    // Add default tags that should always appear if they exist or not? 
    // Maybe just show what we have.
    // Ensure the basic ones are there if they are in data.
    
    const sortedTags = [...allTags].sort();

    let html = `
        <button onclick="filterList('all')" data-tag="all" 
            class="filter-btn px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap shadow-sm ${currentFilter === 'all' ? 'active bg-yellow-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}">Alle</button>
        <button onclick="filterList('proximity')" data-tag="proximity" 
            class="filter-btn px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap shadow-sm ${currentFilter === 'proximity' ? 'active bg-yellow-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}"><i class="ph-fill ph-compass ${currentFilter === 'proximity' ? 'text-white' : 'text-blue-500'} mr-1"></i>in der Nähe</button>
        <button onclick="filterList('favorites')" data-tag="favorites" 
            class="filter-btn px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap shadow-sm ${currentFilter === 'favorites' ? 'active bg-yellow-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}"><i class="ph-fill ph-heart ${currentFilter === 'favorites' ? 'text-white' : 'text-red-500'} mr-1"></i>Favoriten</button>
        <button onclick="filterList('visited')" data-tag="visited" 
            class="filter-btn px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap shadow-sm ${currentFilter === 'visited' ? 'active bg-yellow-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}"><i class="ph-fill ph-check-circle ${currentFilter === 'visited' ? 'text-white' : 'text-green-500'} mr-1"></i>Besucht</button>
        
        <!-- SEPARATOR (Inline Styles for safety) -->
        <div style="width: 2px; height: 24px; background-color: #9ca3af; margin: 0 3px; flex-shrink: 0; align-self: center; border-radius: 99px;"></div>

    `;

    sortedTags.forEach(tag => {
        const label = TAG_TRANSLATIONS[tag] || tag;
        const isActive = currentFilter === tag;
        const classes = isActive 
            ? 'active bg-yellow-600 text-white' 
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50';
            
        html += `<button onclick="filterList('${tag}')" data-tag="${tag}" 
            class="filter-btn px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap shadow-sm ${classes}">${label}</button>`;
    });

    container.innerHTML = html;
}

export function checkPlanningMode() {
    // 1. Check Config
    let isActive = false;
    const mode = state.config?.planningMode;
    if (mode === true || mode === 'true' || mode === 'on' || mode === 1) {
        isActive = true;
    }
    console.log("checkPlanningMode isActive:", isActive);

    // 2. Remove EXISTING banner (static or dynamic) to ensure clean slate
    const existing = document.getElementById('planning-banner');
    if (existing) existing.remove();

    // 3. If NOT active, we are done (banner removed above)
    if (!isActive) return;

    // 4. Create NEW Dynamic Banner (Robuste Methode)
    const overlay = document.createElement('div');
    overlay.id = 'planning-banner';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(0, 0, 0, 0.85);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(8px);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        opacity: 0;
        transition: opacity 0.3s ease-out;
    `;

    const text = state.config.planningText || "Die nächste Lichternacht ist in Planung. Die hier gezeigten Daten sind noch vom letzten Jahr.";

    overlay.innerHTML = `
        <div style="
            background: white; 
            padding: 32px; 
            border-radius: 24px; 
            max-width: 400px; 
            width: 90%; 
            text-align: center; 
            position: relative; 
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255,255,255,0.1);
            transform: scale(0.95);
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        ">
            <button onclick="closePlanningBanner()" style="
                position: absolute; 
                top: 16px; 
                right: 16px; 
                background: #f3f4f6; 
                border: none; 
                width: 32px; 
                height: 32px; 
                border-radius: 50%; 
                font-size: 20px; 
                line-height: 1;
                cursor: pointer; 
                color: #6b7280;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            " onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">&times;</button>
            
            <div style="font-size: 64px; margin-bottom: 16px; line-height: 1;">🚧</div>
            
            <h2 style="
                font-size: 24px; 
                font-weight: 800; 
                margin: 0 0 12px 0; 
                color: #111827; 
                font-family: inherit;
            ">In Planung!</h2>
            
            <p id="planning-text" style="
                font-size: 16px; 
                color: #4b5563; 
                margin-bottom: 24px; 
                line-height: 1.6;
            ">
                ${text}
            </p>
            
            <button onclick="closePlanningBanner()" style="
                background-color: #eab308; 
                color: white; 
                font-weight: bold; 
                padding: 14px 32px; 
                border-radius: 12px; 
                border: none; 
                cursor: pointer; 
                width: 100%; 
                font-size: 16px; 
                box-shadow: 0 4px 6px -1px rgba(234, 179, 8, 0.3);
                transition: transform 0.1s, box-shadow 0.1s;
            " onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform='scale(1)'">
                Verstanden
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Trigger Animation
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.firstElementChild.style.transform = 'scale(1)';
    });
}

export function closePlanningBanner() {
    const banner = document.getElementById('planning-banner');
    if (banner) banner.remove();
}

export function renderList(stations) {
    const container = document.getElementById('stations-list');
    if (!container) return;
    
    // Create a copy to avoid mutating the original if we sort, and add dist property safely
    let listToRender = stations.map(s => ({...s}));

    // If we have a user location, calculate distances!
    if (state.userLocation) {
        listToRender.forEach(s => {
            const lat = parseFloat(s.lat);
            const lng = parseFloat(s.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                const d = getDistance(state.userLocation.lat, state.userLocation.lng, lat, lng);
                s._dist = d; 
            } else {
                s._dist = null;
            }
        });
    }

    // Sort Logic
    if (currentFilter === 'proximity' && state.userLocation) {
        // Sort by distance (nearest first)
        listToRender.sort((a, b) => (a._dist || 9999999) - (b._dist || 9999999));
    } else {
        // Default Sort: ID (numeric with string fallback)
        listToRender.sort((a, b) => {
            const idA = parseInt(a.id);
            const idB = parseInt(b.id);
            
            if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
            return String(a.id).localeCompare(String(b.id), undefined, { numeric: true, sensitivity: 'base' });
        });
    }

    // Get visited stations
    let visitedStations = new Set();
    try {
        const saved = localStorage.getItem('visited_stations');
        if (saved) visitedStations = new Set(JSON.parse(saved));
    } catch (e) { }

    container.innerHTML = listToRender.map(s => {
        const translatedTags = (s.tags || []).map(t => TAG_TRANSLATIONS[t] || t);
        const isVisited = visitedStations.has(s.id);
        const likeCount = s.likes || 0;
        
        let distInfo = '';
        // Only show distance if user location is active AND distance is calculated
        if (state.userLocation && s._dist !== undefined && s._dist !== null) {
            // Factor 1.3 for walking detour (not straight line)
            const walkingDist = s._dist * 1.3;
            const minutes = Math.ceil(walkingDist / 80); // ~4.8 km/h
            
            // Use walkingDist for display to satisfy "not air line" request
            const distStr = walkingDist > 1000 ? (walkingDist/1000).toFixed(1) + ' km' : Math.round(walkingDist) + ' m';
            
            distInfo = `
                <div class="mt-2 flex items-center gap-3 text-xs text-gray-500 font-medium border-t border-gray-100 pt-2 dark:border-gray-700">
                    <span class="flex items-center gap-1 text-blue-600 dark:text-blue-400"><i class="ph-fill ph-navigation-arrow"></i> ${distStr}</span>
                    <span class="flex items-center gap-1"><i class="ph-fill ph-person-simple-walk"></i> ca. ${minutes} min</span>
                </div>
            `;
        }

        return `
        <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4 relative overflow-hidden" onclick="openStation('${s.id}')">
            ${isVisited ? `<div class="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-bl-lg shadow-sm z-10 flex items-center gap-1" style="position: absolute; top: 0; right: 0; font-size: 10px;"><i class="ph-fill ph-check-circle"></i> BESUCHT</div>` : ''}
            <div class="flex justify-between items-start">
                <h3 class="font-bold text-lg ${isVisited ? 'text-green-700 dark:text-green-400' : ''}">${s.name}</h3>
                <div class="flex flex-col items-end gap-1">
                    <span class="text-xs font-bold ${isVisited ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-700'} px-1.5 py-0.5 rounded ${isVisited ? 'mr-24' : ''}">#${s.id}</span>
                    ${likeCount > 0 ? `<span class="text-xs text-gray-400 flex items-center gap-1 ${isVisited ? 'mr-24' : ''}"><i class="ph-fill ph-thumbs-up text-orange-500"></i> ${likeCount}</span>` : ''}
                </div>
            </div>
            <p class="text-gray-600 dark:text-gray-400">${s.desc}</p>
            <div class="mt-2 flex gap-2 flex-wrap">
                ${translatedTags.map(t => `<span class="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">${t}</span>`).join('')}
            </div>
            ${distInfo}
        </div>
    `}).join('');
}

export function refreshStationList() {
    filterList(currentFilter);
}

export function filterStations(query) {
    // Basic filter implementation
    const lower = query.toLowerCase();
    const filtered = state.stations.filter(s => 
        s.name.toLowerCase().includes(lower) || 
        (s.desc && s.desc.toLowerCase().includes(lower))
    );
    renderList(filtered);
}

export function filterList(tag) {
    currentFilter = tag;
    
    // Update active button state
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        const btnTag = btn.dataset.tag;
        if (btnTag === tag) {
            // Update heart icon if it's favorites
            const icon = btn.querySelector('.ph-heart');
            if(icon) { icon.classList.remove('text-red-500'); icon.classList.add('text-white'); }
            // Update nav icon if it's proximity
            const navIcon = btn.querySelector('.ph-compass');
            if(navIcon) { navIcon.classList.remove('text-blue-500'); navIcon.classList.add('text-white'); }
            // Update check icon if it's visited
            const checkIcon = btn.querySelector('.ph-check-circle');
            if(checkIcon) { checkIcon.classList.remove('text-green-500'); checkIcon.classList.add('text-white'); }
        } else {
            btn.classList.remove('active', 'bg-yellow-600', 'text-white');
            btn.classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300', 'hover:bg-gray-50');
            // Reset heart icon
            const icon = btn.querySelector('.ph-heart');
            if(icon) { icon.classList.remove('text-white'); icon.classList.add('text-red-500'); }
            // Reset nav icon
            const navIcon = btn.querySelector('.ph-compass');
            if(navIcon) { navIcon.classList.remove('text-white'); navIcon.classList.add('text-blue-500'); }
            // Reset check icon
            const checkIcon = btn.querySelector('.ph-check-circle');
            if(checkIcon) { checkIcon.classList.remove('text-white'); checkIcon.classList.add('text-green-500'); }
        }
    });

    if (tag === 'all') {
        if (state.userLocation) showToast("Sortierung: Standard (Nummer)", 'info');
        renderList(state.stations);
        return;
    }
    
    if (tag === 'proximity') {
        if (!state.userLocation) {
            showToast("Standort wird ermittelt...", 'info');
            if (window.locateUser) window.locateUser(() => {
                renderList(state.stations);
            });
        }
        renderList(state.stations); // Render anyway, might sort later when loc is found
        return;
    }
    
    if (tag === 'favorites') {
        const favs = state.stations.filter(s => state.favorites.has(s.id));
        renderList(favs);
        if (favs.length === 0) {
            showToast("Keine Favoriten markiert", 'info');
        }
        return;
    }

    if (tag === 'visited') {
        let visitedStations = new Set();
        try {
            const saved = localStorage.getItem('visited_stations');
            if (saved) visitedStations = new Set(JSON.parse(saved));
        } catch (e) { }
        
        const visited = state.stations.filter(s => visitedStations.has(s.id));
        renderList(visited);
        
        if (visited.length === 0) {
            showToast("Noch keine Stationen besucht", 'info');
        }
        return;
    }

    // Filter by tag
    const filtered = state.stations.filter(s => s.tags && s.tags.includes(tag));
    renderList(filtered);
}

// --- Helper for Tag Picking ---
function renderTagPicker() {
    const container = document.getElementById('available-tags');
    const input = document.getElementById('edit-tags');
    if (!container || !input) return;

    // Default + Existing Tags
    const allTags = new Set(Object.keys(TAG_TRANSLATIONS));
    state.stations.forEach(s => s.tags?.forEach(t => allTags.add(t)));
    
    // Parse current input
    const currentTags = new Set(input.value.split(',').map(t => t.trim()).filter(t => t));

    // Ensure currently selected tags are visible even if not in global list yet
    currentTags.forEach(t => allTags.add(t));

    container.innerHTML = [...allTags].sort().map(tag => {
        const label = TAG_TRANSLATIONS[tag] || tag;
        const isActive = currentTags.has(tag);
        const bg = isActive ? 'bg-yellow-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300';
        return `<span onclick="toggleEditTag('${tag}')" class="cursor-pointer px-2 py-1 rounded text-xs select-none transition-colors ${bg}">${label}</span>`;
    }).join('') + 
    `<span onclick="addNewTag()" class="cursor-pointer px-2 py-1 rounded text-xs select-none transition-colors bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-300 font-bold flex items-center gap-1"><i class="ph ph-plus"></i> Neu</span>`;
}

window.addNewTag = () => {
    const newTag = prompt("Neuer Tag Name (z.B. 'pizza'):");
    if (!newTag) return;
    
    const cleanTag = newTag.toLowerCase().trim();
    if (!cleanTag) return;
    
    // Add to input if not exists
    const input = document.getElementById('edit-tags');
    let tags = input.value.split(',').map(t => t.trim()).filter(t => t);
    
    if (!tags.includes(cleanTag)) {
        tags.push(cleanTag);
        input.value = tags.join(', ');
        
        // Also add to global translations if simple? Or just let it be.
        // It will appear in allTags next render because we add it to input.
        // But for it to persist in "allTags" across stations, it needs to be saved to a station.
        // That happens when we save this station.
        
        renderTagPicker();
    }
};

window.toggleEditTag = (tag) => {
    const input = document.getElementById('edit-tags');
    let tags = input.value.split(',').map(t => t.trim()).filter(t => t);
    if (tags.includes(tag)) {
        tags = tags.filter(t => t !== tag);
    } else {
        tags.push(tag);
    }
    input.value = tags.join(', ');
    renderTagPicker(); 
};

// --- Editing / Admin ---

export function editStation(id) {
    const sId = id || state.activeStationId;
    const s = state.stations.find(x => x.id == sId);
    if (!s) return;

    state.activeStationId = s.id;
    window.activeStationId = s.id;

    // Populate fields
    document.getElementById('edit-id').value = s.id;
    document.getElementById('edit-name').value = s.name;
    document.getElementById('edit-desc').value = s.desc || '';
    document.getElementById('edit-offer').value = s.offer || '';
    document.getElementById('edit-lat').value = s.lat;
    document.getElementById('edit-lng').value = s.lng;
    document.getElementById('edit-tags').value = (s.tags || []).join(', ');
    document.getElementById('edit-time').value = s.time || '';

    // Init Tag Picker
    renderTagPicker();
    document.getElementById('edit-tags').oninput = () => renderTagPicker();

    // Image UI
    updateImageUploadUI(s.image);

    // Toggle Views
    document.getElementById('modal-view-mode').classList.add('hidden');
    document.getElementById('modal-edit-mode').classList.remove('hidden');
}

function updateImageUploadUI(imageSrc) {
    const btn = document.getElementById('image-upload-btn');
    const removeBtn = document.getElementById('btn-remove-image');
    
    if (imageSrc) {
        // Show Image Preview in Button
        btn.className = "w-full h-48 relative rounded-lg overflow-hidden border border-gray-300 group cursor-pointer";
        btn.innerHTML = `
            <img src="${imageSrc}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white font-bold gap-2">
                <i class="ph ph-camera text-xl"></i>
                <span>Ändern</span>
            </div>
        `;
        if (removeBtn) removeBtn.classList.remove('hidden');
    } else {
        // Default Upload State
        btn.className = "w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-yellow-500 transition-colors flex items-center justify-center gap-2";
        btn.innerHTML = `
            <i class="ph ph-camera text-xl"></i>
            <span>Foto hochladen / wählen</span>
        `;
        if (removeBtn) removeBtn.classList.add('hidden');
    }
}

export async function saveStationChanges() {
    const oldId = state.activeStationId;
    const s = state.stations.find(x => x.id == oldId);
    if (!s) return;

    // Read ID (and ensure it's treated consistently, likely number for stations)
    const idInput = document.getElementById('edit-id').value;
    
    // Improved ID parsing: Only convert to number if it's purely numeric
    let newId = idInput;
    if (/^\d+$/.test(idInput)) {
        newId = parseInt(idInput, 10);
    }

    // Validation: Check if ID exists (and is not self)
    const exists = state.stations.some(x => x.id == newId && x.id != oldId);
    if (exists) {
        showToast(`Fehler: Die Nummer ${newId} ist bereits vergeben!`, 'error');
        return;
    }

    const newName = document.getElementById('edit-name').value;
    const newDesc = document.getElementById('edit-desc').value;
    const newOffer = document.getElementById('edit-offer').value;
    // Lat/Lng might have been updated by dragging (we need to ensure drag updates the hidden fields)
    const newLat = parseFloat(document.getElementById('edit-lat').value);
    const newLng = parseFloat(document.getElementById('edit-lng').value);
    
    // Parse Tags
    const tagsInput = document.getElementById('edit-tags').value;
    const newTags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

    if (!newName) {
        showToast("Name darf nicht leer sein", 'error');
        return;
    }

    // Update Local Object
    // If ID changed, we need to handle that carefully
    const idChanged = (newId != oldId);
    
    if (idChanged) {
        if (!confirm(`Möchtest du die Station wirklich von Nr. ${oldId} in Nr. ${newId} umbenennen?`)) return;
    }

    s.id = newId;
    s.name = newName;
    s.desc = newDesc;
    s.offer = newOffer;
    s.lat = newLat;
    s.lng = newLng;
    s.tags = newTags;
    s.time = document.getElementById('edit-time').value;

    try {
        // If ID changed, we must DELETE the old doc first (or after) to avoid duplicates
        if (idChanged) {
            await deleteData('station', oldId);
            console.log(`Old station ${oldId} deleted`);
        }

        await saveData('station', s);
        showToast("Station gespeichert", 'success');
        
        // Update State references
        state.activeStationId = newId;
        window.activeStationId = newId;

        // Refresh UI
        renderList(state.stations);
        renderFilterBar();
        if (window.refreshMapMarkers) window.refreshMapMarkers(); 
        
        // Go back to view mode (with new ID)
        openModal(s); 
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
        // Revert ID if save failed? Complex.
    }
}

export async function deleteStation(id) {
    if (!confirm("Station wirklich löschen?")) return;
    const sId = id || state.activeStationId;
    
    try {
        await deleteData('station', sId);
        showToast("Station gelöscht", 'success');
        
        // Refresh UI
        state.stations = state.stations.filter(s => s.id != sId);
        renderList(state.stations);
        renderFilterBar();
        if (window.refreshMapMarkers) window.refreshMapMarkers();
        
        closeModal();
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Löschen", 'error');
    }
}

export function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        // Resize Image before saving (simple canvas resize)
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Max bounds
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            
            // Update active station immediately
            const s = state.stations.find(x => x.id == state.activeStationId);
            if (s) {
                s.image = dataUrl;
                // Update Preview (Main)
                const imgContainer = document.getElementById('modal-image-container');
                imgContainer.innerHTML = `<img src="${s.image}" class="w-full h-48 object-cover rounded-t-2xl">`;
                imgContainer.classList.remove('hidden');
                
                // Update Preview (Edit Button)
                updateImageUploadUI(s.image);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

export function clearStationImage() {
    const s = state.stations.find(x => x.id == state.activeStationId);
    if (s) {
        s.image = null;
        document.getElementById('modal-image-container').classList.add('hidden');
        updateImageUploadUI(null);
    }
}

export function fillStationCoords() {
    // Helper to update hidden inputs when dragging marker
    // This assumes the map marker drag event calls this or updates the inputs directly.
    // If not, we might need to hook this up.
    // For now, let's leave it as a placeholder or implementing if we know the marker context.
    // Actually, in admin mode, map.js should update these inputs.
    console.log("fillStationCoords called - inputs should be updated by map drag event");
}

// --- Event Management ---

export function createEventForStation(id) {
    const sId = id || state.activeStationId;
    const s = state.stations.find(x => x.id == sId);
    
    // Clear/Reset Modal
    resetEventModal();
    
    if (s) {
        document.getElementById('evt-linked-station').value = s.id;
        applyStationToEvent(s.id);
    }
    
    // Set active ID to null (new event)
    state.activeEventId = null; 
    
    openModal('event-modal');
}

export function editEvent(id) {
    const e = state.events.find(x => x.id == id);
    if (!e) return;
    
    state.activeEventId = e.id;
    
    document.getElementById('evt-time').value = e.time;
    document.getElementById('evt-title').value = e.title;
    document.getElementById('evt-desc').value = e.desc || '';
    document.getElementById('evt-loc').value = e.loc;
    document.getElementById('evt-lat').value = e.lat;
    document.getElementById('evt-lng').value = e.lng;
    document.getElementById('evt-color').value = e.color || 'yellow';
    
    // Station Link logic if we had it stored in event
    // For now we don't strictly store linkedStationId in event, 
    // but we could match by coords or name.
    
    document.getElementById('btn-delete-event').classList.remove('hidden');
    openModal('event-modal');
}

function resetEventModal() {
    state.activeEventId = null;
    document.getElementById('evt-time').value = '';
    document.getElementById('evt-title').value = '';
    document.getElementById('evt-desc').value = '';
    document.getElementById('evt-loc').value = '';
    document.getElementById('evt-lat').value = '';
    document.getElementById('evt-lng').value = '';
    document.getElementById('evt-color').value = 'yellow';
    document.getElementById('evt-linked-station').value = '';
    document.getElementById('btn-delete-event').classList.add('hidden');
    
    // Populate Station Select
    const sel = document.getElementById('evt-linked-station');
    sel.innerHTML = '<option value="">Keine Station</option>' + 
        state.stations.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

export function applyStationToEvent(val) {
    if (!val) return;
    const s = state.stations.find(x => x.id == val);
    if (s) {
        document.getElementById('evt-title').value = s.name; // Suggest Name
        document.getElementById('evt-loc').value = s.name;
        document.getElementById('evt-lat').value = s.lat;
        document.getElementById('evt-lng').value = s.lng;
    }
}

export function fillEventCoords() {
    const center = state.map.getCenter();
    document.getElementById('evt-lat').value = center.lat.toFixed(5);
    document.getElementById('evt-lng').value = center.lng.toFixed(5);
    showToast("Kartenmitte übernommen", 'info');
}

export async function saveEventChanges() {
    const time = document.getElementById('evt-time').value;
    const title = document.getElementById('evt-title').value;
    const desc = document.getElementById('evt-desc').value;
    const loc = document.getElementById('evt-loc').value;
    const lat = parseFloat(document.getElementById('evt-lat').value);
    const lng = parseFloat(document.getElementById('evt-lng').value);
    const color = document.getElementById('evt-color').value;
    
    if (!time || !title) {
        showToast("Zeit und Titel sind Pflicht!", 'error');
        return;
    }
    
    const evt = {
        id: state.activeEventId || ('evt_' + Date.now()),
        time,
        title,
        desc,
        loc,
        lat: lat || 0,
        lng: lng || 0,
        color
    };
    
    try {
        await saveData('event', evt);
        showToast("Programmpunkt gespeichert", 'success');
        
        // Update State
        if (state.activeEventId) {
            const idx = state.events.findIndex(x => x.id == evt.id);
            if (idx >= 0) state.events[idx] = evt;
        } else {
            state.events.push(evt);
        }
        
        renderTimeline();
        closeModal('event-modal');
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
    }
}

export async function deleteEvent(id) {
    const eId = id || state.activeEventId;
    if (!eId) return;
    
    if (!confirm("Programmpunkt wirklich löschen?")) return;
    
    try {
        await deleteData('event', eId);
        showToast("Gelöscht", 'success');
        
        state.events = state.events.filter(x => x.id != eId);
        renderTimeline();
        closeModal('event-modal');
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Löschen", 'error');
    }
}

export function searchAddress() {
    const query = document.getElementById('evt-address-search').value;
    if (!query) return;
    
    // Simple Nominatim Search
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Bechhofen')}`;
    
    showToast("Suche Adresse...", 'info');
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                const res = data[0];
                document.getElementById('evt-lat').value = res.lat;
                document.getElementById('evt-lng').value = res.lon;
                document.getElementById('evt-loc').value = res.display_name.split(',')[0];
                showToast("Gefunden: " + res.display_name, 'success');
            } else {
                showToast("Nichts gefunden. Versuche es genauer.", 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast("Fehler bei der Suche", 'error');
        });
}

export function searchStationAddress() {
   // Similar logic if needed for stations, or remove if unused.
   console.log("searchStationAddress placeholder");
}

export function startEventPicker() {
    closeEventModal();
    switchTab('map');
    
    // Create/Show Picker UI
    let picker = document.getElementById('map-picker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'map-picker';
        picker.className = 'absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[500] pointer-events-none';
        picker.innerHTML = `<i class="ph-fill ph-map-pin text-4xl text-red-600 drop-shadow-md pb-4"></i>`;
        document.getElementById('map').appendChild(picker);
    }
    picker.classList.remove('hidden');

    // Show Confirm Button
    let btn = document.getElementById('map-picker-confirm');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'map-picker-confirm';
        btn.className = 'absolute bottom-24 left-1/2 transform -translate-x-1/2 z-[500] bg-red-600 text-white px-6 py-3 rounded-full font-bold shadow-lg';
        btn.innerText = 'Position für Event wählen';
        btn.onclick = () => {
            const center = state.map.getCenter();
            
            // Re-open Modal
            openEventModal();
            
            // Fill Coords
            document.getElementById('evt-lat').value = center.lat.toFixed(6);
            document.getElementById('evt-lng').value = center.lng.toFixed(6);
            
            // Cleanup
            picker.classList.add('hidden');
            btn.classList.add('hidden');
        };
        document.body.appendChild(btn);
    }
    btn.classList.remove('hidden');
    btn.innerText = 'Position für Event wählen'; // Ensure text is correct for event context
}

export function startStationPicker() {
    console.log("startStationPicker called");
}

export function flyToStation(lat, lng) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng) || (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)) {
        showToast("Keine gültigen Koordinaten", 'error');
        return;
    }
    
    switchTab('map');
    // Allow tab switch animation to start
    setTimeout(() => {
        if (state.map) {
            state.map.setView([lat, lng], 18, { animate: true });
            
            // Highlight a marker?
            // Find marker with this pos
            // ...
        }
    }, 100);
}

export function openBugReportModal() {
    openModal('bug-report-modal');
}

export async function submitBugReport() {
    const desc = document.getElementById('bug-desc').value;
    if (!desc) { 
        showToast("Bitte Beschreibung eingeben", 'error'); 
        return; 
    }

    const report = {
        description: desc,
        timestamp: Date.now(),
        dateStr: new Date().toLocaleString(),
        userAgent: navigator.userAgent,
        user: (state.auth && state.auth.currentUser) ? state.auth.currentUser.email : 'anonymous',
        appId: state.appId || 'unknown'
    };

    try {
        if (!state.useLocalStorage && state.fb) {
             const { collection, addDoc } = state.fb;
             // Save to 'reports' collection
             const colRef = collection(state.db, 'artifacts', state.appId, 'public', 'data', 'reports');
             await addDoc(colRef, report);
             console.log("Bug report saved", report);
        } else {
            console.warn("Offline/Local mode: Bug report not sent", report);
        }
        
        document.getElementById('bug-desc').value = '';
        closeModal('bug-report-modal');
        showToast('Bug gemeldet! Vielen Dank.', 'success');
    } catch(e) {
        console.error("Error submitting bug report:", e);
        showToast('Fehler beim Senden', 'error');
    }
}

export function openEventModal() {
    openModal('event-modal');
}

export function closeEventModal() {
    closeModal('event-modal');
}

export function generateICS() {
    // Generate ICS for all events
    if (!state.events || state.events.length === 0) {
        showToast("Keine Events für Kalender", "error");
        return;
    }

    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Lichternacht//DE\n";
    
    // Determine Base Date
    let year, month, day;
    const configDate = state.downloads?.icsDate;
    
    if (configDate) {
        // Try DD.MM.YYYY
        const deMatch = configDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (deMatch) {
            year = parseInt(deMatch[3]);
            month = parseInt(deMatch[2]) - 1;
            day = parseInt(deMatch[1]);
        } else {
            // Try YYYYMMDD
            const isoMatch = configDate.match(/^(\d{4})(\d{2})(\d{2})$/);
            if (isoMatch) {
                year = parseInt(isoMatch[1]);
                month = parseInt(isoMatch[2]) - 1;
                day = parseInt(isoMatch[3]);
            }
        }
    }

    if (year === undefined) {
         const now = new Date();
         year = now.getFullYear();
         month = now.getMonth();
         day = now.getDate();
    }
    
    state.events.forEach(e => {
        const [h, m] = e.time.split(':');
        // use parsed date
        const start = new Date(year, month, day, h, m);
        const end = new Date(start.getTime() + 30 * 60000); // 30 min default duration
        
        const format = (date) => date.toISOString().replace(/-|:|\.\d+/g, "");
        
        icsContent += "BEGIN:VEVENT\n";
        icsContent += `SUMMARY:${e.title}\n`;
        icsContent += `DESCRIPTION:${e.desc || ''}\n`;
        icsContent += `LOCATION:${e.loc}\n`;
        icsContent += `DTSTART:${format(start)}\n`;
        icsContent += `DTEND:${format(end)}\n`;
        icsContent += "END:VEVENT\n";
    });
    
    icsContent += "END:VCALENDAR";
    
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lichternacht.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast("Kalender heruntergeladen", "success");
}

export function renderTimeline() {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    if (!state.events || state.events.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic">Noch keine Programmpunkte vorhanden.</p>';
        return;
    }

    // Sort by time
    const sorted = [...state.events].sort((a, b) => {
        return a.time.localeCompare(b.time);
    });

    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeVal = currentHours * 60 + currentMinutes;

    let nextEvent = null;

    container.innerHTML = sorted.map((e, index) => {
        const [h, m] = e.time.split(':').map(Number);
        const eventTimeVal = h * 60 + m;
        const isPast = eventTimeVal < currentTimeVal - 30; // 30 min buffer
        const isCurrent = eventTimeVal >= currentTimeVal - 15 && eventTimeVal <= currentTimeVal + 45; // Roughly current
        
        if (!nextEvent && eventTimeVal > currentTimeVal) {
            nextEvent = e;
        }

        const colorClass = e.color === 'yellow' ? 'bg-yellow-500' : 
                          e.color === 'red' ? 'bg-red-500' : 
                          e.color === 'purple' ? 'bg-purple-500' : 'bg-gray-500';

        // Calculate Distance if available
        let distInfo = '';
        let showMapBtn = '';
        
        if (e.lat && e.lng) {
             const lat = parseFloat(e.lat);
             const lng = parseFloat(e.lng);
             
             // Check if valid coords (not 0,0 default)
             if (!isNaN(lat) && !isNaN(lng) && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001)) {
                 // Distance
                 if (state.userLocation) {
                     const d = getDistance(state.userLocation.lat, state.userLocation.lng, lat, lng);
                     const walkingDist = d * 1.3;
                     const minutes = Math.ceil(walkingDist / 80);
                     const distStr = walkingDist > 1000 ? (walkingDist/1000).toFixed(1) + ' km' : Math.round(walkingDist) + ' m';
                     
                     distInfo = `
                        <span class="flex items-center gap-1 ml-3 pl-3 border-l border-gray-300 dark:border-gray-600">
                            <i class="ph-fill ph-navigation-arrow text-blue-500"></i> ${distStr}
                            <span class="text-[10px] text-gray-400">(${minutes} min)</span>
                        </span>
                     `;
                 }
                 
                 // Map Button
                 showMapBtn = `<button onclick="flyToStation(${lat}, ${lng})" class="ml-2 text-yellow-600 hover:underline font-medium text-xs border border-yellow-200 bg-yellow-50 px-2 py-0.5 rounded hover:bg-yellow-100 dark:bg-gray-700 dark:border-gray-600 dark:text-yellow-500">Zeigen</button>`;
             }
        }

        return `
        <div class="mb-8 relative ${isPast ? 'opacity-50 grayscale' : ''}">
            <div class="absolute -left-[31px] bg-white border-2 border-gray-300 rounded-full w-4 h-4 mt-1.5 ${isCurrent ? 'border-yellow-500 scale-125' : ''}">
                <div class="w-2 h-2 rounded-full ${colorClass} absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
            </div>
            <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 ${e.color === 'yellow' ? 'border-yellow-400' : 'border-gray-300'} dark:bg-gray-800 dark:border-gray-700">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-lg ${isCurrent ? 'text-yellow-600' : ''}">${e.time} Uhr</span>
                    ${state.isAdmin ? `
                        <div class="flex gap-2">
                            <button onclick="editEvent('${e.id}')" class="text-gray-300 hover:text-blue-500"><i class="ph ph-pencil-simple"></i></button>
                            <button onclick="deleteEvent('${e.id}')" class="text-gray-300 hover:text-red-500"><i class="ph ph-trash"></i></button>
                        </div>` : ''}
                </div>
                <h4 class="font-bold text-gray-900 dark:text-white">${e.title}</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">${e.desc}</p>
                <div class="flex items-center text-xs text-gray-500 dark:text-gray-500 gap-1 flex-wrap">
                    <i class="ph-fill ph-map-pin"></i>
                    <span>${e.loc}</span>
                    ${distInfo}
                    ${showMapBtn}
                </div>
            </div>
        </div>
        `;
    }).join('');

    // Update Header Widget
    const headerDisplay = document.getElementById('current-event-display');
    if (headerDisplay) {
        if (nextEvent) {
            headerDisplay.innerHTML = `
                <div class="flex gap-3 items-center">
                    <div class="bg-white/20 p-2 rounded-lg text-center min-w-[50px]">
                        <span class="block font-bold text-sm leading-tight">${nextEvent.time}</span>
                    </div>
                    <div>
                        <p class="text-xs text-white/80 uppercase font-bold tracking-wider">Demnächst</p>
                        <p class="font-bold text-white leading-tight">${nextEvent.title}</p>
                        <p class="text-xs text-white/80 truncate">${nextEvent.loc}</p>
                    </div>
                </div>
            `;
        } else {
            headerDisplay.innerHTML = `<p class="text-white/80 text-sm">Heute keine weiteren Programmpunkte.</p>`;
        }
    }
}
