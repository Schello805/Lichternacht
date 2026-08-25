
import { state } from './state.js';
import { showToast, getDistance, getVisitedStationIdSet } from './utils.js';
import * as utils from './utils.js';
import { saveData, deleteData } from './data.js';
import { refreshMapMarkers } from './map.js';
import { updateCheckInBtn, updateLikeBtn } from './gamification.js';
import { buildFeedbackEmailHtml } from './email.js?v=1.4.134';

const STATION_OFFER_MAX_LENGTH = 250;
const STATION_TAG_MAX_COUNT = 5;
const EVENT_DESC_MAX_LENGTH = 250;

function normalizeExternalLink(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(withProtocol);
        return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null;
    } catch (e) {
        return null;
    }
}

function normalizeStationImage(value) {
    const raw = String(value || '').trim();
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(raw)) return raw;
    return normalizeExternalLink(raw) || '';
}

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
        const stationImage = normalizeStationImage(s.image);
        if (stationImage) {
            imgContainer.innerHTML = `<img src="${escapeHtml(stationImage)}" alt="Bild von ${escapeHtml(s.name)}" class="w-full h-48 object-cover rounded-t-2xl">`;
            imgContainer.classList.remove('hidden');
        } else {
            imgContainer.classList.add('hidden');
        }

        // Route & Maps Buttons
        const btnRoute = document.getElementById('btn-internal-route');
        const btnMaps = document.getElementById('btn-route');
        const btnLink = document.getElementById('modal-link-btn');
        
        if (btnRoute) {
            btnRoute.onclick = () => {
                closeModal();
                switchTab('map');
                // Wait for tab switch animation/layout so Leaflet can render routing correctly
                setTimeout(() => {
                    try {
                        if (state.map) state.map.invalidateSize();
                    } catch (e) { }
                    if (window.calculateRoute) window.calculateRoute(s.lat, s.lng);
                }, 250);
            };
        }
        
        if (btnMaps) {
            btnMaps.onclick = () => {
                const url = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
                window.open(url, '_blank');
            };
        }

        if (btnLink) {
            const externalLink = normalizeExternalLink(s.link);
            btnLink.classList.toggle('hidden', !externalLink);
            btnLink.classList.toggle('flex', !!externalLink);
            btnLink.onclick = externalLink ? () => window.open(externalLink, '_blank', 'noopener') : null;
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

            // Ensure check-in button reflects visited state immediately
            try { updateCheckInBtn(s.id); } catch (e) { }

            // Ensure like button reflects liked state + count immediately
            try { updateLikeBtn(s.id, s.likes || 0); } catch (e) { }
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

        // If the active station is a draft, ask before discarding it
        try {
            const sId = state.activeStationId;
            const s = state.stations.find(x => x.id == sId);
            if (s && s.__draft) {
                const ok = confirm('Neue Station verwerfen? (Nicht gespeichert)');
                if (!ok) return;

                state.stations = state.stations.filter(x => x.id != sId);
                state.activeStationId = null;
                window.activeStationId = null;
                if (window.renderList) window.renderList(state.stations);
                if (window.renderFilterBar) window.renderFilterBar();
                if (window.refreshMapMarkers) window.refreshMapMarkers();
            }
        } catch (e) { }
        
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

    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel && !adminPanel.classList.contains('hidden') && window.closeAdminPage) {
        window.closeAdminPage();
    }
    
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
            btn.removeAttribute('aria-current');
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
        activeBtn.setAttribute('aria-current', 'page');
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
    window.location.href = './help.html';
}

export function closeHelpModal() {
    // Kept for backwards compatibility (used by old cached HTML). On help page the back button is used.
    try { history.back(); } catch (e) { }
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

    const primaryBtn = (tag, label, iconHtml = '') => `
        <button onclick="filterList('${tag}')" data-tag="${tag}" 
            class="filter-btn min-w-0 px-2 py-2 rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-1 ${currentFilter === tag ? 'bg-yellow-500 text-white ring-2 ring-yellow-300' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}">
            ${iconHtml}<span class="truncate">${label}</span>
        </button>
    `;

    // Row 1: Main Filters as a compact grid (no sideways scrolling on mobile)
    let row1 = `
        <div class="grid grid-cols-4 gap-1.5">
            ${primaryBtn('all', 'Alle')}
            ${primaryBtn('proximity', 'Nähe', `<i class="ph-fill ph-compass ${currentFilter === 'proximity' ? 'text-white' : 'text-blue-500'} text-sm"></i>`)}
            ${primaryBtn('favorites', 'Favoriten', `<i class="ph-fill ph-star ${currentFilter === 'favorites' ? 'text-white' : 'text-yellow-500'} text-sm"></i>`)}
            ${primaryBtn('visited', 'Besucht', `<i class="ph-fill ph-check-circle ${currentFilter === 'visited' ? 'text-white' : 'text-green-500'} text-sm"></i>`)}
        </div>
    `;

    // Row 2: Dropdown (Select Menu)
    const isTagActive = sortedTags.includes(currentFilter);
    
    // Style matches the buttons above exactly
    const wrapperBase = "relative flex items-center w-full rounded-xl shadow-sm px-3 py-2 transition-all";
    const wrapperState = isTagActive
        ? "bg-yellow-500 ring-2 ring-yellow-300"
        : "bg-white border border-gray-200 hover:bg-gray-50";
        
    const iconColor = isTagActive ? "text-white" : "text-gray-400";
    const textColor = isTagActive ? "text-white" : "text-gray-700";

    let row2 = `
        <div class="mt-1.5">
            <div class="${wrapperBase} ${wrapperState}">
                <!-- Filter Icon (Next to Dropdown) -->
                <i class="ph ph-funnel text-lg mr-2 ${iconColor} flex-shrink-0"></i>

                <!-- Select Input (Transparent, Button-like text) -->
                <select onchange="filterList(this.value)" 
                    class="appearance-none bg-transparent border-none w-full text-sm font-bold focus:outline-none cursor-pointer ${textColor}">
                    <option value="" disabled ${!isTagActive ? 'selected' : ''} class="text-gray-900 bg-white">Kategorie filtern...</option>
    `;

    sortedTags.forEach(tag => {
        const label = TAG_TRANSLATIONS[tag] || tag;
        const selected = currentFilter === tag ? 'selected' : '';
        row2 += `<option value="${tag}" ${selected} class="text-gray-900 bg-white">${label}</option>`;
    });

    row2 += `
                </select>
            </div>
        </div>
    `;

    container.innerHTML = row1 + row2;
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

    const isDark = document.documentElement.classList.contains('dark');
    const cardBg = isDark ? '#111827' : 'white';
    const titleColor = isDark ? '#f9fafb' : '#111827';
    const bodyColor = isDark ? '#d1d5db' : '#4b5563';
    const closeBg = isDark ? '#1f2937' : '#f3f4f6';
    const closeHoverBg = isDark ? '#374151' : '#e5e7eb';
    const closeColor = isDark ? '#e5e7eb' : '#6b7280';

    overlay.innerHTML = `
        <div style="
            background: ${cardBg}; 
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
                background: ${closeBg}; 
                border: none; 
                width: 32px; 
                height: 32px; 
                border-radius: 50%; 
                font-size: 20px; 
                line-height: 1;
                cursor: pointer; 
                color: ${closeColor};
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            " onmouseover="this.style.background='${closeHoverBg}'" onmouseout="this.style.background='${closeBg}'">&times;</button>
            
            <div style="font-size: 64px; margin-bottom: 16px; line-height: 1;">🚧</div>
            
            <h2 style="
                font-size: 24px; 
                font-weight: 800; 
                margin: 0 0 12px 0; 
                color: ${titleColor}; 
                font-family: inherit;
            ">In Planung!</h2>
            
            <p id="planning-text" style="
                font-size: 16px; 
                color: ${bodyColor}; 
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

    const visitedStations = getVisitedStationIdSet();

    container.innerHTML = listToRender.map(s => {
        const translatedTags = (s.tags || []).map(t => TAG_TRANSLATIONS[t] || t);
        const isVisited = visitedStations.has(String(s.id));
        const likeCount = s.likes || 0;
        const stationImage = normalizeStationImage(s.image);
        
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
        <button type="button" class="w-full text-left bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow mb-3 relative overflow-hidden" onclick="openStation('${s.id}')" aria-label="Station ${escapeHtml(s.name)} öffnen">
            ${isVisited ? `<div class="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm z-10 flex items-center gap-1"><i class="ph-fill ph-check-circle"></i> BESUCHT</div>` : ''}
            <div class="flex items-start gap-3">
                ${stationImage ? `<img src="${escapeHtml(stationImage)}" alt="" loading="lazy" class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover bg-white border border-gray-200 dark:border-gray-700 flex-shrink-0">` : ''}
                <div class="min-w-0 flex-1">
                    <div class="flex justify-between items-start">
                        <h3 class="font-bold text-base sm:text-lg leading-snug pr-2 ${isVisited ? 'text-green-700 dark:text-green-400' : ''}">${escapeHtml(s.name)}</h3>
                        <div class="flex flex-col items-end gap-1">
                            <span class="text-xs font-bold ${isVisited ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-700'} px-1.5 py-0.5 rounded ${isVisited ? 'mr-24' : ''}">#${escapeHtml(s.id)}</span>
                            <span class="text-xs ${likeCount > 0 ? 'text-gray-500' : 'text-gray-400'} flex items-center gap-1 ${isVisited ? 'mr-24' : ''}"><i class="ph-fill ph-thumbs-up text-orange-500"></i> ${likeCount}</span>
                        </div>
                    </div>
                    <p class="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">${escapeHtml(s.desc || '')}</p>
                    <div class="mt-2 flex gap-1.5 flex-wrap">
                        ${translatedTags.map(t => `<span class="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">${escapeHtml(t)}</span>`).join('')}
                    </div>
                    ${distInfo}
                </div>
            </div>
        </button>
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
    renderFilterBar();
    
    if (tag === 'all') {
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
        const visitedStations = getVisitedStationIdSet();
        const visited = state.stations.filter(s => visitedStations.has(String(s.id)));
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
    const selectedCount = currentTags.size;

    // Ensure currently selected tags are visible even if not in global list yet
    currentTags.forEach(t => allTags.add(t));

    container.innerHTML = [...allTags].sort().map(tag => {
        const label = TAG_TRANSLATIONS[tag] || tag;
        const isActive = currentTags.has(tag);
        const isDisabled = !isActive && selectedCount >= STATION_TAG_MAX_COUNT;
        const bg = isActive ? 'bg-yellow-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300';
        const disabledClass = isDisabled ? 'opacity-45 cursor-not-allowed hover:bg-gray-200' : 'cursor-pointer';
        return `<span onclick="toggleEditTag('${tag}')" class="${disabledClass} px-2 py-1 rounded text-xs select-none transition-colors ${bg}">${label}</span>`;
    }).join('') + 
    `<span onclick="addNewTag()" class="${selectedCount >= STATION_TAG_MAX_COUNT ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'} px-2 py-1 rounded text-xs select-none transition-colors bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-300 font-bold flex items-center gap-1"><i class="ph ph-plus"></i> Neu</span>`;
}

window.addNewTag = () => {
    const input = document.getElementById('edit-tags');
    let tags = input.value.split(',').map(t => t.trim()).filter(t => t);
    if (tags.length >= STATION_TAG_MAX_COUNT) {
        showToast(`Maximal ${STATION_TAG_MAX_COUNT} Tags pro Station`, 'info');
        return;
    }

    const newTag = prompt("Neuer Tag Name (z.B. 'pizza'):");
    if (!newTag) return;
    
    const cleanTag = newTag.toLowerCase().trim();
    if (!cleanTag) return;
    
    // Add to input if not exists
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
        if (tags.length >= STATION_TAG_MAX_COUNT) {
            showToast(`Maximal ${STATION_TAG_MAX_COUNT} Tags pro Station`, 'info');
            return;
        }
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
    document.getElementById('edit-link').value = s.link || '';
    document.getElementById('edit-lat').value = s.lat;
    document.getElementById('edit-lng').value = s.lng;
    document.getElementById('edit-tags').value = (s.tags || []).join(', ');
    document.getElementById('edit-time').value = s.time || '';

    // Init Tag Picker
    renderTagPicker();
    document.getElementById('edit-tags').oninput = () => renderTagPicker();
    updateStationAddressCounter();
    document.getElementById('edit-desc').oninput = updateStationAddressCounter;
    updateOfferCounter();
    document.getElementById('edit-offer').oninput = updateOfferCounter;

    // Image UI
    updateImageUploadUI(s.image);

    // Toggle Views
    document.getElementById('modal-view-mode').classList.add('hidden');
    document.getElementById('modal-edit-mode').classList.remove('hidden');
}

function updateOfferCounter() {
    const input = document.getElementById('edit-offer');
    const counter = document.getElementById('edit-offer-count');
    if (!input || !counter) return;
    const length = input.value.length;
    counter.textContent = `${length}/${STATION_OFFER_MAX_LENGTH}`;
    counter.classList.toggle('text-red-600', length > STATION_OFFER_MAX_LENGTH);
    counter.classList.toggle('font-bold', length > STATION_OFFER_MAX_LENGTH);
}

function updateStationAddressCounter() {
    const input = document.getElementById('edit-desc');
    const counter = document.getElementById('edit-desc-count');
    if (!input || !counter) return;
    counter.textContent = `${input.value.length} Zeichen`;
}

function updateEventDescCounter() {
    const input = document.getElementById('evt-desc');
    const counter = document.getElementById('evt-desc-count');
    if (!input || !counter) return;
    const length = input.value.length;
    counter.textContent = `${length}/${EVENT_DESC_MAX_LENGTH}`;
    counter.classList.toggle('text-red-600', length > EVENT_DESC_MAX_LENGTH);
    counter.classList.toggle('font-bold', length > EVENT_DESC_MAX_LENGTH);
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
    const idInput = document.getElementById('edit-id').value.trim();
    if (!/^\d+$/.test(idInput)) {
        showToast("Stationsnummer darf nur aus Zahlen bestehen", 'error');
        return;
    }
    
    const newId = parseInt(idInput, 10);
    if (!Number.isInteger(newId) || newId < 1) {
        showToast("Stationsnummer muss eine positive ganze Zahl sein", 'error');
        return;
    }

    // Validation: Check if ID exists (and is not self)
    const exists = state.stations.some(x => x.id == newId && x.id != oldId);
    if (exists) {
        showToast(`Fehler: Die Nummer ${newId} ist bereits vergeben!`, 'error');
        return;
    }

    const newName = document.getElementById('edit-name').value.trim();
    const newDesc = document.getElementById('edit-desc').value.trim();
    const newOffer = document.getElementById('edit-offer').value.trim();
    const newLink = normalizeExternalLink(document.getElementById('edit-link').value);
    // Lat/Lng might have been updated by dragging (we need to ensure drag updates the hidden fields)
    const newLat = parseFloat(document.getElementById('edit-lat').value);
    const newLng = parseFloat(document.getElementById('edit-lng').value);
    
    // Parse Tags
    const tagsInput = document.getElementById('edit-tags').value;
    const newTags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

    if (newName.length < 3) {
        showToast("Name muss mindestens 3 Zeichen haben", 'error');
        return;
    }

    if (newOffer.length > STATION_OFFER_MAX_LENGTH) {
        showToast(`Angebot/Werbetext ist zu lang: maximal ${STATION_OFFER_MAX_LENGTH} Zeichen`, 'error');
        return;
    }

    if (newLink === null) {
        showToast("Link ist ungültig. Bitte als Webadresse eingeben.", 'error');
        return;
    }

    if (newTags.length > STATION_TAG_MAX_COUNT) {
        showToast(`Zu viele Tags: maximal ${STATION_TAG_MAX_COUNT} pro Station`, 'error');
        return;
    }

    if (!Number.isFinite(newLat) || !Number.isFinite(newLng)) {
        showToast("Fehler: Ungültige Koordinaten (lat/lng)", 'error');
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
    s.link = newLink || '';
    s.lat = newLat;
    s.lng = newLng;
    s.tags = newTags;
    s.time = document.getElementById('edit-time').value;

    const stationHints = [];
    if (!String(newDesc || '').trim()) stationHints.push('Adresse/Ort fehlt');
    if (!String(newOffer || '').trim()) stationHints.push('Angebot/Werbetext fehlt');
    if (newTags.length === 0) stationHints.push('keine Tags/Filter gesetzt');

    try {
        // If ID changed, we must DELETE the old doc first (or after) to avoid duplicates
        if (idChanged) {
            await deleteData('station', oldId);
            console.log(`Old station ${oldId} deleted`);
        }

        await saveData('station', s);
        if (s.__draft) delete s.__draft;
        showToast("Station gespeichert", 'success');
        if (stationHints.length > 0) {
            setTimeout(() => showToast(`Hinweis: ${stationHints.join(' · ')}`, 'info'), 350);
        }
        
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
    document.getElementById('evt-link').value = e.link || '';
    document.getElementById('evt-loc').value = e.loc;
    document.getElementById('evt-lat').value = e.lat;
    document.getElementById('evt-lng').value = e.lng;
    document.getElementById('evt-color').value = e.color || 'yellow';
    updateEventDescCounter();
    document.getElementById('evt-desc').oninput = updateEventDescCounter;
    
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
    document.getElementById('evt-link').value = '';
    document.getElementById('evt-loc').value = '';
    document.getElementById('evt-lat').value = '';
    document.getElementById('evt-lng').value = '';
    document.getElementById('evt-color').value = 'yellow';
    document.getElementById('evt-linked-station').value = '';
    document.getElementById('btn-delete-event').classList.add('hidden');
    updateEventDescCounter();
    document.getElementById('evt-desc').oninput = updateEventDescCounter;
    
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
    const time = document.getElementById('evt-time').value.trim();
    const title = document.getElementById('evt-title').value.trim();
    const desc = document.getElementById('evt-desc').value.trim();
    const link = normalizeExternalLink(document.getElementById('evt-link').value);
    const loc = document.getElementById('evt-loc').value.trim();
    const lat = parseFloat(document.getElementById('evt-lat').value);
    const lng = parseFloat(document.getElementById('evt-lng').value);
    const color = document.getElementById('evt-color').value;
    
    if (!time || !title) {
        showToast("Zeit und Titel sind Pflicht!", 'error');
        return;
    }

    if (title.length < 3) {
        showToast("Titel muss mindestens 3 Zeichen haben", 'error');
        return;
    }

    if (desc.length > EVENT_DESC_MAX_LENGTH) {
        showToast(`Beschreibung ist zu lang: maximal ${EVENT_DESC_MAX_LENGTH} Zeichen`, 'error');
        return;
    }

    if (link === null) {
        showToast("Link ist ungültig. Bitte als Webadresse eingeben.", 'error');
        return;
    }

    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(time).trim())) {
        showToast("Zeitformat bitte als HH:MM eingeben (z.B. 18:00).", 'error');
        return;
    }

    if ((Number.isFinite(lat) && (lat < -90 || lat > 90)) || (Number.isFinite(lng) && (lng < -180 || lng > 180))) {
        showToast("Koordinaten sind außerhalb des gültigen Bereichs", 'error');
        return;
    }

    const eventHints = [];
    if (!String(loc || '').trim()) eventHints.push('Ort fehlt');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)) {
        eventHints.push('keine Kartenposition gesetzt');
    }
    
    const evt = {
        id: state.activeEventId || ('evt_' + Date.now()),
        time,
        title,
        desc,
        link: link || '',
        loc,
        lat: lat || 0,
        lng: lng || 0,
        color
    };
    
    try {
        await saveData('event', evt);
        showToast("Programmpunkt gespeichert", 'success');
        if (eventHints.length > 0) {
            setTimeout(() => showToast(`Hinweis: ${eventHints.join(' · ')}`, 'info'), 350);
        }
        
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

export function flyToStation(lat, lng, id = null, zoom = 19) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng) || (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)) {
        showToast("Keine gültigen Koordinaten", 'error');
        return;
    }

    function findTargetMarker() {
        if (!Array.isArray(state.markers)) return null;
        if (id != null && id !== '') {
            const exact = state.markers.find(m => String(m.id) === String(id));
            if (exact) return exact;
        }

        return state.markers
            .map(item => {
                const pos = item.marker?.getLatLng ? item.marker.getLatLng() : null;
                if (!pos) return null;
                return { item, distance: getDistance(Number(lat), Number(lng), pos.lat, pos.lng) };
            })
            .filter(Boolean)
            .sort((a, b) => a.distance - b.distance)
            .find(row => row.distance <= 40)?.item || null;
    }

    function clearMapHighlights() {
        document.querySelectorAll('.highlight-pin').forEach(el => el.classList.remove('highlight-pin'));
        document.querySelectorAll('.map-target-highlight').forEach(el => el.classList.remove('map-target-highlight'));
        state.markers.forEach(item => {
            if (item.marker?.setZIndexOffset) item.marker.setZIndexOffset(0);
        });
    }

    function applyMapHighlight(attempt = 0) {
        const entry = findTargetMarker();
        if (!entry?.marker) {
            if (attempt < 6) setTimeout(() => applyMapHighlight(attempt + 1), 250);
            return;
        }

        if (entry.marker.setZIndexOffset) entry.marker.setZIndexOffset(10000);
        const iconDiv = entry.marker.getElement();
        const pinDiv = iconDiv?.querySelector('.station-pin') || iconDiv?.querySelector('div');
        if (!iconDiv || !pinDiv) {
            if (attempt < 6) setTimeout(() => applyMapHighlight(attempt + 1), 250);
            return;
        }

        iconDiv.classList.add('map-target-highlight');
        pinDiv.classList.add('highlight-pin');
        setTimeout(() => {
            iconDiv.classList.remove('map-target-highlight');
            pinDiv.classList.remove('highlight-pin');
            if (entry.marker?.setZIndexOffset) entry.marker.setZIndexOffset(0);
        }, 8000);
    }
    
    switchTab('map');
    // Allow tab switch animation to start
    setTimeout(() => {
        if (state.map) {
            try { state.map.invalidateSize(); } catch (e) { }
            state.map.setView([lat, lng], zoom, { animate: true });
            
            clearMapHighlights();
            showToast("Station auf der Karte markiert", 'info');
            applyMapHighlight();
            setTimeout(() => applyMapHighlight(), 700);
        }
    }, 300); // Slightly longer delay to ensure map is rendered
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
        user: (state.auth && state.auth.currentUser) ? (state.auth.currentUser.email || 'anonymous') : 'anonymous',
        userId: (state.auth && state.auth.currentUser) ? (state.auth.currentUser.uid || '') : '',
        appId: state.appId || 'unknown',
        url: window.location.href
    };

    const reportText = [
        `App: ${report.appId}`,
        `Zeit: ${report.dateStr}`,
        `URL: ${report.url}`,
        `User: ${report.user} (${report.userId || 'n/a'})`,
        `Browser: ${report.userAgent}`,
        '',
        report.description
    ].join('\n');

    // Send to backend endpoint which sends an email (anonymous users supported).
    // A browser cannot send emails by itself; this needs a server-side mail relay.
    try {
        const res = await fetch('./api/bug-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: `Feedback Lichternacht App (${report.appId})`,
                text: reportText,
                html: buildFeedbackEmailHtml(report),
                meta: report
            })
        });

        if (!res.ok) {
            const msg = await res.text().catch(() => '');
            throw new Error(msg || `HTTP ${res.status}`);
        }

        document.getElementById('bug-desc').value = '';
        closeModal('bug-report-modal');
        showToast('Danke! Feedback gesendet.', 'success');
        return;
    } catch (e) {
        console.error("Bug report send failed", e);
        showToast('Senden nicht möglich (Server/Email nicht konfiguriert).', 'error');
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
        const windowConfig = (typeof utils.parseEventWindowConfig === 'function')
            ? utils.parseEventWindowConfig(configDate)
            : null;
        if (windowConfig?.dateKey) {
            const parts = windowConfig.dateKey.split('-').map(Number);
            year = parts[0];
            month = parts[1] - 1;
            day = parts[2];
        }
    }

    if (year === undefined) {
         const now = new Date();
         year = now.getFullYear();
         month = now.getMonth();
         day = now.getDate();
         showToast("Hinweis: Kein gültiges Event-Datum gesetzt – Kalender nutzt heute.", "info");
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

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeIcsValue(value) {
    return String(value ?? '')
        .replaceAll('\\', '\\\\')
        .replaceAll('\n', '\\n')
        .replaceAll(',', '\\,')
        .replaceAll(';', '\\;');
}

function getProgramBaseDateParts() {
    const configDate = state.downloads?.icsDate;
    if (configDate && typeof utils.parseEventWindowConfig === 'function') {
        const windowConfig = utils.parseEventWindowConfig(configDate);
        if (windowConfig?.dateKey) {
            const parts = windowConfig.dateKey.split('-').map(Number);
            return { year: parts[0], month: parts[1] - 1, day: parts[2], configured: true };
        }
    }

    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate(), configured: false };
}

function createEventDate(event, offsetMinutes = 0) {
    const { year, month, day } = getProgramBaseDateParts();
    const [hour, minute] = String(event.time || '00:00').split(':').map(Number);
    const date = new Date(year, month, day, Number(hour) || 0, Number(minute) || 0);
    if (offsetMinutes) date.setMinutes(date.getMinutes() + offsetMinutes);
    return date;
}

function downloadSingleEventIcs(event) {
    const start = createEventDate(event);
    const end = createEventDate(event, 30);
    const format = (date) => date.toISOString().replace(/-|:|\.\d+/g, "");
    const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Lichternacht//DE',
        'BEGIN:VEVENT',
        `UID:lichternacht-${escapeIcsValue(event.id || Date.now())}@lichternacht-bechhofen.de`,
        `SUMMARY:${escapeIcsValue(event.title)}`,
        `DESCRIPTION:${escapeIcsValue(event.desc || '')}`,
        `LOCATION:${escapeIcsValue(event.loc || '')}`,
        `DTSTART:${format(start)}`,
        `DTEND:${format(end)}`,
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = String(event.title || 'programmpunkt').toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '') || 'programmpunkt';
    a.href = url;
    a.download = `lichternacht-${safeName}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast('Programmpunkt als Kalenderdatei heruntergeladen', 'success');
}

function getEventLocationInfo(event) {
    const lat = parseFloat(event.lat);
    const lng = parseFloat(event.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001);
    if (!hasCoords) return { hasCoords: false, lat: null, lng: null, stationId: null, distanceText: '' };

    const coordMatch = Array.isArray(state.stations) && state.stations.find(station => {
        const stationLat = parseFloat(station.lat);
        const stationLng = parseFloat(station.lng);
        if (!Number.isFinite(stationLat) || !Number.isFinite(stationLng)) return false;
        return getDistance(stationLat, stationLng, lat, lng) <= 40;
    });
    const nameMatch = (!coordMatch && Array.isArray(state.stations)) ? state.stations.find(station =>
        typeof station.name === 'string' && typeof event.loc === 'string' &&
        station.name.trim().toLowerCase() === event.loc.trim().toLowerCase()
    ) : null;

    let distanceText = '';
    if (state.userLocation) {
        const distance = getDistance(state.userLocation.lat, state.userLocation.lng, lat, lng) * 1.3;
        const minutes = Math.ceil(distance / 80);
        const distanceLabel = distance > 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
        distanceText = `${distanceLabel} · ca. ${minutes} min`;
    }

    return {
        hasCoords,
        lat,
        lng,
        stationId: (coordMatch || nameMatch) ? (coordMatch || nameMatch).id : null,
        distanceText
    };
}

function formatCountdown(minutes) {
    const abs = Math.max(0, Math.floor(minutes));
    if (abs < 1) return 'jetzt';
    if (abs < 60) return `in ${abs} Min.`;
    const hours = Math.floor(abs / 60);
    const rest = abs % 60;
    return rest > 0 ? `in ${hours} Std. ${rest} Min.` : `in ${hours} Std.`;
}

function getProgramStatus(event, context) {
    const [hour, minute] = String(event.time || '00:00').split(':').map(Number);
    const eventTimeVal = (Number(hour) || 0) * 60 + (Number(minute) || 0);
    const diff = eventTimeVal - context.currentTimeVal;
    const configuredLabel = context.configuredWindow && typeof utils.formatEventDateDe === 'function'
        ? utils.formatEventDateDe(context.configuredWindow.dateKey)
        : '';

    if (!context.hasConfiguredEventDate) {
        return { key: 'no-date', label: 'Datum fehlt', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200', isPast: false, eventTimeVal };
    }
    if (context.configuredWindow && !context.isEventDay) {
        return { key: 'date', label: configuredLabel ? `am ${configuredLabel}` : 'geplant', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200', isPast: false, eventTimeVal };
    }
    if (diff > 0) {
        return { key: diff <= 30 ? 'soon' : 'upcoming', label: formatCountdown(diff), className: diff <= 30 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', isPast: false, eventTimeVal };
    }
    if (context.isEventWindowNow && context.currentTimeVal <= eventTimeVal + 45) {
        return { key: 'live', label: 'Live', className: 'bg-red-500 text-white animate-pulse', isPast: false, eventTimeVal };
    }
    return { key: 'past', label: 'Vorbei', className: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300', isPast: true, eventTimeVal };
}

export function openProgramEvent(id) {
    const event = state.events.find(item => String(item.id) === String(id));
    if (!event) {
        showToast('Programmpunkt nicht gefunden', 'error');
        return;
    }

    const existing = document.getElementById('program-event-modal');
    if (existing) existing.remove();

    const now = new Date();
    const configuredWindow = (typeof utils.getConfiguredEventWindow === 'function') ? utils.getConfiguredEventWindow() : null;
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const context = {
        configuredWindow,
        hasConfiguredEventDate: !!configuredWindow,
        isEventDay: !!configuredWindow && todayKey === configuredWindow.dateKey,
        isEventWindowNow: !!configuredWindow && (typeof utils.isWithinEventWindowNow === 'function' ? utils.isWithinEventWindowNow(configuredWindow, now) : todayKey === configuredWindow.dateKey),
        currentTimeVal: now.getHours() * 60 + now.getMinutes()
    };
    const status = getProgramStatus(event, context);
    const locationInfo = getEventLocationInfo(event);

    const overlay = document.createElement('div');
    overlay.id = 'program-event-modal';
    overlay.className = 'fixed inset-0 z-[6500] flex items-end sm:items-center justify-center p-0 sm:p-4';
    overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" data-close="1"></div>
        <div class="relative z-10 w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 dark:text-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div class="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4 sm:hidden"></div>
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-sm font-extrabold px-2.5 py-1 rounded-lg bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">${escapeHtml(event.time)} Uhr</span>
                        <span class="text-xs font-extrabold px-2.5 py-1 rounded-full ${status.className}">${escapeHtml(status.label)}</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <h2 class="text-xl font-extrabold brand-font leading-tight">${escapeHtml(event.title)}</h2>
                        ${normalizeExternalLink(event.link) ? `
                            <button type="button" id="program-link" class="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 border border-blue-100 dark:border-blue-800 flex items-center justify-center hover:bg-blue-100" title="Link öffnen" aria-label="Link öffnen">
                                <i class="ph ph-link text-base"></i>
                            </button>
                        ` : ''}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-300 mt-1 flex items-center gap-1">
                        <i class="ph-fill ph-map-pin"></i>
                        <span>${escapeHtml(event.loc || 'Ort nicht angegeben')}</span>
                    </div>
                </div>
                <button type="button" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 -mr-2 -mt-2" data-close="1">
                    <i class="ph ph-x text-2xl"></i>
                </button>
            </div>

            <div class="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">${escapeHtml(event.desc || 'Keine weitere Beschreibung hinterlegt.')}</div>

            ${locationInfo.distanceText ? `<div class="mt-3 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"><i class="ph-fill ph-navigation-arrow text-blue-500"></i>${escapeHtml(locationInfo.distanceText)}</div>` : ''}

            <div class="mt-5 grid grid-cols-1 gap-2">
                ${locationInfo.hasCoords ? `
                    <button type="button" id="program-show-map" class="w-full bg-yellow-500 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                        <i class="ph ph-map-pin"></i> Auf Karte zeigen
                    </button>
                    <button type="button" id="program-route" class="w-full bg-gray-900 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 dark:bg-gray-700">
                        <i class="ph ph-route"></i> Route
                    </button>
                ` : `<div class="text-sm text-gray-500 dark:text-gray-400">Für diesen Programmpunkt ist noch keine Kartenposition hinterlegt.</div>`}
                <button type="button" id="program-calendar" class="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-3 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-600 flex items-center justify-center gap-2">
                    <i class="ph ph-calendar-plus"></i> In Kalender speichern
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close="1"]').forEach(btn => btn.addEventListener('click', close));

    document.getElementById('program-calendar')?.addEventListener('click', () => downloadSingleEventIcs(event));
    document.getElementById('program-link')?.addEventListener('click', () => {
        const externalLink = normalizeExternalLink(event.link);
        if (externalLink) window.open(externalLink, '_blank', 'noopener');
    });
    document.getElementById('program-show-map')?.addEventListener('click', () => {
        close();
        flyToStation(locationInfo.lat, locationInfo.lng, locationInfo.stationId, 19);
    });
    document.getElementById('program-route')?.addEventListener('click', () => {
        close();
        switchTab('map');
        setTimeout(() => {
            try { if (state.map) state.map.invalidateSize(); } catch (e) { }
            if (window.calculateRoute) window.calculateRoute(locationInfo.lat, locationInfo.lng);
        }, 250);
    });
}

export function renderTimeline() {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    if (!state.events || state.events.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic">Noch keine Programmpunkte vorhanden.</p>';
        return;
    }

    // If an event date/time window is configured, show "live/next" only within that window.
    // Use module namespace access so older cached versions don't hard-crash on missing exports.
    const configuredWindow = (typeof utils.getConfiguredEventWindow === 'function')
        ? utils.getConfiguredEventWindow()
        : null;
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hasConfiguredEventDate = !!configuredWindow;
    const isEventDay = hasConfiguredEventDate && todayKey === configuredWindow.dateKey;
    const isEventWindowNow = hasConfiguredEventDate
        ? (typeof utils.isWithinEventWindowNow === 'function')
            ? utils.isWithinEventWindowNow(configuredWindow, now)
            : todayKey === configuredWindow.dateKey
        : false;

    const formatWindow = (w) => {
        if (!w) return '';
        if (typeof utils.formatEventWindowDe === 'function') return utils.formatEventWindowDe(w);
        if (typeof utils.formatEventDateDe === 'function') return utils.formatEventDateDe(w.dateKey);
        return w.dateKey || '';
    };

    // Sort by time
    const sorted = [...state.events].sort((a, b) => {
        return a.time.localeCompare(b.time);
    });

    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeVal = currentHours * 60 + currentMinutes;
    const statusContext = { configuredWindow, hasConfiguredEventDate, isEventDay, isEventWindowNow, currentTimeVal };

    let nextEvent = null;
    let currentActiveEvent = null; // Store currently running event for header
    let hasSetScrollTarget = false; // Ensure we only scroll to the FIRST relevant event

    const infoBanner = !configuredWindow
        ? `
            <div class="mb-4 p-3 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-900 text-xs">
                Für das Programm ist noch kein Event-Datum gesetzt. Deshalb werden „Live“, „Demnächst“ und Countdowns nicht berechnet.
                Bitte im Adminbereich unter Downloads/Kalender das Datum setzen.
            </div>
        `
        : (!isEventDay)
            ? `
            <div class="mb-4 p-3 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-900 text-xs">
                Das Programm gilt am <span class="font-bold">${formatWindow(configuredWindow)}</span>.
                Heute (${now.toLocaleDateString('de-DE')}) ist kein Veranstaltungstag – daher kein „Live/Demnächst“.
            </div>
        `
        : (isEventDay && !isEventWindowNow)
            ? `
                <div class="mb-4 p-3 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-900 text-xs">
                    Die Lichternacht ist aktiv am <span class="font-bold">${formatWindow(configuredWindow)}</span>.
                    Aktuell ist sie nicht gestartet oder bereits vorbei – daher kein „Live/Demnächst“.
                </div>
            `
            : '';

    container.innerHTML = infoBanner + sorted.map((e, index) => {
        const eventStatus = getProgramStatus(e, statusContext);
        const eventTimeVal = eventStatus.eventTimeVal;
        const isCurrent = eventStatus.key === 'live';
        const isPast = eventStatus.isPast;

        // Find Next Event (first one in future)
        if (hasConfiguredEventDate && isEventDay && !nextEvent && eventTimeVal > currentTimeVal && !isCurrent) {
            nextEvent = e;
        }

        // Find Current Event (first one that is active)
        if (isEventWindowNow && !currentActiveEvent && isCurrent) {
            currentActiveEvent = e;
        }

        const colorClass = e.color === 'yellow' ? 'bg-yellow-500' : 
                          e.color === 'red' ? 'bg-red-500' : 
                          e.color === 'purple' ? 'bg-purple-500' : 'bg-gray-500';

        let distInfo = '';
        let showMapBtn = '';

        const locationInfo = getEventLocationInfo(e);
        if (locationInfo.hasCoords) {
            if (locationInfo.distanceText) {
                distInfo = `
                    <span class="flex items-center gap-1 ml-3 pl-3 border-l border-gray-300 dark:border-gray-600">
                        <i class="ph-fill ph-navigation-arrow text-blue-500"></i> ${escapeHtml(locationInfo.distanceText)}
                    </span>
                `;
            }

            const idArg = locationInfo.stationId ? `, ${JSON.stringify(locationInfo.stationId)}` : '';
            showMapBtn = `<button onclick='event.stopPropagation(); flyToStation(${locationInfo.lat}, ${locationInfo.lng}${idArg})' class="ml-2 text-yellow-600 hover:underline font-medium text-xs border border-yellow-200 bg-yellow-50 px-2 py-0.5 rounded hover:bg-yellow-100 dark:bg-gray-700 dark:border-gray-600 dark:text-yellow-500">Zeigen</button>`;
        }

        // Scroll Target Logic: The first "Current" or "Next" event gets the ID
        let scrollId = '';
        if (hasConfiguredEventDate && isEventDay && !hasSetScrollTarget && (isCurrent || (!isPast && eventTimeVal > currentTimeVal))) {
            scrollId = 'id="timeline-scroll-target"';
            hasSetScrollTarget = true;
        }

        return `
        <div ${scrollId} class="relative ${isPast ? 'opacity-50 grayscale' : ''} transition-all duration-500">
            <div class="absolute -left-[23px] w-[2px] timeline-line ${index === 0 ? 'top-4' : 'top-0'} bottom-0"></div>
            <div class="absolute -left-[31px] bg-white border-2 border-gray-300 rounded-full w-4 h-4 mt-1.5 ${isCurrent ? 'border-yellow-500 scale-125 ring-4 ring-yellow-100' : ''}">
                <div class="w-2 h-2 rounded-full ${colorClass} absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
            </div>
            <div onclick='openProgramEvent(${JSON.stringify(e.id)})' class="bg-white p-4 rounded-lg shadow-sm border-l-4 ${e.color === 'yellow' ? 'border-yellow-400' : 'border-gray-300'} dark:bg-gray-800 dark:border-gray-700 cursor-pointer active:scale-[0.99] transition-transform">
                <div class="flex justify-between items-start mb-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-lg ${isCurrent ? 'text-yellow-600' : ''}">${escapeHtml(e.time)} Uhr</span>
                        <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full ${eventStatus.className}">${escapeHtml(eventStatus.label)}</span>
                    </div>
                    ${state.isAdmin ? `
                        <div class="flex gap-2">
                            <button onclick='event.stopPropagation(); editEvent(${JSON.stringify(e.id)})' class="text-gray-300 hover:text-blue-500"><i class="ph ph-pencil-simple"></i></button>
                            <button onclick='event.stopPropagation(); deleteEvent(${JSON.stringify(e.id)})' class="text-gray-300 hover:text-red-500"><i class="ph ph-trash"></i></button>
                        </div>` : ''}
                </div>
                <h4 class="font-bold text-gray-900 dark:text-white">${escapeHtml(e.title)}</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">${escapeHtml(e.desc)}</p>
                <div class="flex items-center text-xs text-gray-500 dark:text-gray-500 gap-1 flex-wrap">
                    <i class="ph-fill ph-map-pin"></i>
                    <span>${escapeHtml(e.loc)}</span>
                    ${distInfo}
                    ${showMapBtn}
                    <span class="ml-auto text-[10px] text-gray-400 flex items-center gap-1">Details <i class="ph ph-caret-right"></i></span>
                </div>
            </div>
        </div>
        `;
    }).join('');

    // Update Header Widget
    const headerDisplay = document.getElementById('current-event-display');
    if (headerDisplay) {
        const isAfterEventWindow = configuredWindow && isEventDay && !isEventWindowNow && currentTimeVal > configuredWindow.endMin;
        if (!configuredWindow) {
            headerDisplay.innerHTML = `<p class="text-white/90 text-sm">Event-Datum fehlt – kein Live-Status.</p>`;
            return;
        }
        if (configuredWindow && (!isEventDay || isAfterEventWindow)) {
            headerDisplay.innerHTML = `<p class="text-white/90 text-sm">Programm am ${formatWindow(configuredWindow)}.</p>`;
            return;
        }
        // PRIORITY 1: Currently Active Event
        if (currentActiveEvent) {
             headerDisplay.innerHTML = `
                <div class="flex gap-3 items-center" onclick="document.getElementById('timeline-scroll-target')?.scrollIntoView({behavior: 'smooth', block: 'center'})">
                    <div class="bg-red-500 text-white p-2 rounded-lg text-center min-w-[50px] animate-pulse">
                        <span class="block font-bold text-sm leading-tight">LIVE</span>
                    </div>
                    <div>
                        <p class="text-xs text-red-200 uppercase font-bold tracking-wider mb-0.5 flex items-center gap-1">
                            <span class="w-2 h-2 bg-red-500 rounded-full animate-ping inline-block"></span> Jetzt läuft
                        </p>
                        <p class="font-bold text-white leading-tight">${currentActiveEvent.title}</p>
                        <p class="text-xs text-white/80 truncate">${currentActiveEvent.loc}</p>
                    </div>
                </div>
            `;
        } 
        // PRIORITY 2: Next Event
        else if (nextEvent) {
            headerDisplay.innerHTML = `
                <div class="flex gap-3 items-center" onclick="document.getElementById('timeline-scroll-target')?.scrollIntoView({behavior: 'smooth', block: 'center'})">
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

    // Auto-Scroll to relevant event (only if we just rendered and it's not already visible)
    // Simple check: if we are in "events" tab (which we are if calling renderTimeline usually), scroll.
    // We add a small delay to ensure DOM is ready.
    if(hasSetScrollTarget) {
        setTimeout(() => {
            const el = document.getElementById('timeline-scroll-target');
            if(el) {
                // Only scroll if strictly needed? For now, always scroll to give "Live" feel.
                // Use scrollIntoView with block: 'center' to center it.
                // But don't be annoying if user scrolled away? 
                // Since renderTimeline is called mostly on data refresh or tab switch, it's fine.
                // el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // EDIT: ScrollIntoView might be too aggressive on every render.
                // Let's only do it if the user just switched tabs (handled by tab switch logic? No.)
                // Let's leave it manual via click on header, OR just do it once on load.
                // Actually, the user specifically asked for "what to expect".
                // Let's enable it for now.
                // el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
}
