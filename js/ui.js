
import { state } from './state.js';
import { showToast } from './utils.js';
import { saveData, deleteData } from './data.js';

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
        
        // Image
        const imgContainer = document.getElementById('modal-image-container');
        if (s.image) {
            imgContainer.innerHTML = `<img src="${s.image}" class="w-full h-48 object-cover rounded-t-2xl">`;
            imgContainer.classList.remove('hidden');
        } else {
            imgContainer.classList.add('hidden');
        }

        // ...

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

export function closeModal(id) {
    if (!id) {
        // Default to detail modal if no ID passed (e.g. from X button)
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('modal-content');
        
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
    // Hide all contents
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    
    // Deactivate all nav buttons
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('text-yellow-600', 'font-bold'));
    
    // Show selected
    const content = document.getElementById(`tab-${tab}`);
    if (content) content.classList.remove('hidden');
    
    // Activate button
    const btn = document.getElementById(`nav-${tab}`);
    if (btn) btn.classList.add('text-yellow-600', 'font-bold');

    if (tab === 'map') {
        // Trigger map resize if needed
        window.dispatchEvent(new Event('resize'));
    }
}

export function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    updateDarkModeIcon(isDark);
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

export function renderList(stations) {
    const container = document.getElementById('list-container');
    if (!container) return;
    
    container.innerHTML = stations.map(s => `
        <div class="bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-4" onclick="state.map.flyTo([${s.lat}, ${s.lng}], 18); switchTab('map');">
            <h3 class="font-bold text-lg">${s.name}</h3>
            <p class="text-gray-600 dark:text-gray-400">${s.desc}</p>
            <div class="mt-2 flex gap-2">
                ${s.tags ? s.tags.map(t => `<span class="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">${t}</span>`).join('') : ''}
            </div>
        </div>
    `).join('');
}

export function renderTimeline() {
    // Placeholder for timeline rendering
    console.log("Rendering timeline...");
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
    // Filter by tag
    const filtered = state.stations.filter(s => s.tags && s.tags.includes(tag));
    renderList(filtered);
}

// --- Editing / Admin Stubs ---

export function saveStationChanges() {
    console.log("saveStationChanges called");
}

export function deleteStation(id) {
    console.log("deleteStation called", id);
}

export function handleImageUpload() {
    console.log("handleImageUpload called");
}

export function editStation(id) {
    console.log("editStation called", id);
}

export function openEventModal() {
    openModal('event-modal');
}

export function closeEventModal() {
    closeModal('event-modal');
}

export function fillEventCoords() {
    console.log("fillEventCoords called");
}

export function saveEventChanges() {
    console.log("saveEventChanges called");
}

export function deleteEvent(id) {
    console.log("deleteEvent called", id);
}

export function shareStation(id) {
    console.log("shareStation called", id);
}

export function generateICS() {
    console.log("generateICS called");
}

export function searchAddress() {
    console.log("searchAddress called");
}

export function fillStationCoords() {
    console.log("fillStationCoords called");
}

export function searchStationAddress() {
    console.log("searchStationAddress called");
}

export function createEventForStation(id) {
    console.log("createEventForStation called", id);
}

export function clearStationImage() {
    console.log("clearStationImage called");
}

export function startStationPicker() {
    console.log("startStationPicker called");
}

export function openBugReportModal() {
    openModal('bug-report-modal');
}

export function submitBugReport() {
    console.log("submitBugReport called");
    closeModal('bug-report-modal');
    showToast('Bug gemeldet!', 'success');
}
