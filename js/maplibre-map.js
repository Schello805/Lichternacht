import { state } from './state.js';
import { showToast, getVisitedStationIdSet } from './utils.js?v=1.4.270';
import { saveData } from './data.js?v=1.4.270';
import * as maplibregl from '../vendor/maplibre/maplibre-gl.mjs';

const MAP_STYLES = {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark'
};
const SATELLITE_STYLE = {
    version: 8,
    sources: {
        'esri-world-imagery': {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: 'Tiles © Esri'
        }
    },
    layers: [{ id: 'esri-world-imagery', type: 'raster', source: 'esri-world-imagery' }]
};
const FALLBACK_RASTER_STYLE = {
    version: 8,
    sources: {
        'fallback-osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap-Mitwirkende'
        }
    },
    layers: [{ id: 'fallback-osm', type: 'raster', source: 'fallback-osm' }]
};
const ROUTE_SOURCE_ID = 'active-route';
const ROUTE_LAYER_ID = 'active-route-line';
const OVERVIEW_ROUTE_SOURCE_ID = 'overview-route';
const OVERVIEW_ROUTE_LAYER_ID = 'overview-route-line';
const PROXIMITY_SOURCE_ID = 'checkin-radius';
const PROXIMITY_FILL_LAYER_ID = 'checkin-radius-fill';
const PROXIMITY_LINE_LAYER_ID = 'checkin-radius-line';
const GPS_ERROR_TOAST_COOLDOWN_MS = 5 * 60 * 1000;
const GPS_AUTO_RESUME_STORAGE_KEY = 'gps_auto_resume_v1';
const GPS_AUTO_RESUME_INTENT_STORAGE_KEY = 'gps_auto_resume_intent_v1';
let lastGpsErrorToastAt = 0;
let lastGpsErrorSignature = '';
let timeoutRetryToastShown = false;
let gpsFallbackTimer = null;
let proximityCleanupToken = 0;
let usingFallbackStyle = false;
let mapFallbackTimer = null;
const MAP_VIEW_STORAGE_KEY = 'map_view_mode_v1';

function isSatelliteView() {
    return localStorage.getItem(MAP_VIEW_STORAGE_KEY) === 'satellite';
}

function getMapStyle(isDark) {
    return isSatelliteView() ? SATELLITE_STYLE : (isDark ? MAP_STYLES.dark : MAP_STYLES.light);
}

function updateMapLayerButton() {
    const button = document.getElementById('map-layer-btn');
    if (!button) return;
    const satellite = isSatelliteView();
    const label = satellite ? 'Kartenansicht einschalten' : 'Satellitenansicht einschalten';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.classList.toggle('bg-yellow-500', satellite);
    button.classList.toggle('text-white', satellite);
    button.classList.toggle('border-yellow-500', satellite);
    button.classList.toggle('bg-white', !satellite);
    button.classList.toggle('text-gray-700', !satellite);
}

function getValidCoordinates(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) return null;
    return { latitude, longitude };
}

function stationOffersRestroom(station) {
    return Array.isArray(station?.tags)
        && station.tags.some(tag => String(tag).trim().toLowerCase() === 'wc');
}

function getStandaloneRestrooms() {
    return Array.isArray(state.config?.standaloneRestrooms)
        ? state.config.standaloneRestrooms.filter(restroom => getValidCoordinates(restroom?.lat, restroom?.lng))
        : [];
}

function getStandaloneParking() {
    return Array.isArray(state.config?.standaloneParking)
        ? state.config.standaloneParking.filter(parking => getValidCoordinates(parking?.lat, parking?.lng))
        : [];
}

function clearStandaloneRestroomMarkers() {
    (state.restroomMarkers || []).forEach(marker => marker.remove());
    state.restroomMarkers = [];
}

function clearStandaloneParkingMarkers() {
    (state.parkingMarkers || []).forEach(marker => marker.remove());
    state.parkingMarkers = [];
}

export function refreshStandaloneRestroomMarkers() {
    clearStandaloneRestroomMarkers();
    if (!state.map) return;

    getStandaloneRestrooms().forEach(restroom => {
        const coordinates = getValidCoordinates(restroom.lat, restroom.lng);
        if (!coordinates) return;
        const element = document.createElement('div');
        element.className = 'standalone-restroom-marker';
        element.title = 'WC';
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', 'WC');
        element.innerHTML = '<span aria-hidden="true">WC</span><span class="sr-only">WC</span>';
        const marker = new maplibregl.Marker({ element, anchor: 'center', draggable: state.isAdmin })
            .setLngLat([coordinates.longitude, coordinates.latitude])
            .addTo(state.map);
        if (state.isAdmin) {
            marker.on('dragend', async () => {
                const position = marker.getLngLat();
                try {
                    await window.moveStandaloneRestroom?.(restroom.id, position.lat, position.lng);
                } catch (error) {
                    marker.setLngLat([coordinates.longitude, coordinates.latitude]);
                }
            });
        }
        state.restroomMarkers.push(marker);
    });
}

export function refreshStandaloneParkingMarkers() {
    clearStandaloneParkingMarkers();
    if (!state.map) return;

    getStandaloneParking().forEach(parking => {
        const coordinates = getValidCoordinates(parking.lat, parking.lng);
        if (!coordinates) return;
        const element = document.createElement('div');
        element.className = 'standalone-parking-marker';
        element.title = 'Parkplatz';
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', 'Parkplatz');
        element.innerHTML = '<span aria-hidden="true">P</span><span class="sr-only">Parkplatz</span>';
        const marker = new maplibregl.Marker({ element, anchor: 'center', draggable: state.isAdmin })
            .setLngLat([coordinates.longitude, coordinates.latitude])
            .addTo(state.map);
        if (state.isAdmin) {
            marker.on('dragend', async () => {
                const position = marker.getLngLat();
                try {
                    await window.moveStandaloneParking?.(parking.id, position.lat, position.lng);
                } catch (error) {
                    marker.setLngLat([coordinates.longitude, coordinates.latitude]);
                }
            });
        }
        state.parkingMarkers.push(marker);
    });
}

function beginStandalonePlacement(onPlace, message) {
    if (!state.map || typeof onPlace !== 'function') return false;
    state.restroomPlacementCancel?.();
    const canvas = state.map.getCanvas();
    canvas.style.cursor = 'crosshair';
    const handlePlace = event => {
        canvas.style.cursor = '';
        state.restroomPlacementCancel = null;
        onPlace({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };
    state.restroomPlacementCancel = () => {
        canvas.style.cursor = '';
        state.map?.off('click', handlePlace);
        state.restroomPlacementCancel = null;
    };
    state.map.once('click', handlePlace);
    showToast(message, 'info');
    return true;
}

export function beginStandaloneRestroomPlacement(onPlace) {
    return beginStandalonePlacement(onPlace, 'Tippe auf die Karte, um das freie WC einzuzeichnen.');
}

export function beginStandaloneParkingPlacement(onPlace) {
    return beginStandalonePlacement(onPlace, 'Tippe auf die Karte, um den Parkplatz einzuzeichnen.');
}

function getUserMarkerIcon() {
    const heading = Number.isFinite(Number(state.compassHeading)) ? Number(state.compassHeading) : 0;
    const headingClass = state.compassEnabled ? 'is-heading-active' : '';
    const headingStyle = state.compassEnabled ? `style="transform: rotate(${heading}deg);"` : '';
    const element = document.createElement('div');
    element.className = 'user-loc';
    element.innerHTML = `<div class="user-location-marker ${headingClass}"><div class="user-location-heading" ${headingStyle}></div><div class="user-location-dot"></div></div>`;
    return element;
}

function updateUserMarkerHeading() {
    if (!state.userMarker) return;
    try {
        const element = state.userMarker.getElement();
        const replacement = getUserMarkerIcon();
        element.innerHTML = replacement.innerHTML;
    } catch (e) { }
}

function normalizeHeading(event) {
    if (Number.isFinite(event.webkitCompassHeading)) {
        return (Number(event.webkitCompassHeading) + 360) % 360;
    }

    const alpha = Number(event.alpha);
    if (Number.isFinite(alpha)) {
        const screenAngle = Number(window.screen?.orientation?.angle ?? window.orientation ?? 0) || 0;
        return (360 - alpha + screenAngle + 360) % 360;
    }

    return null;
}

function handleDeviceOrientation(event) {
    const heading = normalizeHeading(event);
    if (heading == null) return;
    state.compassHeading = heading;
    updateUserMarkerHeading();
}

function shouldShowGpsErrorToast(err) {
    const now = Date.now();
    const signature = `${err?.code || 'unknown'}:${err?.message || ''}`;
    if (signature !== lastGpsErrorSignature || now - lastGpsErrorToastAt > GPS_ERROR_TOAST_COOLDOWN_MS) {
        lastGpsErrorSignature = signature;
        lastGpsErrorToastAt = now;
        return true;
    }
    return false;
}

function showLocationPermissionHelp() {
    let modal = document.getElementById('location-permission-help');
    if (!modal) {
        const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        modal = document.createElement('div');
        modal.id = 'location-permission-help';
        modal.className = 'fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/60 p-3';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'location-permission-title');
        modal.innerHTML = `
            <div class="w-full max-w-md rounded-2xl bg-white p-5 text-gray-900 shadow-2xl dark:bg-gray-800 dark:text-white">
                <h2 id="location-permission-title" class="text-lg font-bold">Standort wieder freigeben</h2>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">Der Browser hat den Standortzugriff für diese Website blockiert. Die App kann diese Einstellung aus Sicherheitsgründen nicht selbst ändern.</p>
                <ol class="mt-4 list-decimal space-y-2 pl-5 text-sm">
                    ${isAppleMobile
                        ? '<li>Tippe links in der Safari-Adressleiste auf das Seitensymbol.</li><li>Öffne „Website-Einstellungen“ und stelle „Standort“ auf „Erlauben“ oder „Fragen“.</li><li>Falls die Auswahl fehlt: Einstellungen → Datenschutz &amp; Sicherheit → Ortungsdienste → Safari-Websites → „Beim Verwenden der App“.</li>'
                        : '<li>Öffne im Browser das Seitenmenü beziehungsweise die Website-Einstellungen.</li><li>Wähle „Berechtigungen“ → „Standort“ → „Zulassen“.</li><li>Lade anschließend diese Seite neu.</li>'}
                </ol>
                <div class="mt-5 grid grid-cols-2 gap-2">
                    <button type="button" data-location-close class="rounded-xl bg-gray-200 px-3 py-3 text-sm font-bold text-gray-800 dark:bg-gray-700 dark:text-white">Schließen</button>
                    <button type="button" data-location-retry class="rounded-xl bg-blue-600 px-3 py-3 text-sm font-bold text-white">Erneut versuchen</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('[data-location-close]').addEventListener('click', () => modal.remove());
        modal.querySelector('[data-location-retry]').addEventListener('click', () => {
            modal.remove();
            locateUser(null, { userInitiated: true });
        });
    }
}

async function enableCompassFromUserGesture() {
    if (state.compassEnabled || state.compassPermissionTried) return;
    if (!window.DeviceOrientationEvent) return;

    try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            state.compassPermissionTried = true;
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== 'granted') return;
        }
    } catch (e) {
        return;
    }

    state.compassPermissionTried = true;
    state.compassListener = handleDeviceOrientation;
    window.addEventListener('deviceorientationabsolute', state.compassListener, true);
    window.addEventListener('deviceorientation', state.compassListener, true);
    state.compassEnabled = true;
    updateUserMarkerHeading();
}

function getLocationButtons() {
    return ['map-locate-btn', 'list-locate-btn']
        .map(id => document.getElementById(id))
        .filter(Boolean);
}

function setGpsUiStatus(status) {
    state.gpsStatus = status;
    const statusIndicator = document.getElementById('status-indicator');
    const labels = {
        idle: 'GPS aus',
        searching: 'Standort wird gesucht',
        connected: 'GPS aktiv',
        timeout: 'Standortsuche läuft weiter',
        denied: 'GPS gesperrt',
        error: 'GPS nicht verfügbar'
    };
    const label = labels[status] || labels.idle;
    if (statusIndicator) statusIndicator.innerText = label;

    ['map-gps-status', 'list-gps-status'].forEach(id => {
        const element = document.getElementById(id);
        if (!element) return;
        element.classList.toggle('hidden', status === 'connected');
        element.textContent = id === 'list-gps-status' && status === 'idle'
            ? `${label} · aktivieren für Entfernung und Gehzeit`
            : label;
        element.classList.toggle('text-green-700', status === 'connected');
        element.classList.toggle('dark:text-green-300', status === 'connected');
        element.classList.toggle('text-orange-700', status === 'searching' || status === 'timeout');
        element.classList.toggle('text-red-700', status === 'denied' || status === 'error');
    });

    getLocationButtons().forEach(button => {
        const searching = status === 'searching';
        const connected = status === 'connected';
        button.setAttribute('aria-busy', searching ? 'true' : 'false');
        button.setAttribute('aria-label', connected ? 'Standort erneut bestimmen' : 'Eigenen Standort bestimmen');
        button.classList.remove(
            'ring-2', 'ring-blue-500',
            'bg-white', 'dark:bg-gray-800', 'text-yellow-600', 'dark:text-yellow-500',
            'bg-blue-600', 'dark:bg-blue-600', 'bg-green-600', 'dark:bg-green-600',
            'text-white', 'border-gray-200', 'dark:border-gray-700',
            'border-blue-700', 'dark:border-blue-500', 'border-green-700', 'dark:border-green-500'
        );
        button.classList.add(
            connected ? 'bg-green-600' : 'bg-blue-600',
            connected ? 'dark:bg-green-600' : 'dark:bg-blue-600',
            'text-white',
            connected ? 'border-green-700' : 'border-blue-700',
            connected ? 'dark:border-green-500' : 'dark:border-blue-500'
        );
        button.classList.toggle('animate-pulse', searching);
        button.dataset.gpsStatus = status;
        button.title = label;
    });
}

function clearGpsWatch() {
    if (state.watchId !== null && state.watchId !== undefined) {
        try { navigator.geolocation.clearWatch(state.watchId); } catch (e) { }
    }
    state.watchId = null;
}

function isValidPosition(position) {
    return Number.isFinite(Number(position?.coords?.latitude))
        && Number.isFinite(Number(position?.coords?.longitude));
}

function getGeolocationStrategy() {
    const userAgent = navigator.userAgent || '';
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
        || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(userAgent));

    return {
        isMobileDevice,
        initial: {
            enableHighAccuracy: false,
            timeout: isMobileDevice ? 15000 : 30000,
            maximumAge: isMobileDevice ? 120000 : 300000
        },
        watch: {
            enableHighAccuracy: isMobileDevice,
            timeout: isMobileDevice ? 30000 : 60000,
            maximumAge: isMobileDevice ? 10000 : 60000
        },
        fallback: {
            enableHighAccuracy: false,
            timeout: isMobileDevice ? 30000 : 60000,
            maximumAge: isMobileDevice ? 120000 : 600000
        }
    };
}

export function initMap() {
    setGpsUiStatus('idle');
    state.map = new maplibregl.Map({
        container: 'map',
        style: getMapStyle(document.documentElement.classList.contains('dark')),
        center: [10.552, 49.158],
        zoom: 16,
        maxZoom: 18,
        attributionControl: false
    });
    state.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-left');
    state.map.once('load', keepMapAttributionCompact);
    state.map.dragRotate.disable();
    state.map.touchZoomRotate.disableRotation();
    state.map.on('style.load', restoreMapOverlays);
    state.map.on('moveend', updateMarkerClusters);
    state.map.on('error', () => applyFallbackMapStyle());
    updateMapLayerButton();
    updateOverviewRouteButton();
    mapFallbackTimer = window.setTimeout(() => {
        if (!state.map?.areTilesLoaded?.()) applyFallbackMapStyle();
    }, 8000);
}

function keepMapAttributionCompact() {
    const attribution = document.querySelector('#map .maplibregl-ctrl-attrib');
    if (!(attribution instanceof HTMLDetailsElement)) return;
    attribution.open = false;
    attribution.addEventListener('toggle', () => {
        if (!attribution.open) return;
        window.setTimeout(() => { attribution.open = false; }, 2500);
    });
}

function applyFallbackMapStyle() {
    if (!state.map || usingFallbackStyle) return;
    usingFallbackStyle = true;
    localStorage.setItem(MAP_VIEW_STORAGE_KEY, 'map');
    if (mapFallbackTimer) window.clearTimeout(mapFallbackTimer);
    mapFallbackTimer = null;
    state.map.setStyle(FALLBACK_RASTER_STYLE);
    updateMapLayerButton();
    showToast('Die Karte wurde im Basismodus geladen.', 'info');
}

function clearClusterMarkers() {
    (state.clusterMarkers || []).forEach(marker => marker.remove());
    state.clusterMarkers = [];
}

function updateMarkerClusters() {
    clearClusterMarkers();
    if (!state.map || state.isAdmin || state.map.getZoom() >= 18 || !Array.isArray(state.markers)) {
        state.markers.forEach(item => { item.marker.getElement().style.display = ''; });
        return;
    }

    const remaining = [...state.markers];
    while (remaining.length) {
        const first = remaining.shift();
        const firstPoint = state.map.project(first.marker.getLngLat());
        const group = [first];
        for (let index = remaining.length - 1; index >= 0; index--) {
            const point = state.map.project(remaining[index].marker.getLngLat());
            if (Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y) <= 46) {
                group.push(remaining.splice(index, 1)[0]);
            }
        }
        if (group.length === 1) {
            first.marker.getElement().style.display = '';
            continue;
        }
        group.forEach(item => { item.marker.getElement().style.display = 'none'; });
        const positions = group.map(item => item.marker.getLngLat());
        const center = positions.reduce((sum, position) => ({ lng: sum.lng + position.lng, lat: sum.lat + position.lat }), { lng: 0, lat: 0 });
        center.lng /= positions.length;
        center.lat /= positions.length;
        const hasRestroom = group.some(item => item.hasRestroom);
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `station-cluster${hasRestroom ? ' has-restroom' : ''}`;
        element.innerHTML = `<span>${group.length}</span>${hasRestroom ? '<span class="station-wc-badge station-cluster-wc-badge" title="WC vorhanden">WC<span class="sr-only"> vorhanden</span></span>' : ''}`;
        element.setAttribute('aria-label', `${group.length} Stationen${hasRestroom ? ', mindestens ein WC vorhanden' : ''} – hineinzoomen`);
        element.addEventListener('click', () => state.map.flyTo({ center: [center.lng, center.lat], zoom: Math.min(19, state.map.getZoom() + 2), duration: 500 }));
        state.clusterMarkers.push(new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([center.lng, center.lat]).addTo(state.map));
    }
}

export function updateMapTiles(isDark) {
    if (!state.map) return;
    console.log('Update Map Tiles:', isSatelliteView() ? 'SATELLITE' : (isDark ? 'DARK' : 'LIGHT'));
    if (usingFallbackStyle) {
        state.map.setStyle(FALLBACK_RASTER_STYLE);
        return;
    }
    state.map.setStyle(getMapStyle(isDark));
    updateMapLayerButton();
}

export function toggleSatelliteView() {
    const satellite = !isSatelliteView();
    localStorage.setItem(MAP_VIEW_STORAGE_KEY, satellite ? 'satellite' : 'map');
    usingFallbackStyle = false;
    if (mapFallbackTimer) window.clearTimeout(mapFallbackTimer);
    mapFallbackTimer = null;
    updateMapTiles(document.documentElement.classList.contains('dark'));
}

function restoreMapOverlays() {
    if (state.routeGeometry) renderRoute(state.routeGeometry);
    if (state.overviewRouteGeometry) renderOverviewRoute(state.overviewRouteGeometry);
    if (state.proximityCircle) renderProximityCircle(state.proximityCircle);
}

export function refreshMapMarkers() {
    if (!state.map) return;
    clearClusterMarkers();
    state.markers.forEach(m => m.marker.remove());
    state.markers = [];
    (state.programMarkers || []).forEach(marker => marker.remove());
    state.programMarkers = [];

    const visitedStations = getVisitedStationIdSet();

    const lastChecked = localStorage.getItem('last_checked_station');

    state.stations.forEach(s => {
        const coordinates = getValidCoordinates(s.lat, s.lng);
        if (!coordinates) return;
        const isActive = state.activeStationId != null && String(state.activeStationId) === String(s.id);
        const isVisited = visitedStations.has(String(s.id));
        const isLastChecked = lastChecked != null && lastChecked.toString() === s.id.toString();
        const color = (isActive || isLastChecked) ? '#1d4ed8' : '#f59e0b';
        const idStr = s.id.toString();
        const fontSize = idStr.length > 3 ? '10px' : '14px';
        const extraClasses = `${isVisited ? 'visited-pin' : ''} ${isLastChecked ? 'checked-pin' : ''}`.trim();
        const hasRestroom = stationOffersRestroom(s);
        
        const icon = document.createElement('div');
        icon.className = 'custom-pin';
        icon.innerHTML = `<div class="station-pin-wrap"><div class="station-pin ${extraClasses}" style="background-color: ${color}; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-family: sans-serif; font-size: ${fontSize}; overflow: hidden;">${idStr}</div>${hasRestroom ? '<span class="station-wc-badge" title="WC vorhanden">WC<span class="sr-only"> vorhanden</span></span>' : ''}</div>`;
        
        // Admin: Draggable Markers
        const isDraggable = state.isAdmin;
        const marker = new maplibregl.Marker({ element: icon, draggable: isDraggable, anchor: 'center' })
            .setLngLat([coordinates.longitude, coordinates.latitude])
            .addTo(state.map);
        
        icon.addEventListener('click', () => {
            // Prevent click when dragging
            if (marker._isDragging) return;
            if (window.openModal) window.openModal(s);
        });

        if (isDraggable) {
            marker.on('dragstart', () => { marker._isDragging = true; });
            marker.on('dragend', async () => {
                setTimeout(() => { marker._isDragging = false; }, 100); // Debounce click
                const newPos = marker.getLngLat();
                const previousLat = s.lat;
                const previousLng = s.lng;
                s.lat = newPos.lat;
                s.lng = newPos.lng;

                if (state.activeStationId === s.id) {
                    const latInput = document.getElementById('edit-lat');
                    const lngInput = document.getElementById('edit-lng');
                    if (latInput && lngInput) {
                        latInput.value = newPos.lat;
                        lngInput.value = newPos.lng;
                    }
                }

                try {
                    await saveData('station', s);
                    showToast(`Station gespeichert: ${newPos.lat.toFixed(5)}, ${newPos.lng.toFixed(5)}`, 'success');
                } catch (error) {
                    s.lat = previousLat;
                    s.lng = previousLng;
                    marker.setLngLat([previousLng, previousLat]);
                    console.error('Station position could not be saved', error);
                    showToast('Neue Position konnte nicht gespeichert werden.', 'error');
                }
            });
        }

        state.markers.push({ id: s.id, marker: marker, hasRestroom });
    });

    state.events
        .filter(event => !String(event.stationId || '').trim())
        .forEach(event => {
            const coordinates = getValidCoordinates(event.lat, event.lng);
            if (!coordinates) return;

            const icon = document.createElement('button');
            icon.type = 'button';
            icon.className = 'program-pin';
        icon.innerHTML = '<span>E</span>';
        icon.title = `Eigenständiges Event: ${event.title || 'Details öffnen'}`;
            icon.setAttribute('aria-label', icon.title);
            icon.addEventListener('click', () => {
                if (!marker._isDragging) window.openProgramEvent?.(event.id);
            });

            const marker = new maplibregl.Marker({ element: icon, anchor: 'center', draggable: state.isAdmin })
                .setLngLat([coordinates.longitude, coordinates.latitude])
                .addTo(state.map);
            if (state.isAdmin) {
                marker.on('dragstart', () => { marker._isDragging = true; });
                marker.on('dragend', async () => {
                    window.setTimeout(() => { marker._isDragging = false; }, 100);
                    const position = marker.getLngLat();
                    const previousLat = event.lat;
                    const previousLng = event.lng;
                    event.lat = position.lat;
                    event.lng = position.lng;
                    try {
                        await saveData('event', event);
                        showToast(`Programmpunkt verschoben: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`, 'success');
                    } catch (error) {
                        event.lat = previousLat;
                        event.lng = previousLng;
                        marker.setLngLat([previousLng, previousLat]);
                        console.error('Program position could not be saved', error);
                        showToast('Neue Position konnte nicht gespeichert werden.', 'error');
                    }
                });
            }
            state.programMarkers.push(marker);
        });
    updateMarkerClusters();
    refreshStandaloneRestroomMarkers();
    refreshStandaloneParkingMarkers();
}

export async function resumeGrantedLocation() {
    if (!navigator.geolocation || navigator.webdriver || state.userLocation) return false;
    const wasActivated = localStorage.getItem(GPS_AUTO_RESUME_STORAGE_KEY) === 'true' ||
        localStorage.getItem(GPS_AUTO_RESUME_INTENT_STORAGE_KEY) === 'true';
    if (!wasActivated) return false;

    let permission = null;
    try {
        permission = navigator.permissions?.query
            ? await navigator.permissions.query({ name: 'geolocation' })
            : null;
    } catch (error) { }
    if (permission?.state && permission.state !== 'granted') return false;

    await locateUser(() => {}, { userInitiated: false, forceCenter: false });
    return true;
}

export async function locateUser(cb, options = {}) {
    if (!navigator.geolocation) {
        showToast('GPS nicht verfügbar (Browser)', 'error');
        setGpsUiStatus('error');
        return;
    }

    const startedFromUserGesture = options.userInitiated === true ||
        (options.userInitiated !== false && navigator.userActivation?.isActive === true);
    const requestToken = ++state.gpsRequestToken;
    const geolocationStrategy = getGeolocationStrategy();

    if (startedFromUserGesture) {
        localStorage.setItem(GPS_AUTO_RESUME_INTENT_STORAGE_KEY, 'true');
        await enableCompassFromUserGesture();
        if (requestToken !== state.gpsRequestToken) return;
    }

    const forceCenter = options.forceCenter === true || (!cb && options.forceCenter !== false);
    const context = { requestToken, forceCenter, centerApplied: false, cb, cbCalled: false, hasFix: false, watchStarted: false, denied: false };

    clearGpsWatch();
    if (gpsFallbackTimer) clearTimeout(gpsFallbackTimer);
    gpsFallbackTimer = null;
    timeoutRetryToastShown = false;
    setGpsUiStatus('searching');

    const applyPosition = (pos) => {
        if (context.requestToken !== state.gpsRequestToken || !isValidPosition(pos)) return;
        context.hasFix = true;
        context.denied = false;
        setGpsUiStatus('connected');
        lastGpsErrorSignature = '';
        lastGpsErrorToastAt = 0;
        timeoutRetryToastShown = false;

        const userLat = Number(pos.coords.latitude);
        const userLng = Number(pos.coords.longitude);
        const fixTimestamp = Number.isFinite(Number(pos.timestamp)) ? Number(pos.timestamp) : Date.now();
        const isFreshFix = Date.now() - fixTimestamp <= 60000;
        const hadUserLocation = Boolean(state.userLocation);
        state.userLocation = { lat: userLat, lng: userLng };
        state.gpsAccuracy = Number.isFinite(Number(pos.coords.accuracy)) ? Number(pos.coords.accuracy) : null;
        state.gpsLastFixAt = fixTimestamp;
        localStorage.setItem(GPS_AUTO_RESUME_STORAGE_KEY, 'true');
        localStorage.setItem(GPS_AUTO_RESUME_INTENT_STORAGE_KEY, 'true');
        advanceOverviewNavigationIfReached(userLat, userLng);

        if (context.cb && !context.cbCalled && isFreshFix) {
            context.cbCalled = true;
            try { context.cb(); } catch (e) { }
        }

        if (state.userMarker) {
            state.userMarker.setLngLat([userLng, userLat]);
            updateUserMarkerHeading();
        } else if (state.map) {
            state.userMarker = new maplibregl.Marker({ element: getUserMarkerIcon(), anchor: 'center' })
                .setLngLat([userLng, userLat])
                .addTo(state.map);
            state.userMarker.getElement().style.zIndex = '10000';
            state.userMarker.getElement().style.pointerEvents = 'none';
        }

        if (state.map && !context.centerApplied && (!state.hasLocatedUser || context.forceCenter)) {
            context.centerApplied = true;
            state.map.flyTo({ center: [userLng, userLat], zoom: Math.max(state.map.getZoom(), 18) });
            state.hasLocatedUser = true;
        }

        if (window.checkProximity) window.checkProximity(userLat, userLng);
        if (!hadUserLocation && window.refreshStationList) window.refreshStationList();
        else if (window.updateStationDistances) window.updateStationDistances();
        if (window.renderTimeline) window.renderTimeline();
    };

    const handleFinalError = (err) => {
        if (context.requestToken !== state.gpsRequestToken) return;
        const denied = err?.code === 1;
        if (denied) {
            localStorage.removeItem(GPS_AUTO_RESUME_STORAGE_KEY);
            localStorage.removeItem(GPS_AUTO_RESUME_INTENT_STORAGE_KEY);
        }
        setGpsUiStatus(denied ? 'denied' : 'error');
        if (shouldShowGpsErrorToast(err)) {
            const message = denied
                ? 'Standortzugriff ist blockiert. Öffne die angezeigte Anleitung, um ihn wieder freizugeben.'
                : `Standort konnte nicht ermittelt werden: ${err?.message || 'Unbekannter Fehler'}`;
            console.warn('GPS Error', err);
            showToast(message, 'error');
        }
        if (denied && startedFromUserGesture) showLocationPermissionHelp();
    };

    const startRelaxedFallback = () => {
        if (context.denied || context.requestToken !== state.gpsRequestToken || gpsFallbackTimer) return;
        gpsFallbackTimer = setTimeout(() => {
            gpsFallbackTimer = null;
            navigator.geolocation.getCurrentPosition(
                applyPosition,
                (err) => {
                    if (!context.hasFix && err?.code === 1) handleFinalError(err);
                },
                geolocationStrategy.fallback
            );
        }, 600);
    };

    const handleWatchError = (err) => {
        if (context.requestToken !== state.gpsRequestToken) return;
        if (err?.code === 1) {
            context.denied = true;
            clearGpsWatch();
            handleFinalError(err);
            return;
        }

        setGpsUiStatus(context.hasFix ? 'connected' : 'timeout');
        const shouldNotify = shouldShowGpsErrorToast(err);
        if (shouldNotify) console.warn('GPS Watch Error', err);
        if (!context.hasFix && shouldNotify && !timeoutRetryToastShown) {
            timeoutRetryToastShown = true;
            showToast(geolocationStrategy.isMobileDevice
                ? 'Standortsignal ist noch ungenau – die Suche läuft weiter.'
                : 'Der Desktop-Standortdienst antwortet noch nicht – die WLAN-Ortung läuft weiter.', 'info');
        }
        startRelaxedFallback();
    };

    const startWatch = () => {
        if (context.watchStarted || context.denied || context.requestToken !== state.gpsRequestToken) return;
        context.watchStarted = true;
        state.watchId = navigator.geolocation.watchPosition(
            applyPosition,
            handleWatchError,
            geolocationStrategy.watch
        );
    };

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            applyPosition(pos);
            startWatch();
        },
        (err) => {
            if (context.requestToken !== state.gpsRequestToken) return;
            if (err?.code === 1) {
                context.denied = true;
                clearGpsWatch();
                handleFinalError(err);
                return;
            }
            startWatch();
            startRelaxedFallback();
        },
        geolocationStrategy.initial
    );

    // Do not wait for the initial one-shot lookup before starting continuous tracking.
    setTimeout(startWatch, 1200);
}

export function calculateRoute(destLat, destLng) {
    const destination = getValidCoordinates(destLat, destLng);
    if (!destination) {
        showToast('Für diese Station ist keine gültige Kartenposition hinterlegt.', 'error');
        return;
    }
    if (!state.userLocation) {
        showToast("GPS wird benötigt – Standort wird aktiviert...", 'info');
        locateUser(() => calculateRoute(destLat, destLng));
        return;
    }
    clearOverviewRoute();
    showToast("Route wird berechnet...", 'info');
    const start = `${state.userLocation.lng},${state.userLocation.lat}`;
    const end = `${destination.longitude},${destination.latitude}`;
    fetch(`https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson`)
        .then(response => {
            if (!response.ok) throw new Error('Routing-Dienst nicht erreichbar');
            return response.json();
        })
        .then(result => {
            const geometry = result.routes?.[0]?.geometry;
            if (!geometry) throw new Error('Keine Route gefunden');
            state.routeGeometry = geometry;
            renderRoute(geometry);
            hideRouteInfo();
            fitCoordinates(geometry.coordinates, 70);
        })
        .catch(error => {
            console.error('Route calculation failed', error);
            showToast('Route konnte nicht berechnet werden.', 'error');
        });
}

export function clearRoute() {
    state.routeGeometry = null;
    if (!state.map) return;
    try {
        if (state.map.getLayer(ROUTE_LAYER_ID)) state.map.removeLayer(ROUTE_LAYER_ID);
        if (state.map.getSource(ROUTE_SOURCE_ID)) state.map.removeSource(ROUTE_SOURCE_ID);
    } catch (error) {
        console.warn('Route could not be cleared', error);
    }
    if (state.overviewRouteGeometry) clearOverviewRoute();
    hideRouteInfoIfUnused();
}

function setRouteInfo(title, detail) {
    const routeInfo = document.getElementById('route-info');
    const mapView = document.getElementById('view-map');
    const titleElement = document.getElementById('route-info-title');
    const detailElement = document.getElementById('route-info-detail');
    if (titleElement) titleElement.textContent = title;
    if (detailElement) detailElement.textContent = detail;
    document.getElementById('overview-route-navigation-btn')?.classList.add('hidden');
    document.getElementById('overview-route-skip-btn')?.classList.add('hidden');
    mapView?.classList.add('route-info-visible');
    routeInfo?.classList.remove('hidden');
}

function hideRouteInfoIfUnused() {
    if (state.routeGeometry || state.overviewRouteGeometry) return;
    hideRouteInfo();
}

function hideRouteInfo() {
    document.getElementById('route-info')?.classList.add('hidden');
    document.getElementById('view-map')?.classList.remove('route-info-visible');
}

function updateOverviewRouteButton() {
    const button = document.getElementById('map-overview-route-btn');
    if (!button) return;
    const active = Boolean(state.overviewRouteGeometry);
    const label = active ? 'Rundweg anpassen' : 'Rundweg planen';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.classList.remove('bg-yellow-500', 'text-white', 'border-yellow-500', 'bg-white', 'text-yellow-600');
    button.classList.add(active ? 'bg-yellow-500' : 'bg-white', active ? 'text-white' : 'text-yellow-600');
    if (active) button.classList.add('border-yellow-500');
}

function getDistanceMeters(start, end) {
    const radians = Math.PI / 180;
    const latitudeDelta = (end[1] - start[1]) * radians;
    const longitudeDelta = (end[0] - start[0]) * radians;
    const latitudeStart = start[1] * radians;
    const latitudeEnd = end[1] * radians;
    const value = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(latitudeStart) * Math.cos(latitudeEnd) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function buildOverviewRoundTrip(stationIds = null) {
    const selectedIds = Array.isArray(stationIds) ? new Set(stationIds.map(String)) : null;
    const stations = state.stations
        .filter(station => !selectedIds || selectedIds.has(String(station.id)))
        .map(station => {
            const coordinates = getValidCoordinates(station.lat, station.lng);
            return coordinates ? { station, coordinates: [coordinates.longitude, coordinates.latitude] } : null;
        })
        .filter(Boolean)
        .sort((a, b) => Number(a.station.id) - Number(b.station.id));
    if (stations.length < 2) return { coordinates: [], stations: [] };

    const remaining = [...stations];
    const ordered = [remaining.shift()];
    while (remaining.length) {
        const current = ordered[ordered.length - 1].coordinates;
        let nextIndex = 0;
        let nearestDistance = Infinity;
        remaining.forEach((candidate, index) => {
            const distance = getDistanceMeters(current, candidate.coordinates);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nextIndex = index;
            }
        });
        ordered.push(remaining.splice(nextIndex, 1)[0]);
    }
    return {
        coordinates: [...ordered.map(item => item.coordinates), ordered[0].coordinates],
        stations: ordered.map(item => item.station)
    };
}

function formatRouteDistance(distanceMeters) {
    return distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${Math.round(distanceMeters)} m`;
}

function formatRouteDuration(durationSeconds) {
    const minutes = Math.max(1, Math.round(durationSeconds / 60));
    if (minutes < 60) return `ca. ${minutes} Min.`;
    return `ca. ${Math.floor(minutes / 60)} Std. ${minutes % 60} Min.`;
}

function clearOverviewRoute() {
    state.overviewRouteRequestId += 1;
    state.overviewRouteGeometry = null;
    state.overviewRouteStations = [];
    state.overviewRouteNavigationIndex = 0;
    state.overviewRouteNavigationActive = false;
    state.overviewRouteNavigationProgress = 0;
    state.overviewRouteSummary = '';
    (state.overviewRouteMarkers || []).forEach(marker => marker.remove());
    state.overviewRouteMarkers = [];
    if (state.map) {
        try {
            if (state.map.getLayer(OVERVIEW_ROUTE_LAYER_ID)) state.map.removeLayer(OVERVIEW_ROUTE_LAYER_ID);
            if (state.map.getSource(OVERVIEW_ROUTE_SOURCE_ID)) state.map.removeSource(OVERVIEW_ROUTE_SOURCE_ID);
        } catch (error) {
            console.warn('Overview route could not be cleared', error);
        }
    }
    updateOverviewRouteButton();
    hideRouteInfoIfUnused();
}

function renderOverviewRoute(geometry) {
    setGeoJsonLayer(OVERVIEW_ROUTE_SOURCE_ID, [{
        id: OVERVIEW_ROUTE_LAYER_ID,
        type: 'line',
        source: OVERVIEW_ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#f59e0b', 'line-opacity': 0.9, 'line-width': 5, 'line-dasharray': [1.5, 1] }
    }], { type: 'Feature', properties: {}, geometry });
}

function updateOverviewRouteNavigationButton() {
    const button = document.getElementById('overview-route-navigation-btn');
    const skipButton = document.getElementById('overview-route-skip-btn');
    const detailElement = document.getElementById('route-info-detail');
    const stations = state.overviewRouteStations || [];
    if (!button || !state.overviewRouteGeometry || !stations.length) return;
    const index = state.overviewRouteNavigationIndex % stations.length;
    const station = stations[index];
    if (detailElement) detailElement.textContent = `${state.overviewRouteSummary} · Nächste: #${station.id} ${station.name || ''}`;
    button.innerHTML = state.overviewRouteNavigationActive
        ? '<i class="ph ph-navigation-arrow"></i> Rundweg läuft'
        : '<i class="ph ph-navigation-arrow"></i> Rundweg starten';
    button.disabled = state.overviewRouteNavigationActive;
    button.classList.toggle('opacity-75', state.overviewRouteNavigationActive);
    button.classList.remove('hidden');
    skipButton?.classList.toggle('hidden', !state.overviewRouteNavigationActive);
}

export function startOverviewNavigation() {
    const stations = state.overviewRouteStations || [];
    if (!stations.length) {
        showToast('Erstelle zuerst einen Rundweg.', 'info');
        return;
    }
    const beginNavigation = () => {
        if (state.userLocation) {
            const userCoordinates = [state.userLocation.lng, state.userLocation.lat];
            state.overviewRouteNavigationIndex = stations.reduce((bestIndex, station, index) => {
                const best = getValidCoordinates(stations[bestIndex].lat, stations[bestIndex].lng);
                const current = getValidCoordinates(station.lat, station.lng);
                if (!best || !current) return bestIndex;
                return getDistanceMeters(userCoordinates, [current.longitude, current.latitude]) < getDistanceMeters(userCoordinates, [best.longitude, best.latitude]) ? index : bestIndex;
            }, 0);
        }
        state.overviewRouteNavigationActive = true;
        state.overviewRouteNavigationProgress = 0;
        updateOverviewRouteNavigationButton();
    };
    if (state.userLocation) beginNavigation();
    else {
        const gpsWasAlreadyActivated = localStorage.getItem(GPS_AUTO_RESUME_STORAGE_KEY) === 'true' ||
            localStorage.getItem(GPS_AUTO_RESUME_INTENT_STORAGE_KEY) === 'true';
        locateUser(beginNavigation, { userInitiated: !gpsWasAlreadyActivated, forceCenter: false });
    }
}

function advanceOverviewNavigation() {
    const stations = state.overviewRouteStations || [];
    if (!state.overviewRouteNavigationActive || !stations.length) return;
    state.overviewRouteNavigationProgress += 1;
    if (state.overviewRouteNavigationProgress >= stations.length) {
        state.overviewRouteNavigationActive = false;
        updateOverviewRouteNavigationButton();
        showToast('Rundweg abgeschlossen. Viel Spaß beim weiteren Entdecken!', 'success');
        return;
    }
    state.overviewRouteNavigationIndex = (state.overviewRouteNavigationIndex + 1) % stations.length;
    updateOverviewRouteNavigationButton();
}

export function skipOverviewNavigationStation() {
    if (!state.overviewRouteNavigationActive) return;
    advanceOverviewNavigation();
}

function advanceOverviewNavigationIfReached(latitude, longitude) {
    if (!state.overviewRouteNavigationActive) return;
    const stations = state.overviewRouteStations || [];
    const station = stations[state.overviewRouteNavigationIndex % stations.length];
    const coordinates = station && getValidCoordinates(station.lat, station.lng);
    if (!coordinates) return;
    if (getDistanceMeters([longitude, latitude], [coordinates.longitude, coordinates.latitude]) <= 65) advanceOverviewNavigation();
}

export async function toggleOverviewRoute(stationIds = null) {
    if (state.overviewRouteGeometry && stationIds === null) {
        clearOverviewRoute();
        return;
    }

    if (state.overviewRouteGeometry) clearOverviewRoute();
    const overview = buildOverviewRoundTrip(stationIds);
    const coordinates = overview.coordinates;
    if (coordinates.length < 3) {
        showToast('Für einen Rundweg werden mindestens zwei Stationen mit Kartenposition benötigt.', 'info');
        return;
    }

    clearRoute();
    const requestId = state.overviewRouteRequestId + 1;
    state.overviewRouteRequestId = requestId;
    setRouteInfo('Rundweg wird berechnet', `${coordinates.length - 1} Stationen werden verbunden`);
    const fallbackDistance = coordinates.slice(1).reduce((total, coordinate, index) => total + getDistanceMeters(coordinates[index], coordinate), 0) * 1.25;
    const fallbackDuration = fallbackDistance / 1.25;
    let geometry = { type: 'LineString', coordinates };
    let distance = fallbackDistance;
    let duration = fallbackDuration;
    let estimated = true;

    try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        const routeCoordinates = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
        const response = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${routeCoordinates}?overview=full&geometries=geojson`, { signal: controller.signal });
        window.clearTimeout(timeout);
        if (!response.ok) throw new Error('Rundweg-Dienst nicht erreichbar');
        const result = await response.json();
        const route = result.routes?.[0];
        if (!route?.geometry?.coordinates?.length) throw new Error('Kein Rundweg gefunden');
        geometry = route.geometry;
        distance = Number(route.distance) || fallbackDistance;
        duration = Number(route.duration) || fallbackDuration;
        estimated = false;
    } catch (error) {
        console.warn('Overview route fallback', error);
    }

    if (requestId !== state.overviewRouteRequestId) return;
    state.overviewRouteGeometry = geometry;
    state.overviewRouteStations = overview.stations;
    state.overviewRouteNavigationIndex = 0;
    state.overviewRouteNavigationActive = false;
    state.overviewRouteNavigationProgress = 0;
    renderOverviewRoute(geometry);
    updateOverviewRouteButton();
    const prefix = estimated ? 'Geschätzt: ' : '';
    state.overviewRouteSummary = `${prefix}${formatRouteDistance(distance)} · ${formatRouteDuration(duration)}`;
    setRouteInfo(`Rundweg · ${coordinates.length - 1} Stationen`, state.overviewRouteSummary);
    updateOverviewRouteNavigationButton();
    fitCoordinates(geometry.coordinates, 70);
}

export function resetMap() {
    if (!state.map) return;
    if (state.stations.length > 0) {
        fitCoordinates(state.stations
            .map(station => getValidCoordinates(station.lat, station.lng))
            .filter(Boolean)
            .map(coordinates => [coordinates.longitude, coordinates.latitude]), 50);
    } else {
        state.map.flyTo({ center: [10.552, 49.158], zoom: 16 });
    }
}

function setGeoJsonLayer(sourceId, layers, data) {
    if (!state.map) return;
    const addLayer = () => {
        const source = state.map.getSource(sourceId);
        if (source) source.setData(data);
        else state.map.addSource(sourceId, { type: 'geojson', data });
        layers.forEach(layer => {
            if (!state.map.getLayer(layer.id)) state.map.addLayer(layer);
        });
    };
    try {
        addLayer();
    } catch (error) {
        if (!String(error?.message || error).includes('Style is not done loading')) throw error;
        state.map.once('style.load', addLayer);
    }
}

function renderRoute(geometry) {
    setGeoJsonLayer(ROUTE_SOURCE_ID, [{
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-opacity': 0.8, 'line-width': 5 }
    }], { type: 'Feature', properties: {}, geometry });
}

function fitCoordinates(coordinates, padding = 50) {
    if (!state.map || !Array.isArray(coordinates)) return;
    const valid = coordinates.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
    if (!valid.length) return;
    const bounds = valid.reduce((result, coordinate) => result.extend(coordinate), new maplibregl.LngLatBounds(valid[0], valid[0]));
    state.map.fitBounds(bounds, { padding, maxZoom: 18, duration: 700 });
}

function createCircleGeometry(lat, lng, radiusMeters, points = 64) {
    const earthRadius = 6378137;
    const latitude = Number(lat) * Math.PI / 180;
    const coordinates = [];
    for (let index = 0; index <= points; index++) {
        const angle = index / points * Math.PI * 2;
        const offsetLat = radiusMeters * Math.sin(angle) / earthRadius;
        const offsetLng = radiusMeters * Math.cos(angle) / (earthRadius * Math.cos(latitude));
        coordinates.push([Number(lng) + offsetLng * 180 / Math.PI, Number(lat) + offsetLat * 180 / Math.PI]);
    }
    return { type: 'Polygon', coordinates: [coordinates] };
}

function renderProximityCircle(circle) {
    const data = { type: 'Feature', properties: {}, geometry: createCircleGeometry(circle.lat, circle.lng, circle.radius) };
    setGeoJsonLayer(PROXIMITY_SOURCE_ID, [
        { id: PROXIMITY_FILL_LAYER_ID, type: 'fill', source: PROXIMITY_SOURCE_ID, paint: { 'fill-color': '#ff0033', 'fill-opacity': 0.2 } },
        { id: PROXIMITY_LINE_LAYER_ID, type: 'line', source: PROXIMITY_SOURCE_ID, paint: { 'line-color': '#dc2626', 'line-width': 2 } }
    ], data);
}

export function showProximityRadius(station, userLocation, radius = 25) {
    if (!state.map) return;
    const stationCoordinates = getValidCoordinates(station?.lat, station?.lng);
    const userCoordinates = getValidCoordinates(userLocation?.lat, userLocation?.lng);
    if (!stationCoordinates || !userCoordinates) return;
    const cleanupToken = ++proximityCleanupToken;
    state.proximityCircle = { lat: Number(station.lat), lng: Number(station.lng), radius };
    renderProximityCircle(state.proximityCircle);
    fitCoordinates([[stationCoordinates.longitude, stationCoordinates.latitude], [userCoordinates.longitude, userCoordinates.latitude]], 50);
    setTimeout(() => {
        if (cleanupToken !== proximityCleanupToken) return;
        [PROXIMITY_FILL_LAYER_ID, PROXIMITY_LINE_LAYER_ID].forEach(id => {
            if (state.map?.getLayer(id)) state.map.removeLayer(id);
        });
        if (state.map?.getSource(PROXIMITY_SOURCE_ID)) state.map.removeSource(PROXIMITY_SOURCE_ID);
        state.proximityCircle = null;
    }, 5000);
}
