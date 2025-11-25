import { state } from './state.js';
import { showToast, setLoading } from './utils.js';
import { openModal } from './ui.js';
import { saveData } from './data.js';

let tileLayer;

export function initMap() {
    state.map = L.map('map', { zoomControl: false }).setView([49.158, 10.552], 16);
    updateMapTiles(document.documentElement.classList.contains('dark'));
}

export function updateMapTiles(isDark) {
    console.log('Update Map Tiles:', isDark ? 'DARK' : 'LIGHT');
    if (tileLayer) state.map.removeLayer(tileLayer);
    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    tileLayer = L.tileLayer(tileUrl, { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }).addTo(state.map);
}

export function refreshMapMarkers() {
    state.markers.forEach(m => state.map.removeLayer(m.marker));
    state.markers = [];
    state.stations.forEach(s => {
        const icon = L.divIcon({ className: 'custom-pin', html: `<div style="background-color: #f59e0b; color: #000; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2); font-family: sans-serif;">${s.id}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
        const marker = L.marker([s.lat, s.lng], { icon: icon, draggable: state.isAdmin }).addTo(state.map);
        marker.on('dragend', async (e) => {
            if (!state.isAdmin) return;
            const p = e.target.getLatLng();
            s.lat = Number(p.lat.toFixed(5)); s.lng = Number(p.lng.toFixed(5));
            await saveData('station', s);
            showToast('Position aktualisiert', 'success');
        });
        marker.on('click', () => openModal(s));
        state.markers.push({ id: s.id, marker: marker });
    });
}

export function locateUser(cb) {
    if (!navigator.geolocation) { showToast("Kein GPS verfügbar", 'error'); return; }
    setLoading(true, "Suche GPS...");
    document.getElementById('status-indicator').innerText = "Suche...";
    navigator.geolocation.getCurrentPosition(async (pos) => {
        setLoading(false);
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        state.userLocation = { lat: userLat, lng: userLng };
        if (state.userMarker) state.userMarker.setLatLng([userLat, userLng]);
        else { const icon = L.divIcon({ html: '<div style="width:18px;height:18px;background:#2563eb;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #2563eb"></div>', className: 'user-loc', iconSize: [18, 18] }); state.userMarker = L.marker([userLat, userLng], { icon: icon }).addTo(state.map); }
        if (!state.routingControl) state.map.setView([userLat, userLng], 18);
        document.getElementById('status-indicator').innerText = "Verbunden"; if (cb) cb();
        showToast("Standort gefunden", 'success');
    }, err => {
        setLoading(false);
        showToast("GPS Fehler: " + err.message, 'error');
        document.getElementById('status-indicator').innerText = "GPS Fehler";
    }, { enableHighAccuracy: true, timeout: 10000 });
}

export function calculateRoute(destLat, destLng) {
    if (!state.userLocation) { showToast("Bitte erst Standort aktivieren!", 'error'); return; }
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
