import { state } from './state.js';
import { showToast, getVisitedStationIdSet } from './utils.js?v=1.4.166';
import * as maplibregl from '../vendor/maplibre/maplibre-gl.mjs';

const MAP_STYLES = {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark'
};
const ROUTE_SOURCE_ID = 'active-route';
const ROUTE_LAYER_ID = 'active-route-line';
const PROXIMITY_SOURCE_ID = 'checkin-radius';
const PROXIMITY_FILL_LAYER_ID = 'checkin-radius-fill';
const PROXIMITY_LINE_LAYER_ID = 'checkin-radius-line';
const GPS_ERROR_TOAST_COOLDOWN_MS = 5 * 60 * 1000;
let lastGpsErrorToastAt = 0;
let lastGpsErrorSignature = '';
let timeoutRetryToastShown = false;
let gpsFallbackTimer = null;
let proximityCleanupToken = 0;

function getValidCoordinates(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) return null;
    return { latitude, longitude };
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
        searching: 'Suche…',
        connected: 'Verbunden',
        timeout: 'GPS Timeout',
        denied: 'Standort gesperrt',
        error: 'GPS Fehler'
    };
    if (statusIndicator) statusIndicator.innerText = labels[status] || 'GPS';

    getLocationButtons().forEach(button => {
        const searching = status === 'searching';
        const connected = status === 'connected';
        button.setAttribute('aria-busy', searching ? 'true' : 'false');
        button.setAttribute('aria-label', connected ? 'Standort erneut bestimmen' : 'Eigenen Standort bestimmen');
        button.classList.remove('ring-2', 'ring-blue-500');
        button.classList.toggle('animate-pulse', searching);
        button.dataset.gpsStatus = status;
        button.title = labels[status] || 'Eigenen Standort bestimmen';
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
    state.map = new maplibregl.Map({
        container: 'map',
        style: document.documentElement.classList.contains('dark') ? MAP_STYLES.dark : MAP_STYLES.light,
        center: [10.552, 49.158],
        zoom: 16,
        maxZoom: 20,
        attributionControl: false
    });
    state.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-left');
    state.map.dragRotate.disable();
    state.map.touchZoomRotate.disableRotation();
    state.map.on('style.load', restoreMapOverlays);
    state.map.on('moveend', updateMarkerClusters);
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
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'station-cluster';
        element.textContent = String(group.length);
        element.setAttribute('aria-label', `${group.length} Stationen – hineinzoomen`);
        element.addEventListener('click', () => state.map.flyTo({ center: [center.lng, center.lat], zoom: Math.min(19, state.map.getZoom() + 2), duration: 500 }));
        state.clusterMarkers.push(new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([center.lng, center.lat]).addTo(state.map));
    }
}

export function updateMapTiles(isDark) {
    if (!state.map) return;
    console.log('Update Map Tiles:', isDark ? 'DARK' : 'LIGHT');
    state.map.setStyle(isDark ? MAP_STYLES.dark : MAP_STYLES.light);
}

function restoreMapOverlays() {
    if (state.routeGeometry) renderRoute(state.routeGeometry);
    if (state.proximityCircle) renderProximityCircle(state.proximityCircle);
}

export function refreshMapMarkers() {
    if (!state.map) return;
    clearClusterMarkers();
    state.markers.forEach(m => m.marker.remove());
    state.markers = [];

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
        
        const icon = document.createElement('div');
        icon.className = 'custom-pin';
        icon.innerHTML = `<div class="station-pin ${extraClasses}" style="background-color: ${color}; color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-family: sans-serif; font-size: ${fontSize}; overflow: hidden;">${idStr}</div>`;
        
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
            marker.on('dragend', () => {
                setTimeout(() => { marker._isDragging = false; }, 100); // Debounce click
                const newPos = marker.getLngLat();
                
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
    updateMarkerClusters();
}

export async function locateUser(cb, options = {}) {
    if (!navigator.geolocation) {
        showToast('GPS nicht verfügbar (Browser)', 'error');
        setGpsUiStatus('error');
        return;
    }

    const startedFromUserGesture = options.userInitiated === true || navigator.userActivation?.isActive === true;
    const requestToken = ++state.gpsRequestToken;
    const geolocationStrategy = getGeolocationStrategy();

    if (startedFromUserGesture) {
        await enableCompassFromUserGesture();
        if (requestToken !== state.gpsRequestToken) return;
    }

    const forceCenter = !cb;
    const context = { requestToken, forceCenter, centerApplied: false, cb, cbCalled: false, hasFix: false, watchStarted: false, denied: false };

    clearGpsWatch();
    if (gpsFallbackTimer) clearTimeout(gpsFallbackTimer);
    gpsFallbackTimer = null;
    timeoutRetryToastShown = false;
    setGpsUiStatus('searching');

    const applyPosition = (pos) => {
        if (context.requestToken !== state.gpsRequestToken || !isValidPosition(pos)) return;
        const wasLocated = state.hasLocatedUser === true;
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
        state.userLocation = { lat: userLat, lng: userLng };
        state.gpsAccuracy = Number.isFinite(Number(pos.coords.accuracy)) ? Number(pos.coords.accuracy) : null;
        state.gpsLastFixAt = fixTimestamp;

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

        if (!wasLocated && startedFromUserGesture) {
            showToast(state.compassEnabled
                ? 'Standort erkannt – Kompass ist aktiv.'
                : 'Standort erkannt.', 'success');
        }

        if (window.checkProximity) window.checkProximity(userLat, userLng);
        if (window.refreshStationList) window.refreshStationList();
        if (window.renderTimeline) window.renderTimeline();
    };

    const handleFinalError = (err) => {
        if (context.requestToken !== state.gpsRequestToken) return;
        const denied = err?.code === 1;
        setGpsUiStatus(denied ? 'denied' : 'error');
        if (shouldShowGpsErrorToast(err)) {
            const message = denied
                ? 'Standortzugriff ist blockiert. Öffne die angezeigte Anleitung, um ihn wieder freizugeben.'
                : `Standort konnte nicht ermittelt werden: ${err?.message || 'Unbekannter Fehler'}`;
            console.warn('GPS Error', err);
            showToast(message, 'error');
        }
        if (denied) showLocationPermissionHelp();
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
            fitCoordinates(geometry.coordinates, 70);
        })
        .catch(error => {
            console.error('Route calculation failed', error);
            showToast('Route konnte nicht berechnet werden.', 'error');
        });
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
