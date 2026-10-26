
import { state } from './state.js';
import { getStationTags, normalizeStationTag } from './station-tags.js?v=1.4.301';
import { showToast, getDistance, getVisitedStationIdSet } from './utils.js?v=1.4.301';
import * as utils from './utils.js?v=1.4.301';
import { saveData, deleteData, saveStationEdit } from './data.js?v=1.4.301';
import { refreshMapMarkers, toggleOverviewRoute, highlightRecentlyClosedStation } from './maplibre-map.js?v=1.4.301';
import { updateCheckInBtn, updateLikeBtn } from './gamification.js?v=1.4.301';
import { recordAuditEvent } from './audit.js?v=1.4.301';
import { normalizeImageUrl } from './image-url.js?v=1.4.301';
import { getFeedbackLocation } from './feedback-location.js?v=1.4.301';
import { buildEventCalendar, canDownloadEventCalendar, getCalendarEventWindow } from './event-calendar.js?v=1.4.301';

const STATION_OFFER_MAX_LENGTH = 250;
const STATION_TAG_MAX_COUNT = 5;
const EVENT_DESC_MAX_LENGTH = 250;
const STATION_NAME_MAX_LENGTH = 80;
const STATION_ADDRESS_MAX_LENGTH = 160;
const EVENT_TITLE_MAX_LENGTH = 100;
const EVENT_LOCATION_MAX_LENGTH = 160;
const URL_MAX_LENGTH = 2048;
const TAG_MAX_LENGTH = 30;
let eventImageDraft = '';
let editingStation = null;
let editingStationSnapshot = null;
let stationSaving = false;
let stationImageUploading = false;
let stationModalAnimation = null;
let stationModalCloseTimer = null;

function animateStationModal(stationId, reverse = false) {
    const content = document.getElementById('modal-content');
    if (!content || state.activeTab !== 'map' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const marker = state.markers.find(item => String(item.id) === String(stationId))?.marker.getElement();
    if (!marker || !content.animate) return;
    stationModalAnimation?.cancel();
    const origin = marker.getBoundingClientRect();
    content.style.transition = 'none';
    const destination = content.getBoundingClientRect();
    if (!origin.width || !destination.width || !destination.height) return;
    const scale = Math.max(0.12, Math.min(0.25, origin.width / destination.width));
    content.style.willChange = 'transform, opacity';
    const frames = [
        { transformOrigin: 'center', transform: `translate3d(${origin.x + origin.width / 2 - destination.x - destination.width / 2}px, ${origin.y + origin.height / 2 - destination.y - destination.height / 2}px, 0) scale(${scale})`, opacity: 0 },
        { transformOrigin: 'center', transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 }
    ];
    stationModalAnimation = content.animate(reverse ? frames.reverse() : frames, { duration: reverse ? 180 : 240, easing: 'cubic-bezier(.16,1,.3,1)', fill: reverse ? 'forwards' : 'none' });
    stationModalAnimation.finished.catch(() => {}).finally(() => { content.style.willChange = ''; });
    return stationModalAnimation;
}
const ROUTE_PLAN_STORAGE_KEY = 'route_plan_station_ids_v1';

function hasRoutePlanCoordinates(station) {
    return [station.lat, station.lng].every(value => value != null && typeof value !== 'boolean' && String(value).trim() !== '' && Number.isFinite(Number(value)))
        && Math.abs(Number(station.lat)) <= 90 && Math.abs(Number(station.lng)) <= 180;
}

function getRoutePlanStationIds() {
    const validIds = new Set(state.stations.filter(hasRoutePlanCoordinates).map(station => String(station.id)));
    try {
        const storedIds = JSON.parse(localStorage.getItem(ROUTE_PLAN_STORAGE_KEY) || 'null');
        if (Array.isArray(storedIds)) return storedIds.map(String).filter(id => validIds.has(id));
    } catch (error) {
        console.warn('Saved route plan could not be read', error);
    }
    const configuredIds = Array.isArray(state.config?.defaultRouteStationIds)
        ? state.config.defaultRouteStationIds.map(String).filter(id => validIds.has(id))
        : [];
    return configuredIds.length ? configuredIds : [...validIds];
}

function persistRoutePlanStationIds(stationIds) {
    localStorage.setItem(ROUTE_PLAN_STORAGE_KEY, JSON.stringify(stationIds.map(String)));
}

function updateRoutePlanSelectionCount(modal) {
    const selectedCount = modal.querySelectorAll('input[data-route-plan-station]:checked').length;
    const count = modal.querySelector('[data-route-plan-count]');
    const action = modal.querySelector('[data-route-plan-submit]');
    if (count) count.textContent = `${selectedCount} Station${selectedCount === 1 ? '' : 'en'} ausgewählt`;
    if (action) action.disabled = selectedCount < 2;
}

export function openRoutePlan() {
    const modal = document.getElementById('route-plan-modal');
    const list = document.getElementById('route-plan-stations');
    if (!modal || !list) return;
    modal.querySelector('[data-route-plan-help]').open = false;
    const selectedIds = new Set(getRoutePlanStationIds());
    const modeSelect = modal.querySelector('[data-route-plan-mode]');
    modeSelect.value = localStorage.getItem('route_plan_mode') === 'open' ? 'open' : 'round';
    modeSelect.onchange = () => localStorage.setItem('route_plan_mode', modeSelect.value);
    const stations = [...state.stations]
        .filter(hasRoutePlanCoordinates)
        .filter(station => String(station.id || '').trim())
        .sort((first, second) => Number(first.id) - Number(second.id));

    list.innerHTML = stations.map(station => `<label class="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-gray-700/60 cursor-pointer active:bg-yellow-50 dark:active:bg-yellow-900/20"><input type="checkbox" data-route-plan-station value="${escapeHtml(station.id)}" ${selectedIds.has(String(station.id)) ? 'checked' : ''} class="h-5 w-5 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"><span class="min-w-0 text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">#${escapeHtml(station.id)} · ${escapeHtml(station.name || 'Ohne Namen')}</span></label>`).join('');
    modal.classList.remove('hidden');
    updateRoutePlanSelectionCount(modal);

    const selectIds = (ids) => {
        const wanted = new Set(ids.map(String));
        list.querySelectorAll('input[data-route-plan-station]').forEach(input => { input.checked = wanted.has(input.value); });
        updateRoutePlanSelectionCount(modal);
        persistRoutePlanStationIds([...list.querySelectorAll('input[data-route-plan-station]:checked')].map(input => input.value));
    };
    modal.querySelector('[data-route-plan-recommended]').onclick = () => {
        const configured = Array.isArray(state.config?.defaultRouteStationIds) ? state.config.defaultRouteStationIds : [];
        selectIds(configured.length ? configured : stations.map(station => station.id));
    };
    modal.querySelector('[data-route-plan-favorites]').onclick = () => {
        const favorites = stations.filter(station => state.favorites.has(station.id) || state.favorites.has(String(station.id))).map(station => station.id);
        if (!favorites.length) {
            showToast('Noch keine Favoriten vorhanden. Wähle einfach Stationen aus der Liste.', 'info');
            return;
        }
        selectIds(favorites);
    };
    modal.querySelector('[data-route-plan-all]').onclick = () => selectIds(stations.map(station => station.id));
    modal.querySelector('[data-route-plan-none]').onclick = () => selectIds([]);
    list.onchange = () => {
        updateRoutePlanSelectionCount(modal);
        persistRoutePlanStationIds([...list.querySelectorAll('input[data-route-plan-station]:checked')].map(input => input.value));
    };
    modal.querySelector('[data-route-plan-submit]').onclick = async () => {
        const ids = [...list.querySelectorAll('input[data-route-plan-station]:checked')].map(input => input.value);
        if (ids.length < 2) return;
        persistRoutePlanStationIds(ids);
        localStorage.setItem('route_plan_mode', modeSelect.value);
        modal.classList.add('hidden');
        await toggleOverviewRoute(ids, modeSelect.value);
    };
}

function normalizeExternalLink(value) {
    const raw = String(value || '').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
    if (!raw) return '';
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(withProtocol);
        return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null;
    } catch (e) {
        return null;
    }
}

function linkifyDescription(value) {
    const text = String(value ?? '');
    const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
    let html = '';
    let lastIndex = 0;

    for (const match of text.matchAll(urlPattern)) {
        const rawUrl = match[0];
        const startIndex = match.index ?? 0;
        const trailingPunctuation = rawUrl.match(/[.,!?;:]+$/)?.[0] || '';
        const url = trailingPunctuation ? rawUrl.slice(0, -trailingPunctuation.length) : rawUrl;
        const href = normalizeExternalLink(url);

        html += escapeHtml(text.slice(lastIndex, startIndex));
        html += href
            ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="break-all font-semibold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-300 dark:decoration-blue-500">${escapeHtml(url)}</a>`
            : escapeHtml(url);
        html += escapeHtml(trailingPunctuation);
        lastIndex = startIndex + rawUrl.length;
    }

    return html + escapeHtml(text.slice(lastIndex));
}

function normalizeStationImage(value) {
    return normalizeImageUrl(value);
}

function parseCoordinateInput(value) {
    const normalized = String(value ?? '').trim().replace(',', '.');
    return Number(normalized);
}

function renderModalStationImage(station, isEditing = false) {
    const imageContainer = document.getElementById('modal-image-container');
    if (!imageContainer || !station) return;

    const stationImage = normalizeStationImage(station.image);
    if (!stationImage && !isEditing) {
        imageContainer.innerHTML = '';
        imageContainer.classList.add('hidden');
        return;
    }

    const imageChangeButton = `
        <button id="modal-image-change-btn" type="button" onclick="document.getElementById('image-upload').click()"
            class="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-2 text-xs font-bold text-white shadow-lg backdrop-blur hover:bg-black/85"
            aria-label="Bild ändern" title="Bild ändern">
            <i class="ph ph-camera text-base"></i><span>${stationImage ? 'Bild ändern' : 'Bild auswählen'}</span>
        </button>`;

    imageContainer.innerHTML = stationImage
        ? `<img src="${escapeHtml(stationImage)}" alt="Bild von ${escapeHtml(station.name)}" loading="eager" fetchpriority="high" decoding="async" class="h-48 w-full rounded-t-2xl bg-gray-100 object-contain dark:bg-gray-900">${isEditing ? imageChangeButton : ''}`
        : `<button type="button" onclick="document.getElementById('image-upload').click()" class="flex h-36 w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-300 bg-blue-50 text-sm font-bold text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-gray-900 dark:text-blue-200" aria-label="Bild auswählen"><i class="ph ph-camera text-2xl"></i><span>Bild auswählen</span></button>`;
    imageContainer.classList.remove('hidden');
}

// --- Modal & Tab Handling ---

export function openModal(target) {
    if (typeof target === 'string') {
        // Simple ID toggle
        const el = document.getElementById(target);
        if (el) el.classList.remove('hidden');
    } else if (typeof target === 'object' && target !== null) {
        if (editingStation && !leaveStationEdit()) return false;
        // Station Object
        const s = target;
        const detailModal = document.getElementById('detail-modal');
        const isOpening = detailModal?.classList.contains('hidden');
        if (stationModalCloseTimer !== null) {
            clearTimeout(stationModalCloseTimer);
            stationModalCloseTimer = null;
            stationModalAnimation?.cancel();
        }
        if (state.map && detailModal?.classList.contains('hidden') && !state.modalReturnCamera) {
            const center = state.map.getCenter();
            state.modalReturnCamera = {
                center: [center.lng, center.lat],
                zoom: state.map.getZoom(),
                bearing: state.map.getBearing(),
                pitch: state.map.getPitch()
            };
        }
        state.activeStationId = s.id;
        window.activeStationId = s.id; // Wichtig für HTML onclicks
        
        // Populate Modal
        document.getElementById('modal-title').innerText = s.name;
        document.getElementById('modal-subtitle').innerText = s.desc || '';
        document.getElementById('modal-desc').innerHTML = linkifyDescription(s.offer || s.desc || 'Keine Beschreibung verfügbar.');
        document.getElementById('modal-wc-badge')?.classList.toggle('hidden', !(s.tags || []).some(tag => String(tag).trim().toLowerCase() === 'wc'));
        
        // Fix ID Display
        const numEl = document.getElementById('modal-number');
        if (numEl) numEl.innerText = s.id;
        
        // Image
        renderModalStationImage(s);

        // Route & Maps Buttons
        const btnRoute = document.getElementById('btn-internal-route');
        const btnMaps = document.getElementById('btn-route');
        const btnLink = document.getElementById('modal-link-btn');
        
        if (btnRoute) {
            btnRoute.onclick = () => {
                if (!leaveStationEdit()) return;
                recordAuditEvent('route_opened', { stationId: s.id, stationName: s.name || '' });
                state.skipModalMapRestore = true;
                closeModal();
                switchTab('map');
                // Wait for the tab layout before resizing MapLibre and drawing the route.
                setTimeout(() => {
                    try {
                        if (state.map) state.map.resize();
                    } catch (e) { }
                    if (window.calculateRoute) window.calculateRoute(s.lat, s.lng);
                }, 250);
            };
        }
        
        if (btnMaps) {
            btnMaps.onclick = () => {
                recordAuditEvent('navigation_started', { stationId: s.id, stationName: s.name || '' });
                const url = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`;
                window.open(url, '_blank');
            };
        }

        if (btnLink) {
            const externalLink = normalizeExternalLink(s.link);
            btnLink.classList.toggle('hidden', !externalLink);
            btnLink.classList.toggle('flex', !!externalLink);
            btnLink.onclick = externalLink ? () => {
                recordAuditEvent('station_link_opened', { stationId: s.id, stationName: s.name || '' });
                window.open(externalLink, '_blank', 'noopener');
            } : null;
        }

        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('modal-content');
        if (modal) {
            if (isOpening) stationModalAnimation?.cancel();
            if (content) {
                content.style.transform = '';
                content.style.transition = 'none';
                content.classList.remove('translate-y-full');
            }
            modal.classList.remove('hidden');
            
            // Reset view mode
            setInlineStationEditMode(false);
            document.getElementById('modal-view-mode').classList.remove('hidden');
            document.getElementById('modal-edit-mode').classList.add('hidden');

            // Ensure check-in button reflects visited state immediately
            try { updateCheckInBtn(s.id); } catch (e) { }

            // Ensure like button reflects liked state + count immediately
            try { updateLikeBtn(s.id, s.likes || 0); } catch (e) { }
            if (isOpening) animateStationModal(s.id);
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
    if (id === 'detail-modal') return closeModal();
    if (!id) {
        if (stationModalCloseTimer !== null) return true;
        if (stationSaving || stationImageUploading) return false;
        let discardedDraft = false;
        // Default to detail modal if no ID passed (e.g. from X button)
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('modal-content');
        stationModalAnimation?.cancel();

        // If the active station is a draft, ask before discarding it
        try {
            const sId = state.activeStationId;
            const s = state.stations.find(x => x.id == sId);
            if (s && s.__draft) {
                const ok = confirm('Neue Station verwerfen? (Nicht gespeichert)');
                if (!ok) return false;
                discardedDraft = true;

                state.stations = state.stations.filter(x => x.id != sId);
                state.activeStationId = null;
                window.activeStationId = null;
                if (window.renderList) window.renderList(state.stations);
                if (window.renderFilterBar) window.renderFilterBar();
                if (window.refreshMapMarkers) window.refreshMapMarkers();
            }
        } catch (e) { }
        if (!leaveStationEdit(discardedDraft)) return false;
        
        const closedStationId = state.activeStationId;
        const closingAnimation = animateStationModal(closedStationId, true);

        // Reset active station highlight
        if (state.activeStationId) {
            state.activeStationId = null;
            window.activeStationId = null;
        }

        if (content && !closingAnimation) content.classList.add('translate-y-full');
        
        // Wait for animation
        stationModalCloseTimer = setTimeout(() => {
            stationModalCloseTimer = null;
            if (modal) modal.classList.add('hidden');
            stationModalAnimation?.cancel();
            if (state.activeTab === 'map') highlightRecentlyClosedStation(closedStationId);
            refreshMapMarkers();
            if (state.modalReturnCamera && !state.skipModalMapRestore && state.map) {
                try { state.map.easeTo({ ...state.modalReturnCamera, duration: 350 }); } catch (e) { }
            }
            state.modalReturnCamera = null;
            state.skipModalMapRestore = false;
        }, closingAnimation ? 180 : 0);
        return true;
    }

    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
    return true;
}

export function switchTab(tab) {
    console.log("switchTab called for:", tab);
    const detailModal = document.getElementById('detail-modal');
    if (detailModal && !detailModal.classList.contains('hidden')) {
        if (closeModal() === false) return;
    }
    document.getElementById('floating-status')?.classList.toggle('is-non-map', tab !== 'map');
    document.getElementById('program-event-modal')?.remove();

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
            if (state.map) state.map.resize();
        }, 50);
    }
}

// Alias for backward compatibility
export const appSwitchTab = switchTab;

const THEME_PREFERENCE_KEY = 'themePreference';
const THEME_PREFERENCES = new Set(['light', 'dark', 'system']);
let systemThemeListenerInstalled = false;
let themeMenuDismissListenerInstalled = false;

export function getThemePreference() {
    const savedPreference = localStorage.getItem(THEME_PREFERENCE_KEY);
    if (THEME_PREFERENCES.has(savedPreference)) return savedPreference;

    const legacyDarkMode = localStorage.getItem('darkMode');
    if (legacyDarkMode === 'true') return 'dark';
    if (legacyDarkMode === 'false') return 'light';
    return 'system';
}

function isDarkTheme(preference) {
    return preference === 'dark'
        || (preference === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.backgroundColor = isDark ? '#111827' : '#f3f4f6';
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

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

function updateThemePreferenceControls(preference) {
    const button = document.getElementById('theme-preference-btn');
    if (button) button.title = `Darstellung: ${preference === 'system' ? 'System' : preference === 'dark' ? 'Dunkel' : 'Hell'}`;

    document.querySelectorAll('[data-theme-preference]').forEach(control => {
        const selected = control.dataset.themePreference === preference;
        control.classList.toggle('bg-yellow-100', selected);
        control.classList.toggle('text-yellow-800', selected);
        control.classList.toggle('dark:bg-yellow-500/20', selected);
        control.classList.toggle('dark:text-yellow-300', selected);
        control.setAttribute('aria-checked', String(selected));
    });
}

export function updateDarkModeIcon(isDark, preference = getThemePreference()) {
    const icon = document.getElementById('dark-mode-icon');
    if (icon) {
        const iconName = preference === 'system' ? 'ph-desktop' : isDark ? 'ph-moon' : 'ph-sun';
        icon.className = `ph ${iconName} text-lg sm:text-xl`;
    }
}

function closeThemeMenu() {
    const menu = document.getElementById('theme-preference-menu');
    const button = document.getElementById('theme-preference-btn');
    menu?.classList.add('hidden');
    button?.setAttribute('aria-expanded', 'false');
}

export function toggleThemeMenu() {
    const menu = document.getElementById('theme-preference-menu');
    const button = document.getElementById('theme-preference-btn');
    if (!menu || !button) return;
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    button.setAttribute('aria-expanded', String(willOpen));
}

export function applyThemePreference(preference = getThemePreference(), { announce = false } = {}) {
    const safePreference = THEME_PREFERENCES.has(preference) ? preference : 'system';
    const isDark = isDarkTheme(safePreference);
    applyTheme(isDark);
    updateDarkModeIcon(isDark, safePreference);
    updateThemePreferenceControls(safePreference);
    if (announce) window.dispatchEvent(new CustomEvent('app-theme-change', { detail: { isDark, preference: safePreference } }));
    return isDark;
}

export function setThemePreference(preference) {
    const safePreference = THEME_PREFERENCES.has(preference) ? preference : 'system';
    localStorage.setItem(THEME_PREFERENCE_KEY, safePreference);
    localStorage.removeItem('darkMode');
    const isDark = applyThemePreference(safePreference, { announce: true });
    closeThemeMenu();
    return isDark;
}

export function initializeThemePreference() {
    applyThemePreference();

    if (!systemThemeListenerInstalled && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', () => {
            if (getThemePreference() === 'system') applyThemePreference('system', { announce: true });
        });
        systemThemeListenerInstalled = true;
    }

    if (!themeMenuDismissListenerInstalled) {
        document.addEventListener('click', event => {
            if (!event.target.closest('#theme-preference-menu, #theme-preference-btn')) closeThemeMenu();
        });
        themeMenuDismissListenerInstalled = true;
    }
}

export function toggleDarkMode() {
    return setThemePreference(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
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
let currentSearchQuery = '';

export function renderFilterBar() {
    const container = document.getElementById('filter-bar');
    if (!container) return;
    
    console.log("Rendering Filter Bar v1.4.56");

    // Collect all tags from stations
    const allTags = new Set();
    state.stations.forEach(s => {
        getStationTags(s).forEach(t => allTags.add(t));
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
        row2 += `<option value="${escapeHtml(tag)}" ${selected} class="text-gray-900 bg-white">${escapeHtml(label)}</option>`;
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
    const text = state.config.planningText || "Die nächste Lichternacht ist in Planung. Die hier gezeigten Daten sind noch vom letzten Jahr.";
    const configuredEventWindow = utils.getConfiguredEventWindow?.();
    const planningSignature = JSON.stringify({
        text,
        date: configuredEventWindow?.dateKey || '',
        start: configuredEventWindow?.startTime || '',
        end: configuredEventWindow?.endTime || ''
    });

    const existing = document.getElementById('planning-banner');
    if (existing && isActive && existing.dataset.planningSignature === planningSignature) return;
    if (existing) {
        if (existing._countdownInterval) window.clearInterval(existing._countdownInterval);
        existing.remove();
    }

    if (!isActive) return;
    if (sessionStorage.getItem('planning_banner_dismissed_v1') === planningSignature) return;

    const overlay = document.createElement('div');
    overlay.id = 'planning-banner';
    overlay.dataset.planningSignature = planningSignature;
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

    const initialCountdown = utils.formatPlanningCountdown?.(configuredEventWindow) || '';

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
            
            ${initialCountdown ? `<div id="planning-countdown" style="
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin: 0 36px 18px;
                padding: 8px 14px;
                border-radius: 999px;
                background: rgba(234, 179, 8, 0.14);
                color: #a16207;
                font-size: 15px;
                font-weight: 800;
                letter-spacing: 0.01em;
            "><span style="margin-right: 6px;">⏳</span>${initialCountdown}</div>` : ''}

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

    if (initialCountdown) {
        overlay._countdownInterval = window.setInterval(() => {
            const countdown = overlay.querySelector('#planning-countdown');
            const value = utils.formatPlanningCountdown?.(configuredEventWindow) || '';
            if (!countdown || !value) {
                if (countdown) countdown.remove();
                window.clearInterval(overlay._countdownInterval);
                return;
            }
            countdown.innerHTML = `<span style="margin-right: 6px;">⏳</span>${value}`;
        }, 60000);
    }

    // Trigger Animation
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.firstElementChild.style.transform = 'scale(1)';
    });
}

export function closePlanningBanner() {
    const banner = document.getElementById('planning-banner');
    if (banner) {
        if (banner.dataset.planningSignature) {
            sessionStorage.setItem('planning_banner_dismissed_v1', banner.dataset.planningSignature);
        }
        if (banner._countdownInterval) window.clearInterval(banner._countdownInterval);
        banner.remove();
    }
}

export function renderList(stations) {
    const container = document.getElementById('stations-list');
    if (!container) return;
    
    // Create a copy to avoid mutating the original if we sort, and add dist property safely
    let listToRender = stations.filter(station => {
        if (currentFilter === 'favorites' && !state.favorites.has(station.id) && !state.favorites.has(String(station.id))) return false;
        if (currentFilter === 'visited' && !getVisitedStationIdSet().has(String(station.id))) return false;
        if (!['all', 'proximity', 'favorites', 'visited'].includes(currentFilter) && !getStationTags(station).includes(currentFilter)) return false;
        const search = currentSearchQuery.toLowerCase();
        return !search || [station.name, station.desc, station.offer, station.address].some(value => String(value || '').toLowerCase().includes(search));
    }).map(s => ({...s}));

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

    if (listToRender.length === 0) {
        const filterLabel = currentFilter === 'all'
            ? 'Alle Stationen'
            : currentFilter === 'favorites'
                ? 'Favoriten'
                : currentFilter === 'visited'
                    ? 'Besucht'
                    : currentFilter === 'proximity'
                        ? 'In der Nähe'
                        : (TAG_TRANSLATIONS[currentFilter] || currentFilter);
        const searchText = currentSearchQuery ? ` · Suche „${escapeHtml(currentSearchQuery)}“` : '';
        container.innerHTML = `
            <div class="rounded-2xl border border-dashed border-gray-300 bg-white/80 dark:bg-gray-800 p-6 text-center">
                <i class="ph ph-magnifying-glass text-3xl text-gray-400"></i>
                <h3 class="mt-2 font-bold text-gray-800 dark:text-white">Keine passenden Stationen</h3>
                <p class="mt-1 text-sm text-gray-500">Aktiv: ${escapeHtml(filterLabel)}${searchText}</p>
                <button type="button" onclick="resetStationFilters()" class="mt-4 rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white">Filter zurücksetzen</button>
            </div>`;
        return;
    }

    container.innerHTML = listToRender.map(s => {
        const visibleTags = getStationTags(s).map(t => TAG_TRANSLATIONS[t] || t);
        const isVisited = visitedStations.has(String(s.id));
        const isFavorite = state.favorites.has(s.id) || state.favorites.has(String(s.id));
        const hasProgram = (state.events || []).some(event => String(event.stationId || '') === String(s.id));
        const likeCount = s.likes || 0;
        const stationImage = normalizeStationImage(s.image);
        
        let distInfo = '';
        // Only show distance if user location is active AND distance is calculated
        if (state.userLocation && s._dist !== undefined && s._dist !== null) {
            const walkingDist = s._dist * 1.3;
            const minutes = Math.ceil(walkingDist / 80); // ~4.8 km/h
            
            const distStr = (s._dist > 1000 ? (s._dist/1000).toFixed(1) + ' km' : Math.round(s._dist) + ' m') + ' Luftlinie';
            
            distInfo = `
                <div class="mt-2 flex items-center gap-3 text-xs text-gray-500 font-medium border-t border-gray-100 pt-2 dark:border-gray-700">
                    <span class="flex items-center gap-1 text-blue-600 dark:text-blue-400"><i class="ph-fill ph-navigation-arrow"></i> <span data-station-distance>${distStr}</span></span>
                    <span class="flex items-center gap-1"><i class="ph-fill ph-person-simple-walk"></i> <span data-station-walk-time>ca. ${minutes} min</span></span>
                </div>
            `;
        }

        return `
        <button type="button" data-station-lat="${escapeHtml(s.lat)}" data-station-lng="${escapeHtml(s.lng)}" class="w-full text-left bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow mb-3 relative overflow-hidden ${isVisited ? 'ring-2 ring-green-400' : isFavorite ? 'ring-2 ring-yellow-300' : ''}" onclick="openStation('${s.id}')" aria-label="Station ${escapeHtml(s.name)} öffnen">
            ${isVisited ? `<div class="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm z-10 flex items-center gap-1"><i class="ph-fill ph-check-circle"></i> BESUCHT</div>` : ''}
            <div class="flex items-start gap-3">
                ${stationImage ? `<img src="${escapeHtml(stationImage)}" alt="" loading="lazy" class="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-contain bg-white border border-gray-200 dark:border-gray-700 flex-shrink-0">` : ''}
                <div class="min-w-0 flex-1">
                    <div class="flex justify-between items-start">
                        <h3 class="font-bold text-base sm:text-lg leading-snug pr-2 ${isVisited ? 'text-green-700 dark:text-green-400' : ''}">${escapeHtml(s.name)}</h3>
                        <div class="flex flex-col items-end gap-1">
                            <span class="text-xs font-bold ${isVisited ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-700'} px-1.5 py-0.5 rounded ${isVisited ? 'mr-24' : ''}">#${escapeHtml(s.id)}</span>
                            <span class="text-xs ${likeCount > 0 ? 'text-gray-500' : 'text-gray-400'} flex items-center gap-1 ${isVisited ? 'mr-24' : ''}"><i class="ph-fill ph-thumbs-up text-orange-500"></i> ${likeCount}</span>
                        </div>
                    </div>
                    <p class="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">${escapeHtml(s.desc || '')}</p>
                    ${s.offer ? `<p class="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-700 dark:text-gray-200">${escapeHtml(s.offer)}</p>` : ''}
                    <div class="mt-2 flex gap-1.5 flex-wrap">
                        <span class="text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"><i class="ph ph-map-pin"></i> Station</span>
                        ${hasProgram ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"><i class="ph ph-calendar-star"></i> Mit Programm</span>' : ''}
                        ${isFavorite ? '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-yellow-100 text-yellow-700"><i class="ph-fill ph-star"></i> Favorit</span>' : ''}
                    </div>
                    <div class="mt-2 flex gap-1.5 flex-wrap">
                        ${visibleTags.map(t => `<span class="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">${escapeHtml(t)}</span>`).join('')}
                    </div>
                    ${distInfo}
                </div>
            </div>
        </button>
    `}).join('');
}

export function updateStationDistances() {
    if (!state.userLocation) return;
    document.querySelectorAll('#stations-list [data-station-lat][data-station-lng]').forEach(card => {
        const lat = Number(card.dataset.stationLat);
        const lng = Number(card.dataset.stationLng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const distance = getDistance(state.userLocation.lat, state.userLocation.lng, lat, lng);
        const walkingDistance = distance * 1.3;
        const distanceLabel = distance > 1000
            ? `${(distance / 1000).toFixed(1)} km Luftlinie`
            : `${Math.round(distance)} m Luftlinie`;
        const distanceElement = card.querySelector('[data-station-distance]');
        const timeElement = card.querySelector('[data-station-walk-time]');
        if (distanceElement) distanceElement.textContent = distanceLabel;
        if (timeElement) timeElement.textContent = `ca. ${Math.ceil(walkingDistance / 80)} min`;
    });
}

export function refreshStationList() {
    renderList(state.stations);
}

function scrollStationListToTop() {
    const container = document.getElementById('stations-list');
    if (!container) return;
    container.scrollTo({ top: 0, behavior: 'smooth' });
}

export function filterStations(query) {
    // Basic filter implementation
    currentSearchQuery = String(query || '').trim();
    scrollStationListToTop();
    renderList(state.stations);
}

export function filterList(tag) {
    tag = normalizeStationTag(tag);
    currentFilter = tag;
    currentSearchQuery = '';
    scrollStationListToTop();
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
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
        const favs = state.stations.filter(s => state.favorites.has(s.id) || state.favorites.has(String(s.id)));
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
    const filtered = state.stations.filter(s => getStationTags(s).includes(tag));
    renderList(filtered);
}

export function resetStationFilters() {
    currentFilter = 'all';
    currentSearchQuery = '';
    scrollStationListToTop();
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    renderFilterBar();
    renderList(state.stations);
}

window.resetStationFilters = resetStationFilters;

// --- Helper for Tag Picking ---
function renderTagPicker() {
    const containers = [document.getElementById('inline-available-tags'), document.getElementById('available-tags')]
        .filter(Boolean);
    const input = document.getElementById('edit-tags');
    if (!containers.length || !input) return;

    // Default + Existing Tags
    const allTags = new Set(Object.keys(TAG_TRANSLATIONS));
    state.stations.forEach(s => s.tags?.forEach(t => allTags.add(t)));
    
    // Parse current input
    const currentTags = new Set(input.value.split(',').map(t => t.trim()).filter(t => t));
    const selectedCount = currentTags.size;

    // Ensure currently selected tags are visible even if not in global list yet
    currentTags.forEach(t => allTags.add(t));

    const tagButtons = [...allTags].sort().map(tag => {
        const label = TAG_TRANSLATIONS[tag] || tag;
        const isActive = currentTags.has(tag);
        const isDisabled = !isActive && selectedCount >= STATION_TAG_MAX_COUNT;
        const bg = isActive ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700';
        const disabledClass = isDisabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer';
        return `<button type="button" data-edit-tag="${escapeHtml(tag)}" aria-pressed="${isActive}" ${isDisabled ? 'disabled' : ''} class="${disabledClass} rounded-full border px-2.5 py-1 text-xs font-bold transition-colors ${bg}">${escapeHtml(label)}</button>`;
    }).join('');
    const newTagButton = `<button type="button" data-new-edit-tag ${selectedCount >= STATION_TAG_MAX_COUNT ? 'disabled' : ''} class="${selectedCount >= STATION_TAG_MAX_COUNT ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'} rounded-full border border-gray-300 bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"><i class="ph ph-plus"></i> Neu</button>`;

    containers.forEach(container => {
        container.innerHTML = tagButtons + newTagButton;
        container.querySelectorAll('[data-edit-tag]').forEach(button => {
            button.addEventListener('click', () => window.toggleEditTag(button.dataset.editTag));
        });
        container.querySelector('[data-new-edit-tag]')?.addEventListener('click', window.addNewTag);
    });
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
    if (cleanTag.length > TAG_MAX_LENGTH) {
        showToast(`Tag ist zu lang: maximal ${TAG_MAX_LENGTH} Zeichen`, 'error');
        return;
    }
    if (/[|,]/.test(cleanTag)) {
        showToast('Tags dürfen kein Komma oder | enthalten.', 'error');
        return;
    }
    
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
    const s = id && typeof id === 'object'
        ? id
        : state.stations.find(x => x.id == (id || state.activeStationId));
    if (!s) return;
    if (editingStation && !leaveStationEdit()) return;

    const detailModal = document.getElementById('detail-modal');
    if (detailModal?.classList.contains('hidden') || state.activeStationId != s.id) openModal(s);
    editingStation = JSON.parse(JSON.stringify(s));
    editingStationSnapshot = JSON.parse(JSON.stringify(s));

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
    document.getElementById('inline-edit-lat').value = s.lat ?? '';
    document.getElementById('inline-edit-lng').value = s.lng ?? '';
    document.getElementById('inline-edit-link').value = s.link || '';
    // Init Tag Picker
    renderTagPicker();
    document.getElementById('edit-tags').oninput = () => renderTagPicker();
    updateStationAddressCounter();
    document.getElementById('edit-desc').oninput = updateStationAddressCounter;
    updateOfferCounter();
    document.getElementById('edit-offer').oninput = updateOfferCounter;

    // Image UI
    updateImageUploadUI(s.image);

    setInlineEditableText('modal-number', s.id, 'Stationsnummer');
    setInlineEditableText('modal-title', s.name, 'Stationsname');
    setInlineEditableText('modal-subtitle', s.desc || '', 'Adresse / Ort hinzufügen');
    setInlineEditableText('modal-desc', s.offer || '', 'Angebot / Werbetext hinzufügen');
    setInlineStationEditMode(true);
}

function setInlineEditableText(id, value, placeholder) {
    const element = document.getElementById(id);
    if (!element) return;
    const text = String(value ?? '');
    element.textContent = text;
    element.dataset.empty = text ? 'false' : 'true';
    element.dataset.placeholder = placeholder;
}

function setInlineStationEditMode(isEditing) {
    const content = document.getElementById('modal-content');
    const viewActions = document.getElementById('modal-admin-actions');
    const editActions = document.getElementById('modal-inline-edit-actions');
    const details = document.getElementById('modal-inline-edit-details');
    const linkButton = document.getElementById('modal-link-btn');
    content?.classList.toggle('is-inline-station-editing', isEditing);
    viewActions?.classList.toggle('hidden', isEditing);
    editActions?.classList.toggle('hidden', !isEditing);
    editActions?.classList.toggle('flex', isEditing);
    details?.classList.toggle('hidden', !isEditing);
    linkButton?.classList.toggle('hidden', isEditing || !linkButton.onclick);
    ['modal-number', 'modal-title', 'modal-subtitle', 'modal-desc'].forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        element.contentEditable = isEditing ? 'true' : 'false';
        element.setAttribute('role', isEditing ? 'textbox' : 'presentation');
        if (isEditing) element.setAttribute('aria-label', element.dataset.placeholder || 'Stationsdaten bearbeiten');
        else element.removeAttribute('aria-label');
    });
    const station = editingStation || state.stations.find(item => item.id == state.activeStationId);
    if (station) renderModalStationImage(station, isEditing);
}

function syncInlineStationEditFields() {
    const getText = id => editableText(document.getElementById(id));
    document.getElementById('edit-id').value = getText('modal-number');
    document.getElementById('edit-name').value = getText('modal-title');
    document.getElementById('edit-desc').value = getText('modal-subtitle');
    document.getElementById('edit-offer').value = getText('modal-desc');
    document.getElementById('edit-lat').value = document.getElementById('inline-edit-lat')?.value || '';
    document.getElementById('edit-lng').value = document.getElementById('inline-edit-lng')?.value || '';
    document.getElementById('edit-link').value = document.getElementById('inline-edit-link')?.value || '';
}

function editableText(element) {
    if (!element) return '';
    const transform = element.style.textTransform;
    try {
        element.style.textTransform = 'none';
        return element.innerText.trim();
    } finally {
        element.style.textTransform = transform;
    }
}

export function hasUnsavedStationChanges() {
    if (!editingStation) return false;
    if (stationImageUploading || stationSaving) return true;
    const original = editingStationSnapshot;
    const fields = ['modal-number', 'modal-title', 'modal-subtitle', 'modal-desc', 'inline-edit-lat', 'inline-edit-lng', 'inline-edit-link', 'edit-tags'];
    const values = [original.id, original.name, original.desc, original.offer, original.lat, original.lng, original.link, (original.tags || []).join(', ')];
    return fields.some((id, index) => {
        const element = document.getElementById(id);
        return String(element?.value ?? editableText(element)).trim() !== String(values[index] ?? '').trim();
    }) || editingStation.image !== original.image;
}

function leaveStationEdit(discardConfirmed = false) {
    if (stationSaving || stationImageUploading) {
        showToast('Bitte warten, bis der laufende Vorgang abgeschlossen ist.', 'info');
        return false;
    }
    if (!discardConfirmed && hasUnsavedStationChanges() && !confirm('Ungespeicherte Änderungen verwerfen? Abbrechen = weiterbearbeiten.')) return false;
    editingStation = null;
    editingStationSnapshot = null;
    return true;
}

if (typeof window.addEventListener === 'function') window.addEventListener('beforeunload', event => {
    if (!hasUnsavedStationChanges()) return;
    event.preventDefault();
    event.returnValue = '';
});

export function cancelStationEdit() {
    const station = state.stations.find(item => item.id == state.activeStationId);
    if (!leaveStationEdit()) return;
    if (station) openModal(station);
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
    if (!btn) return;
    
    if (imageSrc) {
        // Show Image Preview in Button
        btn.className = "w-full h-48 relative rounded-lg overflow-hidden border border-gray-300 group cursor-pointer";
        btn.innerHTML = `
            <img src="${imageSrc}" class="w-full h-full object-contain bg-gray-100 dark:bg-gray-900">
            <div class="image-upload-overlay absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white font-bold gap-2">
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
    if (stationSaving || stationImageUploading) return;
    const oldId = state.activeStationId;
    const original = editingStationSnapshot || state.stations.find(x => x.id == oldId);
    if (!original) return;
    const s = { ...(editingStation || original) };
    syncInlineStationEditFields();

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
    const newLat = parseCoordinateInput(document.getElementById('edit-lat').value);
    const newLng = parseCoordinateInput(document.getElementById('edit-lng').value);
    
    // Parse Tags
    const tagsInput = document.getElementById('edit-tags').value;
    const newTags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);

    if (newName.length < 3) {
        showToast("Name muss mindestens 3 Zeichen haben", 'error');
        return;
    }
    if (newName.length > STATION_NAME_MAX_LENGTH) {
        showToast(`Name ist zu lang: maximal ${STATION_NAME_MAX_LENGTH} Zeichen`, 'error');
        return;
    }
    if (newDesc.length > STATION_ADDRESS_MAX_LENGTH) {
        showToast(`Adresse/Ort ist zu lang: maximal ${STATION_ADDRESS_MAX_LENGTH} Zeichen`, 'error');
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
    if (String(newLink || '').length > URL_MAX_LENGTH) {
        showToast(`Link ist zu lang: maximal ${URL_MAX_LENGTH} Zeichen`, 'error');
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
    if (newLat < -90 || newLat > 90 || newLng < -180 || newLng > 180) {
        showToast("Fehler: Koordinaten liegen außerhalb des gültigen Bereichs", 'error');
        return;
    }

    // Update Local Object
    // If ID changed, we need to handle that carefully
    const idChanged = (newId != oldId);
    
    if (idChanged && /^\d+$/.test(String(oldId ?? ''))) {
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

    const stationHints = [];
    if (!String(newDesc || '').trim()) stationHints.push('Adresse/Ort fehlt');
    if (!String(newOffer || '').trim()) stationHints.push('Angebot/Werbetext fehlt');
    if (newTags.length === 0) stationHints.push('keine Tags/Filter gesetzt');

    const saveButton = document.querySelector('#modal-inline-edit-actions button:last-child');
    stationSaving = true;
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Wird gespeichert…'; }
    try {
        s.__docId = String(newId);
        if (s.__draft) delete s.__draft;
        await saveStationEdit(original, s);
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
        editingStation = null;
        editingStationSnapshot = null;
        openModal(s); 
    } catch (e) {
        console.error(e);
        showToast(`Nicht gespeichert: ${e.message || 'Verbindung prüfen'}. Deine Änderungen bleiben zur Bearbeitung erhalten.`, 'error');
    } finally {
        stationSaving = false;
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Speichern'; }
    }
}

export async function deleteStation(id) {
    if (stationSaving || stationImageUploading) return;
    if (!confirm("Station wirklich löschen?")) return;
    const sId = id || state.activeStationId;
    
    try {
        await deleteData('station', sId);
        editingStation = null;
        editingStationSnapshot = null;
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

async function compressStationImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('Bitte eine Bilddatei auswählen.');
    if (file.size > 15 * 1024 * 1024) throw new Error('Das Originalbild ist zu groß (maximal 15 MB).');

    let source;
    let objectUrl = '';
    if (typeof createImageBitmap === 'function') {
        source = await createImageBitmap(file);
    } else {
        objectUrl = URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Das Bild konnte nicht gelesen werden.'));
            image.src = objectUrl;
        });
    }
    const maxEdge = 1200;
    const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
    const targetWidth = Math.max(1, Math.round(source.width * scale));
    const targetHeight = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    context.drawImage(source, 0, 0, source.width, source.height, 0, 0, targetWidth, targetHeight);
    source.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.78));
    if (!blob) throw new Error('Das Bild konnte nicht verarbeitet werden.');
    return blob;
}

export async function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const station = editingStation;
    if (!station) return;
    if (stationSaving || stationImageUploading) return;
    stationImageUploading = true;
    const uploadButton = document.getElementById('modal-image-change-btn');
    const originalLabel = uploadButton?.innerHTML;

    try {
        if (uploadButton) {
            uploadButton.disabled = true;
            uploadButton.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i><span>Bild wird optimiert…</span>';
        }
        const blob = await compressStationImage(file);
        let imageUrl;

        if (!state.useLocalStorage) {
            const currentUser = state.auth?.currentUser;
            if (!currentUser || typeof currentUser.getIdToken !== 'function') {
                throw new Error('Bitte erneut als Admin anmelden.');
            }
            const token = await currentUser.getIdToken();
            const response = await fetch(`./api/station-image?station=${encodeURIComponent(station.id)}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'image/webp'
                },
                body: blob
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.url) {
                throw new Error(result.error || 'Der Server hat den Bild-Upload abgelehnt.');
            }
            imageUrl = result.url;
        } else {
            imageUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        station.image = imageUrl;
        renderModalStationImage(station, true);
        updateImageUploadUI(imageUrl);
        showToast(`Bild optimiert (${Math.max(1, Math.round(blob.size / 1024))} KB) und hochgeladen`, 'success');
    } catch (error) {
        console.error('Station image upload failed', error);
        showToast(error?.message || 'Bild konnte nicht hochgeladen werden', 'error');
        if (uploadButton && originalLabel) uploadButton.innerHTML = originalLabel;
    } finally {
        stationImageUploading = false;
        if (uploadButton) uploadButton.disabled = false;
        input.value = '';
    }
}

function updateEventImageUI(imageUrl = '') {
    const preview = document.getElementById('evt-image-preview');
    const removeButton = document.getElementById('evt-image-remove-btn');
    if (!preview || !removeButton) return;
    if (imageUrl) {
        preview.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="Vorschau Programmbild" class="h-full w-full object-cover">`;
        preview.classList.remove('hidden');
        removeButton.classList.remove('hidden');
    } else {
        preview.innerHTML = '';
        preview.classList.add('hidden');
        removeButton.classList.add('hidden');
    }
}

export async function handleEventImageUpload(input) {
    const file = input.files?.[0];
    if (!file) return;
    const uploadButton = document.getElementById('evt-image-upload-btn');
    try {
        uploadButton.disabled = true;
        uploadButton.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Wird optimiert…';
        const blob = await compressStationImage(file);
        let imageUrl;
        if (!state.useLocalStorage) {
            const currentUser = state.auth?.currentUser;
            if (!currentUser?.getIdToken) throw new Error('Bitte erneut als Admin anmelden.');
            const eventId = state.activeEventId || `evt_${Date.now()}`;
            if (!state.activeEventId) state.activeEventId = eventId;
            const response = await fetch(`./api/event-image?event=${encodeURIComponent(eventId)}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${await currentUser.getIdToken()}`, 'Content-Type': 'image/webp' },
                body: blob
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.url) throw new Error(result.error || 'Der Server hat den Bild-Upload abgelehnt.');
            imageUrl = result.url;
        } else {
            imageUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
        eventImageDraft = imageUrl;
        updateEventImageUI(imageUrl);
        showToast(`Programmbild optimiert (${Math.max(1, Math.round(blob.size / 1024))} KB)`, 'success');
    } catch (error) {
        console.error('Event image upload failed', error);
        showToast(error?.message || 'Programmbild konnte nicht hochgeladen werden', 'error');
    } finally {
        uploadButton.disabled = false;
        uploadButton.innerHTML = '<i class="ph ph-image"></i> Bild wählen';
        input.value = '';
    }
}

export function clearEventImage() {
    eventImageDraft = '';
    updateEventImageUI('');
}

export function clearStationImage() {
    if (stationSaving || stationImageUploading) return;
    const s = editingStation;
    if (s) {
        s.image = null;
        renderModalStationImage(s, true);
        updateImageUploadUI(null);
    }
}

export function fillStationCoords() {
    // Helper to update hidden inputs when dragging marker
    // This assumes the map marker drag event calls this or updates the inputs directly.
    // If not, we might need to hook this up.
    // For now, let's leave it as a placeholder or implementing if we know the marker context.
    // Im Adminmodus aktualisiert das Kartenmodul diese Eingaben.
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

export function openNewEvent() {
    resetEventModal();
    state.activeEventId = null;
    openModal('event-modal');
}

export function editEvent(id) {
    const e = state.events.find(x => x.id == id);
    if (!e) return;
    
    state.activeEventId = e.id;
    populateEventStationSelect(e.stationId || '');
    updateEventStationLinkControls();
    
    document.getElementById('evt-time').value = e.time;
    document.getElementById('evt-title').value = e.title;
    document.getElementById('evt-desc').value = e.desc || '';
    document.getElementById('evt-link').value = e.link || '';
    document.getElementById('evt-loc').value = e.loc;
    document.getElementById('evt-lat').value = e.lat;
    document.getElementById('evt-lng').value = e.lng;
    document.getElementById('evt-color').value = e.color || 'yellow';
    eventImageDraft = normalizeStationImage(e.image);
    updateEventImageUI(eventImageDraft);
    updateEventDescCounter();
    document.getElementById('evt-desc').oninput = updateEventDescCounter;
    
    // Station Link logic if we had it stored in event
    // For now we don't strictly store linkedStationId in event, 
    // but we could match by coords or name.
    
    document.getElementById('btn-delete-event').classList.remove('hidden');
    document.getElementById('btn-duplicate-event').classList.remove('hidden');
    openModal('event-modal');
}

export function duplicateEvent() {
    if (!state.activeEventId) return;

    const titleInput = document.getElementById('evt-title');
    const copySuffix = ' (Kopie)';
    const copyTitle = titleInput.value.trim();
    titleInput.value = `${copyTitle.slice(0, Math.max(0, EVENT_TITLE_MAX_LENGTH - copySuffix.length))}${copySuffix}`;
    state.activeEventId = null;
    document.getElementById('btn-delete-event').classList.add('hidden');
    document.getElementById('btn-duplicate-event').classList.add('hidden');
    showToast('Kopie erstellt – Zeit prüfen und speichern.', 'info');
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
    eventImageDraft = '';
    updateEventImageUI('');
    document.getElementById('btn-delete-event').classList.add('hidden');
    document.getElementById('btn-duplicate-event').classList.add('hidden');
    updateEventDescCounter();
    document.getElementById('evt-desc').oninput = updateEventDescCounter;
    
    // Populate Station Select
    populateEventStationSelect('');
    updateEventStationLinkControls();
}

function populateEventStationSelect(selectedId = '') {
    const select = document.getElementById('evt-linked-station');
    if (!select) return;
    select.innerHTML = '<option value="">Keine Station (eigenständiger Programmpunkt)</option>' +
        state.stations.map(station => `<option value="${escapeHtml(station.id)}">#${escapeHtml(station.id)} · ${escapeHtml(station.name)}</option>`).join('');
    select.value = String(selectedId || '');
}

export function applyStationToEvent(val) {
    updateEventStationLinkControls();
    if (!val) return;
    const s = state.stations.find(x => x.id == val);
    if (s) {
        document.getElementById('evt-title').value = s.name; // Suggest Name
        document.getElementById('evt-loc').value = s.name;
        document.getElementById('evt-lat').value = s.lat;
        document.getElementById('evt-lng').value = s.lng;
    }
}

function updateEventStationLinkControls() {
    const select = document.getElementById('evt-linked-station');
    const unlinkButton = document.getElementById('evt-unlink-station');
    if (!select || !unlinkButton) return;
    unlinkButton.classList.toggle('hidden', !select.value);
}

export function unlinkEventFromStation() {
    const select = document.getElementById('evt-linked-station');
    if (!select || !select.value) return;
    select.value = '';
    updateEventStationLinkControls();
    showToast('Programmpunkt getrennt – mit Speichern übernehmen.', 'info');
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
    const stationId = document.getElementById('evt-linked-station').value.trim();
    
    if (!time || !title) {
        showToast("Zeit und Titel sind Pflicht!", 'error');
        return;
    }

    if (title.length < 3) {
        showToast("Titel muss mindestens 3 Zeichen haben", 'error');
        return;
    }
    if (title.length > EVENT_TITLE_MAX_LENGTH) {
        showToast(`Titel ist zu lang: maximal ${EVENT_TITLE_MAX_LENGTH} Zeichen`, 'error');
        return;
    }
    if (loc.length > EVENT_LOCATION_MAX_LENGTH) {
        showToast(`Ort/Adresse ist zu lang: maximal ${EVENT_LOCATION_MAX_LENGTH} Zeichen`, 'error');
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
    if (String(link || '').length > URL_MAX_LENGTH) {
        showToast(`Link ist zu lang: maximal ${URL_MAX_LENGTH} Zeichen`, 'error');
        return;
    }
    if (stationId && !state.stations.some(station => String(station.id) === stationId)) {
        showToast('Die verknüpfte Station existiert nicht mehr.', 'error');
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
        stationId: stationId || '',
        lat: lat || 0,
        lng: lng || 0,
        color,
        image: eventImageDraft
    };

    const existingIndex = state.events.findIndex(event => event.id == evt.id);
    const previousEvent = existingIndex >= 0 ? state.events[existingIndex] : null;
    if (existingIndex >= 0) state.events[existingIndex] = evt;
    else state.events.push(evt);

    try {
        await saveData('event', evt);
        showToast("Programmpunkt gespeichert", 'success');
        if (eventHints.length > 0) {
            setTimeout(() => showToast(`Hinweis: ${eventHints.join(' · ')}`, 'info'), 350);
        }
        
        renderTimeline();
        closeModal('event-modal');
    } catch (e) {
        if (existingIndex >= 0) state.events[existingIndex] = previousEvent;
        else state.events = state.events.filter(event => event !== evt);
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
    }
}

export async function deleteEvent(id) {
    const eId = id || state.activeEventId;
    if (!eId) return;
    const eventIndex = state.events.findIndex(event => String(event.id) === String(eId));
    const event = state.events[eventIndex];
    if (!event) return;
    
    if (!confirm("Programmpunkt wirklich löschen?")) return;

    state.events.splice(eventIndex, 1);
    renderTimeline();
    if (window.refreshMapMarkers) window.refreshMapMarkers();
    
    try {
        await deleteData('event', event.__docId || event.id);
        showToast("Gelöscht", 'success');
        closeModal('event-modal');
    } catch (e) {
        state.events.splice(eventIndex, 0, event);
        renderTimeline();
        if (window.refreshMapMarkers) window.refreshMapMarkers();
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
                const pos = item.marker?.getLngLat ? item.marker.getLngLat() : null;
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
            const element = item.marker?.getElement?.();
            if (element) element.style.zIndex = '';
        });
    }

    function applyMapHighlight(attempt = 0) {
        const entry = findTargetMarker();
        if (!entry?.marker) {
            if (attempt < 6) setTimeout(() => applyMapHighlight(attempt + 1), 250);
            return;
        }

        const iconDiv = entry.marker.getElement();
        iconDiv.style.zIndex = '10000';
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
            iconDiv.style.zIndex = '';
        }, 8000);
    }
    
    switchTab('map');
    // Allow tab switch animation to start
    setTimeout(() => {
        if (state.map) {
            try { state.map.resize(); } catch (e) { }
            state.map.flyTo({ center: [Number(lng), Number(lat)], zoom, duration: 700 });
            
            clearMapHighlights();
            showToast("Station auf der Karte markiert", 'info');
            applyMapHighlight();
            setTimeout(() => applyMapHighlight(), 700);
        }
    }, 300); // Slightly longer delay to ensure map is rendered
}

export function openBugReportModal() {
    if (!bugReportSending) {
        const locationOption = document.getElementById('bug-report-location');
        if (locationOption) locationOption.checked = false;
        const status = document.getElementById('bug-report-location-status');
        if (status) status.textContent = '';
    }
    openModal('bug-report-modal');
}

let bugReportSending = false;

export async function submitBugReport() {
    if (bugReportSending) return;
    const desc = document.getElementById('bug-desc').value;
    if (!desc) { 
        showToast("Bitte Beschreibung eingeben", 'error'); 
        return; 
    }

    const reportUrl = new URL(window.location.href);
    reportUrl.hash = '';
    const report = {
        description: desc,
        timestamp: Date.now(),
        dateStr: new Date().toLocaleString(),
        userAgent: navigator.userAgent,
        user: (state.auth && state.auth.currentUser) ? (state.auth.currentUser.email || 'anonymous') : 'anonymous',
        userId: (state.auth && state.auth.currentUser) ? (state.auth.currentUser.uid || '') : '',
        appId: state.appId || 'unknown',
        url: reportUrl.href
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
    const submitButton = document.getElementById('bug-report-submit');
    const locationOption = document.getElementById('bug-report-location');
    const locationStatus = document.getElementById('bug-report-location-status');
    const includeLocation = locationOption?.checked === true;
    if (locationStatus) locationStatus.textContent = '';
    const originalButtonContent = submitButton?.innerHTML;
    bugReportSending = true;
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        submitButton.innerHTML = '<svg data-feedback-spinner class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span>Wird gesendet…</span>';
    }
    if (locationOption) locationOption.disabled = true;
    try {
        let location;
        if (includeLocation) {
            if (locationStatus) locationStatus.textContent = 'Standort wird einmalig ermittelt…';
            location = await getFeedbackLocation();
            if (locationStatus) locationStatus.textContent = location
                ? 'Der Standort wird dieser Rückmeldung beigefügt.'
                : 'Standort nicht verfügbar. Die Rückmeldung wird ohne Standort gesendet.';
        }
        const headers = { 'Content-Type': 'application/json' };
        const user = state.auth?.currentUser;
        if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
        const res = await fetch('./api/bug-report', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                text: reportText,
                ...(location ? { location } : {})
            })
        });

        if (res.status === 429) {
            showToast('Zu viele Sendeversuche. Bitte in 10 Minuten erneut versuchen. Dein Text bleibt erhalten.', 'error');
            return;
        }
        if (!res.ok) {
            const msg = await res.text().catch(() => '');
            throw new Error(msg || `HTTP ${res.status}`);
        }
        const result = await res.json();
        if (result.ok !== true) throw new Error('Versand wurde nicht bestätigt');

        document.getElementById('bug-desc').value = '';
        if (locationOption) locationOption.checked = false;
        if (locationStatus) locationStatus.textContent = '';
        closeModal('bug-report-modal');
        showToast(includeLocation && !location ? 'Danke! Feedback ohne Standort gesendet.' : 'Danke! Feedback gesendet.', 'success');
        return;
    } catch (e) {
        console.error("Bug report send failed", e);
        showToast('Feedback konnte nicht gesendet werden. Bitte später erneut versuchen. Dein Text bleibt erhalten.', 'error');
    } finally {
        bugReportSending = false;
        if (locationOption) locationOption.disabled = false;
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.setAttribute('aria-busy', 'false');
            submitButton.innerHTML = originalButtonContent;
        }
    }
}

export function openEventModal() {
    openModal('event-modal');
}

export function closeEventModal() {
    closeModal('event-modal');
}

let calendarButtonTimer;

export function updateCalendarButtons() {
    clearTimeout(calendarButtonTimer);
    const value = state.downloads?.icsDate;
    const visible = canDownloadEventCalendar(value);
    document.querySelectorAll('[data-event-calendar]').forEach(button => button.classList.toggle('hidden', !visible));
    if (visible) {
        const delay = Math.min(getCalendarEventWindow(value).cutoff - Date.now(), 86400000);
        calendarButtonTimer = setTimeout(updateCalendarButtons, Math.max(1, delay));
    }
}

export function generateICS() {
    const icsContent = buildEventCalendar(state.downloads?.icsDate, state.config?.title || 'Lichternacht Bechhofen');
    if (!icsContent) {
        updateCalendarButtons();
        return;
    }
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lichternacht.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
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
    const linkedStation = String(event.stationId || '').trim()
        ? state.stations.find(station => String(station.id) === String(event.stationId))
        : null;
    const lat = parseFloat(linkedStation?.lat ?? event.lat);
    const lng = parseFloat(linkedStation?.lng ?? event.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001);
    if (!hasCoords) return { hasCoords: false, lat: null, lng: null, stationId: null, distanceText: '' };

    let distanceText = '';
    if (state.userLocation) {
        const distance = getDistance(state.userLocation.lat, state.userLocation.lng, lat, lng);
        const minutes = Math.ceil(distance * 1.3 / 80);
        const distanceLabel = distance > 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`;
        distanceText = `${distanceLabel} Luftlinie · Gehzeit geschätzt ca. ${minutes} min`;
    }

    return {
        hasCoords,
        lat,
        lng,
        stationId: linkedStation?.id ?? null,
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
    if (!context.hasConfiguredEventDate) {
        return { key: 'no-date', label: 'Datum fehlt', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200', isPast: false, eventTimeVal };
    }
    if (context.configuredWindow && !context.isEventDay) {
        return { key: 'date', label: 'Geplant', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200', isPast: false, eventTimeVal };
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
    const eventImage = normalizeStationImage(event.image);

    const overlay = document.createElement('div');
    overlay.id = 'program-event-modal';
    overlay.className = 'fixed inset-0 z-[4000] flex items-end sm:items-center justify-center p-0 sm:p-4';
    overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" data-close="1"></div>
        <div id="program-event-modal-content" class="swipe-dismiss-sheet relative z-10 w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 dark:text-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700">
            ${eventImage ? `<img src="${escapeHtml(eventImage)}" alt="Bild zu ${escapeHtml(event.title)}" loading="eager" fetchpriority="high" decoding="async" class="h-52 w-full object-cover rounded-t-2xl sm:h-64">` : ''}
            <div class="p-5">
            <div class="w-16 h-6 -mt-3 mb-1 mx-auto relative sm:hidden" aria-label="Fenster nach unten wischen">
                <span class="absolute left-1/2 top-1/2 w-12 h-1 -translate-x-1/2 -translate-y-1/2 bg-gray-300 dark:bg-gray-600 rounded-full"></span>
            </div>
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
                <button type="button" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 -mr-2 -mt-2" data-close="1" aria-label="Programmpunkt schließen">
                    <i class="ph ph-x text-2xl"></i>
                </button>
            </div>

            <div class="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">${linkifyDescription(event.desc || 'Keine weitere Beschreibung hinterlegt.')}</div>

            ${locationInfo.distanceText ? `<div class="mt-3 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2"><i class="ph-fill ph-navigation-arrow text-blue-500"></i>${escapeHtml(locationInfo.distanceText)}</div>` : ''}

            ${state.isAdmin ? `<button type="button" id="program-edit" class="mt-3 w-full rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-sm font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200"><i class="ph ph-pencil-simple"></i> Bearbeiten</button>` : ''}

            <div class="mt-5 grid grid-cols-1 gap-2">
                ${locationInfo.hasCoords ? `
                    <button type="button" id="program-show-map" class="w-full bg-yellow-500 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                        <i class="ph ph-map-pin"></i> Auf Karte zeigen
                    </button>
                    <button type="button" id="program-route" class="w-full bg-gray-900 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 dark:bg-gray-700">
                        <i class="ph ph-route"></i> Route in der App anzeigen
                    </button>
                ` : `<div class="text-sm text-gray-500 dark:text-gray-400">Für diesen Programmpunkt ist noch keine Kartenposition hinterlegt.</div>`}
                <button type="button" id="program-calendar" class="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-3 rounded-xl font-bold text-sm border border-gray-200 dark:border-gray-600 flex items-center justify-center gap-2">
                    <i class="ph ph-calendar-plus"></i> In Kalender speichern
                </button>
            </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    utils.attachSwipeToDismiss(document.getElementById('program-event-modal-content'), close);
    overlay.querySelectorAll('[data-close="1"]').forEach(btn => btn.addEventListener('click', close));

    document.getElementById('program-calendar')?.addEventListener('click', () => {
        recordAuditEvent('program_calendar_saved', { eventId: event.id, eventTitle: event.title || '' });
        downloadSingleEventIcs(event);
    });
    document.getElementById('program-link')?.addEventListener('click', () => {
        const externalLink = normalizeExternalLink(event.link);
        if (externalLink) {
            recordAuditEvent('program_link_opened', { eventId: event.id, eventTitle: event.title || '' });
            window.open(externalLink, '_blank', 'noopener');
        }
    });
    document.getElementById('program-edit')?.addEventListener('click', () => {
        close();
        editEvent(event.id);
    });
    document.getElementById('program-show-map')?.addEventListener('click', () => {
        recordAuditEvent('program_map_opened', { eventId: event.id, eventTitle: event.title || '' });
        close();
        flyToStation(locationInfo.lat, locationInfo.lng, locationInfo.stationId, 19);
    });
    document.getElementById('program-route')?.addEventListener('click', () => {
        recordAuditEvent('program_route_opened', { eventId: event.id, eventTitle: event.title || '' });
        close();
        switchTab('map');
        setTimeout(() => {
            try { if (state.map) state.map.resize(); } catch (e) { }
            if (window.calculateRoute) window.calculateRoute(locationInfo.lat, locationInfo.lng);
        }, 250);
    });
}

function renderFlyerDownloads() {
    const container = document.getElementById('program-flyer-downloads');
    if (!container) return;
    const flyers = ['flyer1', 'flyer2']
        .map((key, index) => ({
            url: String(state.downloads?.[key] || '').trim(),
            label: String(state.downloads?.[`${key}Label`] || `Flyer ${index + 1}`).trim() || `Flyer ${index + 1}`
        }))
        .filter(({ url }) => /^https?:\/\//i.test(url) || /^\/downloads\/flyers\/[a-zA-Z0-9_-]+\.pdf$/i.test(url));

    if (flyers.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="rounded-2xl border border-blue-100 bg-blue-50 p-2.5 dark:border-blue-900 dark:bg-blue-950/30">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div class="text-xs font-bold text-blue-950 dark:text-blue-100 sm:shrink-0">Flyer &amp; Informationen</div>
                <div class="grid flex-1 gap-2 ${flyers.length > 1 ? 'sm:grid-cols-2' : ''}">
                    ${flyers.map(({ url, label }) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-blue-700 shadow-sm ring-1 ring-blue-100 active:scale-[0.98] dark:bg-gray-800 dark:text-blue-300 dark:ring-blue-900"><i class="ph ph-arrow-square-out text-base"></i>${escapeHtml(label)} öffnen</a>`).join('')}
                </div>
            </div>
        </div>
    `;
}

export function renderTimeline() {
    const container = document.getElementById('timeline-container');
    if (!container) return;
    renderFlyerDownloads();

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

    container.innerHTML = sorted.map((e, index) => {
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
        const linkedStation = e.stationId
            ? (state.stations || []).find(station => String(station.id) === String(e.stationId))
            : null;
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
            <div class="absolute -left-[19px] w-[2px] timeline-line ${index === 0 ? 'top-4' : 'top-0'} bottom-0"></div>
            <div class="absolute -left-[27px] bg-white border-2 border-gray-300 rounded-full w-4 h-4 mt-1.5 ${isCurrent ? 'border-yellow-500 scale-125 ring-4 ring-yellow-100' : ''}">
                <div class="w-2 h-2 rounded-full ${colorClass} absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
            </div>
            <div onclick='openProgramEvent(${JSON.stringify(e.id)})' class="bg-white p-3 rounded-lg shadow-sm border-l-4 ${e.color === 'yellow' ? 'border-yellow-400' : 'border-gray-300'} dark:bg-gray-800 dark:border-gray-700 cursor-pointer active:scale-[0.99] transition-transform">
                <div class="flex items-start gap-2">
                ${normalizeStationImage(e.image) ? `<img src="${escapeHtml(normalizeStationImage(e.image))}" alt="Bild zu ${escapeHtml(e.title)}" class="aspect-square w-14 shrink-0 rounded-lg object-cover sm:w-16">` : ''}
                <div class="min-w-0 flex-1">
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
                ${linkedStation ? `<span class="inline-flex items-center gap-1 mb-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"><i class="ph ph-map-pin"></i> Bei Station #${escapeHtml(linkedStation.id)} · ${escapeHtml(linkedStation.name)}</span>` : ''}
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">${escapeHtml(e.desc)}</p>
                <div class="flex items-center text-xs text-gray-500 dark:text-gray-400 gap-1 flex-wrap">
                    <i class="ph-fill ph-map-pin"></i>
                    <span>${escapeHtml(e.loc)}</span>
                    ${distInfo}
                    ${showMapBtn}
                    <span class="ml-auto text-[11px] text-gray-500 dark:text-gray-300 flex items-center gap-1">Details <i class="ph ph-caret-right"></i></span>
                </div>
                </div>
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
            headerDisplay.innerHTML = `<p class="text-white/90 text-sm">Programm am ${utils.formatEventWindowDe(configuredWindow)}.</p>`;
            return;
        }
        const spotlightCard = (event, type) => {
            const location = getEventLocationInfo(event);
            const eventMinutes = getProgramStatus(event, statusContext).eventTimeVal;
            const minutesUntil = Math.max(1, eventMinutes - currentTimeVal);
            const isLive = type === 'current';
            const label = isLive ? 'Jetzt' : `Als Nächstes · in ${minutesUntil} Min.`;
            const buttonId = isLive ? 'program-current-map' : 'program-next-map';
            return `
                <div class="rounded-xl border ${isLive ? 'border-red-300 bg-red-500/20' : 'border-white/25 bg-white/10'} p-3">
                    <div class="flex items-start gap-3">
                        <div class="${isLive ? 'bg-red-500 animate-pulse' : 'bg-white/20'} rounded-lg px-2 py-1.5 text-center min-w-[58px]">
                            <span class="block text-[10px] font-extrabold uppercase">${isLive ? 'Live' : escapeHtml(event.time)}</span>
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs ${isLive ? 'text-red-100' : 'text-white/80'} uppercase font-extrabold tracking-wide">${label}</p>
                            <p class="font-extrabold text-white leading-tight">${escapeHtml(event.title)}</p>
                            <p class="mt-0.5 text-xs text-white/85 truncate"><i class="ph-fill ph-map-pin"></i> ${escapeHtml(event.loc || 'Ort nicht angegeben')}</p>
                        </div>
                    </div>
                    <div class="mt-2 grid ${location.hasCoords ? 'grid-cols-2' : 'grid-cols-1'} gap-2">
                        <button type="button" data-program-event="${escapeHtml(event.id)}" class="rounded-lg bg-white/15 px-2 py-2 text-xs font-bold text-white border border-white/20">Details</button>
                        ${location.hasCoords ? `<button type="button" id="${buttonId}" class="rounded-lg bg-white px-2 py-2 text-xs font-extrabold text-gray-900"><i class="ph-fill ph-map-pin"></i> Auf Karte zeigen</button>` : ''}
                    </div>
                </div>`;
        };

        if (currentActiveEvent || nextEvent) {
            headerDisplay.innerHTML = `<div class="space-y-2">${currentActiveEvent ? spotlightCard(currentActiveEvent, 'current') : ''}${nextEvent ? spotlightCard(nextEvent, 'next') : ''}</div>`;
            headerDisplay.querySelectorAll('[data-program-event]').forEach(button => {
                button.addEventListener('click', () => openProgramEvent(button.dataset.programEvent));
            });
            const bindMapButton = (buttonId, event) => {
                const button = document.getElementById(buttonId);
                if (!button || !event) return;
                const location = getEventLocationInfo(event);
                button.addEventListener('click', () => flyToStation(location.lat, location.lng, location.stationId, 19));
            };
            bindMapButton('program-current-map', currentActiveEvent);
            bindMapButton('program-next-map', nextEvent);
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
