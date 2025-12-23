
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

        return `
        <div class="mb-8 relative ${isPast ? 'opacity-50 grayscale' : ''}">
            <div class="absolute -left-[31px] bg-white border-2 border-gray-300 rounded-full w-4 h-4 mt-1.5 ${isCurrent ? 'border-yellow-500 scale-125' : ''}">
                <div class="w-2 h-2 rounded-full ${colorClass} absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
            </div>
            <div class="bg-white p-4 rounded-lg shadow-sm border-l-4 ${e.color === 'yellow' ? 'border-yellow-400' : 'border-gray-300'} dark:bg-gray-800 dark:border-gray-700">
                <div class="flex justify-between items-start mb-1">
                    <span class="font-bold text-lg ${isCurrent ? 'text-yellow-600' : ''}">${e.time} Uhr</span>
                    ${state.isAdmin ? `<button onclick="deleteEvent('${e.id}')" class="text-gray-300 hover:text-red-500"><i class="ph ph-trash"></i></button>` : ''}
                </div>
                <h4 class="font-bold text-gray-900 dark:text-white">${e.title}</h4>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">${e.desc}</p>
                <div class="flex items-center text-xs text-gray-500 dark:text-gray-500 gap-1">
                    <i class="ph-fill ph-map-pin"></i>
                    <span>${e.loc}</span>
                    <button onclick="state.map.flyTo([${e.lat}, ${e.lng}], 18); switchTab('map');" class="ml-2 text-yellow-600 hover:underline">Zeigen</button>
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

// --- Editing / Admin ---

export function editStation(id) {
    const sId = id || state.activeStationId;
    const s = state.stations.find(x => x.id == sId);
    if (!s) return;

    // Populate fields
    document.getElementById('edit-name').value = s.name;
    document.getElementById('edit-desc').value = s.desc || '';
    document.getElementById('edit-offer').value = s.offer || '';
    document.getElementById('edit-lat').value = s.lat;
    document.getElementById('edit-lng').value = s.lng;
    document.getElementById('edit-tags').value = (s.tags || []).join(', ');
    document.getElementById('edit-time').value = s.time || '';

    // Image preview in edit mode (optional, maybe just text or reusing the main image container)
    // For now we rely on the main image container being visible if set.
    
    // Toggle Views
    document.getElementById('modal-view-mode').classList.add('hidden');
    document.getElementById('modal-edit-mode').classList.remove('hidden');
}

export async function saveStationChanges() {
    const id = state.activeStationId;
    const s = state.stations.find(x => x.id == id);
    if (!s) return;

    const newName = document.getElementById('edit-name').value;
    const newDesc = document.getElementById('edit-desc').value;
    const newOffer = document.getElementById('edit-offer').value;
    // Lat/Lng might have been updated by dragging (we need to ensure drag updates the hidden fields)
    const newLat = parseFloat(document.getElementById('edit-lat').value);
    const newLng = parseFloat(document.getElementById('edit-lng').value);

    if (!newName) {
        showToast("Name darf nicht leer sein", 'error');
        return;
    }

    // Update Local Object
    s.name = newName;
    s.desc = newDesc;
    s.offer = newOffer;
    s.lat = newLat;
    s.lng = newLng;
    
    // Image is handled by handleImageUpload directly updating the object temporarily or we grab it from a temp var?
    // Actually handleImageUpload updates the object directly in memory? Let's assume we update s.image there.
    // If not, we might need a hidden field for image data too. 
    // Let's implement handleImageUpload to update s.image directly on the active station object in state.

    try {
        await saveData('station', s);
        showToast("Station gespeichert", 'success');
        
        // Refresh UI
        renderList(state.stations);
        if (window.refreshMapMarkers) window.refreshMapMarkers(); // Need to import or availability check
        
        // Go back to view mode
        openModal(s); 
    } catch (e) {
        console.error(e);
        showToast("Fehler beim Speichern", 'error');
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
                // Update Preview
                const imgContainer = document.getElementById('modal-image-container');
                imgContainer.innerHTML = `<img src="${s.image}" class="w-full h-48 object-cover rounded-t-2xl">`;
                imgContainer.classList.remove('hidden');
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
    const sId = (id !== undefined && id !== null) ? id : state.activeStationId;
    console.log("shareStation", sId);
    
    const s = state.stations.find(x => x.id == sId);
    if (!s) {
        console.error("Station not found for sharing", sId);
        return;
    }

    const shareData = {
        title: `Lichternacht: ${s.name}`,
        text: `Komm zur Station "${s.name}" bei der Lichternacht Bechhofen!\n${s.offer || ''}`,
        url: window.location.href
    };

    if (navigator.share) {
        navigator.share(shareData).catch(console.error);
    } else {
        // Fallback: Copy to clipboard
        const text = `${shareData.title}\n${shareData.text}\n${shareData.url}`;
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Infos in die Zwischenablage kopiert!', 'success');
            }).catch(err => {
                console.error("Clipboard failed", err);
                showToast('Teilen fehlgeschlagen', 'error');
            });
        } else {
            console.warn("Clipboard API not available");
            showToast('Teilen nicht unterstützt', 'error');
        }
    }
}

export function generateICS() {
    console.log("generateICS called");
}

export function searchAddress() {
    console.log("searchAddress called");
}

export function searchStationAddress() {
    console.log("searchStationAddress called");
}

export function createEventForStation(id) {
    console.log("createEventForStation called", id);
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
