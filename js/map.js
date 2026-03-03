import { state } from './state.js';
import { showToast, setLoading } from './utils.js';
import { saveData } from './data.js';

let tileLayer;

export function initMap() {
    state.map = L.map('map', { zoomControl: false }).setView([49.158, 10.552], 16);
    updateMapTiles(document.documentElement.classList.contains('dark'));
}

export function updateMapTiles(isDark) {
    if (!state.map) return;
    console.log('Update Map Tiles:', isDark ? 'DARK' : 'LIGHT');
    
    if (tileLayer) {
        state.map.removeLayer(tileLayer);
        tileLayer = null; // Clear reference
    }
    
    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        
    tileLayer = L.tileLayer(tileUrl, { 
        attribution: '&copy; OpenStreetMap &copy; CARTO', 
        maxZoom: 19 
    }).addTo(state.map);
}

export function refreshMapMarkers() {
    state.markers.forEach(m => state.map.removeLayer(m.marker));
    state.markers = [];

    let visitedStations = new Set();
    try {
        const saved = localStorage.getItem('visited_stations');
        if (saved) visitedStations = new Set(JSON.parse(saved));
    } catch (e) { }

    const lastChecked = localStorage.getItem('last_checked_station');

    state.stations.forEach(s => {
        const isActive = state.activeStationId && state.activeStationId === s.id;
        const isVisited = visitedStations.has(s.id);
        const isLastChecked = lastChecked != null && lastChecked.toString() === s.id.toString();
        const color = (isActive || isLastChecked) ? '#1d4ed8' : '#f59e0b';
        const idStr = s.id.toString();
        const fontSize = idStr.length > 3 ? '10px' : '14px';
        const extraClasses = `${isVisited ? 'visited-pin' : ''} ${isLastChecked ? 'checked-pin' : ''}`.trim();
        
        const icon = L.divIcon({
            className: 'custom-pin',
            html: `<div class="station-pin ${extraClasses}" style="background-color: ${color}; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-family: sans-serif; font-size: ${fontSize}; overflow: hidden;">${idStr}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        // Admin: Draggable Markers
        const isDraggable = state.isAdmin;
        const marker = L.marker([s.lat, s.lng], { icon: icon, draggable: isDraggable }).addTo(state.map);
        
        marker.on('click', () => {
            // Prevent click when dragging
            if (marker._isDragging) return;
            if (window.openModal) window.openModal(s);
        });

        if (isDraggable) {
            marker.on('dragstart', () => { marker._isDragging = true; });
            marker.on('dragend', (e) => {
                setTimeout(() => { marker._isDragging = false; }, 100); // Debounce click
                const newPos = e.target.getLatLng();
                
                // Update Local State
                s.lat = newPos.lat;
                s.lng = newPos.lng;
                
                // Update Form if open
                if (state.activeStationId === s.id) {
                    const latInput = document.getElementById('edit-lat');
                    const lngInput = document.getElementById('edit-lng');
                    if (latInput && lngInput) {
                        latInput.value = newPos.lat;
                        lngInput.value = newPos.lng;
                        showToast(`Neue Position: ${newPos.lat.toFixed(4)}, ${newPos.lng.toFixed(4)}`, 'info');
                    }
                }
            });
        }

        state.markers.push({ id: s.id, marker: marker });
    });
}

export function locateUser(cb) {
    if (!navigator.geolocation) {
        showToast('GPS nicht verfügbar (Browser)', 'error');
        return;
    }

    const forceCenter = !cb;

    // Fresh locate attempt: allow one timeout-retry
    if (!cb) {
        state._gpsTimeoutRetried = false;
    }

    setLoading(true, "Suche GPS...");
    document.getElementById('status-indicator').innerText = "Suche...";
    
    // Use watchPosition for continuous updates
    if (state.watchId) navigator.geolocation.clearWatch(state.watchId);
    
    let cbCalled = false;
    state.watchId = navigator.geolocation.watchPosition(
        (pos) => {
            setLoading(false);

            // We got a fix again -> reset timeout retry flag
            state._gpsTimeoutRetried = false;

            const userLat = pos.coords.latitude;
            const userLng = pos.coords.longitude;
            
            // Update State
            state.userLocation = { lat: userLat, lng: userLng };

            // If a callback was provided (e.g. check-in retry), run it once after we have a fix
            if (cb && !cbCalled) {
                cbCalled = true;
                try { cb(); } catch (e) { }
            }
            
            // Update Marker
            if (state.userMarker) {
                state.userMarker.setLatLng([userLat, userLng]);
            } else { 
                const icon = L.divIcon({ html: '<div style="width:18px;height:18px;background:#2563eb;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #2563eb"></div>', className: 'user-loc', iconSize: [18, 18] }); 
                state.userMarker = L.marker([userLat, userLng], { icon: icon, interactive: false, keyboard: false }).addTo(state.map);
            }
            
            // Center map ONLY on first find or if requested? 
            // Better: only if it's the first time we locate or user requested "Locate Me"
            if (!state.hasLocatedUser || forceCenter) {
                 state.map.setView([userLat, userLng], 18);
                 state.hasLocatedUser = true;
            }

            document.getElementById('status-indicator').innerText = "Verbunden"; 
            
            // Update List View Button State (if exists)
            const listLocateBtn = document.querySelector('#view-list button[onclick="locateUser()"]');
            if (listLocateBtn) {
                // User requirement: Hide button if GPS is active/granted
                listLocateBtn.classList.add('hidden');
            }
            
            // Check Proximity
            if (window.checkProximity) window.checkProximity(userLat, userLng);
            
            // Refresh List (to show distances)
            if (window.refreshStationList) window.refreshStationList();
            // Refresh Timeline (to show distances)
            if (window.renderTimeline) window.renderTimeline();

        },
        (err) => {
            setLoading(false);
            console.warn("GPS Watch Error", err);

            // TIMEOUT is common (indoors/first fix). Retry once with relaxed settings.
            if (err && err.code === 3) {
                document.getElementById('status-indicator').innerText = "GPS Timeout";

                if (!state._gpsTimeoutRetried) {
                    state._gpsTimeoutRetried = true;
                    showToast('GPS Timeout – versuche es erneut (ggf. nach draußen gehen)...', 'info');
                    try { if (state.watchId) navigator.geolocation.clearWatch(state.watchId); } catch (e) { }
                    setTimeout(() => locateUser(cb), 400);
                    return;
                }

                showToast('GPS Timeout – kein Signal. Bitte Standort prüfen.', 'error');
                return;
            }

            // User requirement: Show button if GPS denied/error
            const listLocateBtn = document.querySelector('#view-list button[onclick="locateUser()"]');
            if (listLocateBtn) listLocateBtn.classList.remove('hidden');

            document.getElementById('status-indicator').innerText = "GPS Fehler";
            showToast("GPS Fehler: " + (err?.message || err), 'error');
        },
        {
            enableHighAccuracy: state._gpsTimeoutRetried ? false : true,
            timeout: state._gpsTimeoutRetried ? 20000 : 15000,
            maximumAge: state._gpsTimeoutRetried ? 30000 : 5000
        }
    );
}

export function calculateRoute(destLat, destLng) {
    if (!state.userLocation) {
        showToast("GPS wird benötigt – Standort wird aktiviert...", 'info');
        locateUser(() => calculateRoute(destLat, destLng));
        return;
    }
    if (state.routingControl) { state.map.removeControl(state.routingControl); state.routingControl = null; }
    state.routingControl = L.Routing.control({
        waypoints: [L.latLng(state.userLocation.lat, state.userLocation.lng), L.latLng(destLat, destLng)],
        routeWhileDragging: false, show: false, addWaypoints: false, draggableWaypoints: false, fitSelectedRoutes: true,
        lineOptions: { styles: [{ color: '#3b82f6', opacity: 0.7, weight: 5 }] }
    }).addTo(state.map);
    showToast("Route wird berechnet...", 'info');
}

export function resetMap() {
    if (state.stations.length > 0) {
        const bounds = L.latLngBounds(state.stations.map(s => [s.lat, s.lng]));
        state.map.fitBounds(bounds, { padding: [50, 50] });
    } else {
        state.map.setView([49.158, 10.552], 16);
    }
}
